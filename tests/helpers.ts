import bcrypt from "bcryptjs";
import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let mongod: MongoMemoryServer | undefined;

/** Isolated test database. Set MONGODB_URI_TEST to reuse an existing server instead of downloading mongod. */
export async function startDb(): Promise<void> {
  if (process.env.MONGODB_URI_TEST) {
    await mongoose.connect(process.env.MONGODB_URI_TEST, {
      dbName: `church_test_${process.pid}_${Date.now()}`,
    });
  } else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
}

export async function stopDb(): Promise<void> {
  if (mongoose.connection.readyState) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod?.stop();
}

/** Uses the native driver so the model-level delete guards (which protect real data) don't block test cleanup. */
export async function clearDb(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
}

export type Role = "admin" | "parish_priest" | "customer_care" | "member";
export const PASSWORD = "TestPassw0rd!";

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  id: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

export async function loginAs(
  app: Express,
  role: Role,
  email = `${role}-${Math.random().toString(36).slice(2, 8)}@test.invalid`,
): Promise<Session> {
  const { User } = await import("../src/models/User");
  const user = await User.create({
    name: `Test ${role}`,
    email,
    role,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.data.csrfToken as string;
  return {
    agent,
    csrf,
    id: String(user._id),
    get: (u) => agent.get(u),
    post: (u, b = {}) => agent.post(u).set("X-CSRF-Token", csrf).send(b),
    patch: (u, b = {}) => agent.patch(u).set("X-CSRF-Token", csrf).send(b),
    put: (u, b = {}) => agent.put(u).set("X-CSRF-Token", csrf).send(b),
    del: (u) => agent.delete(u).set("X-CSRF-Token", csrf),
  };
}

export const api = "/api/v1";

export const binaryParser = (
  res: NodeJS.ReadableStream,
  cb: (err: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

/** 1x1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Fully synthetic data. Never use real parish records in fixtures. */
export const sampleBaptism = (over: Record<string, unknown> = {}) => ({
  number: "T-001",
  dateOfBaptism: "2001-04-15",
  placeOfBaptism: "Test Chapel",
  baptismalName: "Testa",
  surname: "Fixture",
  dateOfBirth: "2001-03-01",
  ...over,
});
