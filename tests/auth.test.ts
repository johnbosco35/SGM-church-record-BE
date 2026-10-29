import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api, clearDb, loginAs, PASSWORD, startDb, stopDb } from "./helpers";

let app: Express;
beforeAll(async () => {
  await startDb();
  app = (await import("../src/app")).createApp();
});
afterAll(stopDb);
beforeEach(clearDb);

const cookieValue = (res: request.Response, name: string): string | undefined =>
  (res.headers["set-cookie"] as unknown as string[])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

describe("authentication", () => {
  it("logs in with HttpOnly auth cookies and a readable csrf cookie", async () => {
    const { User } = await import("../src/models/User");
    const bcrypt = (await import("bcryptjs")).default;
    await User.create({
      name: "A",
      email: "a@test.invalid",
      role: "admin",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    });
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "a@test.invalid", password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const access = cookies.find((c) => c.startsWith("access_token="))!;
    const refresh = cookies.find((c) => c.startsWith("refresh_token="))!;
    const csrf = cookies.find((c) => c.startsWith("csrf_token="))!;
    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|access_token/);
  });

  it("rejects bad credentials with a generic message", async () => {
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "nobody@test.invalid", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks the account after repeated failures", async () => {
    const s = await loginAs(app, "customer_care", "lock@test.invalid");
    void s;
    for (let i = 0; i < 5; i++)
      await request(app)
        .post(`${api}/auth/login`)
        .send({ email: "lock@test.invalid", password: "wrong-password" });
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "lock@test.invalid", password: PASSWORD });
    expect(res.status).toBe(423);
  });

  it("requires authentication and blocks unsafe requests without a CSRF token", async () => {
    expect((await request(app).get(`${api}/users`)).status).toBe(401);
    const admin = await loginAs(app, "admin");
    const noCsrf = await admin.agent
      .post(`${api}/users`)
      .send({
        name: "X Y",
        email: "x@test.invalid",
        password: PASSWORD,
        role: "customer_care",
      });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe("CSRF_FAILED");
    const evil = await admin.agent
      .post(`${api}/users`)
      .set("X-CSRF-Token", admin.csrf)
      .set("Origin", "https://evil.example")
      .send({});
    expect(evil.status).toBe(403);
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const { User } = await import("../src/models/User");
    const bcrypt = (await import("bcryptjs")).default;
    await User.create({
      name: "R",
      email: "r@test.invalid",
      role: "admin",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    });
    const login = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "r@test.invalid", password: PASSWORD });
    const oldRefresh = cookieValue(login, "refresh_token")!;
    const csrf = cookieValue(login, "csrf_token")!;
    const call = (rt: string) =>
      request(app)
        .post(`${api}/auth/refresh`)
        .set("Cookie", [`refresh_token=${rt}`, `csrf_token=${csrf}`])
        .set("X-CSRF-Token", csrf);

    const first = await call(oldRefresh);
    expect(first.status).toBe(200);
    const newRefresh = cookieValue(first, "refresh_token")!;
    expect(newRefresh).not.toBe(oldRefresh);

    expect((await call(oldRefresh)).status).toBe(401); // reuse detected
    expect((await call(newRefresh)).status).toBe(401); // whole family revoked
  });

  it("logout revokes the refresh token", async () => {
    const s = await loginAs(app, "admin");
    expect((await s.post(`${api}/auth/logout`)).status).toBe(200);
    expect((await s.get(`${api}/auth/me`)).status).toBe(401);
  });

  it("public registration is disabled by default", async () => {
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({
        name: "New Person",
        email: "n@test.invalid",
        password: PASSWORD,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REGISTRATION_DISABLED");
  });
});

describe("authorization and user management", () => {
  it("only admins manage users", async () => {
    const care = await loginAs(app, "customer_care");
    expect((await care.get(`${api}/users`)).status).toBe(403);
    const priest = await loginAs(app, "parish_priest");
    expect(
      (
        await priest.post(`${api}/users`, {
          name: "X Y",
          email: "q@test.invalid",
          password: PASSWORD,
          role: "admin",
        })
      ).status,
    ).toBe(403);
  });

  it("admin creates staff, and cannot create a privileged role outside the allowed list", async () => {
    const admin = await loginAs(app, "admin");
    const ok = await admin.post(`${api}/users`, {
      name: "Care One",
      email: "care1@test.invalid",
      password: PASSWORD,
      role: "customer_care",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.passwordHash).toBeUndefined();
    const bad = await admin.post(`${api}/users`, {
      name: "Care Two",
      email: "care2@test.invalid",
      password: PASSWORD,
      role: "superuser",
    });
    expect(bad.status).toBe(400);
  });

  it("the last active admin cannot be demoted, and role changes revoke sessions", async () => {
    const admin = await loginAs(app, "admin");
    expect(
      (await admin.patch(`${api}/users/${admin.id}`, { role: "customer_care" }))
        .status,
    ).toBe(422);
    const care = await loginAs(app, "customer_care");
    expect(
      (await admin.patch(`${api}/users/${care.id}`, { isActive: false }))
        .status,
    ).toBe(200);
    expect((await care.get(`${api}/auth/me`)).status).toBe(401);
  });
});
