import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, loginAs, sampleBaptism, startDb, stopDb } from './helpers';

let app: Express;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);

describe('input validation', () => {
  it('returns a structured VALIDATION_ERROR for bad bodies', async () => {
    const res = await request(app).post(`${api}/auth/login`).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('rejects NoSQL operator injection', async () => {
    const res = await request(app).post(`${api}/auth/login`).send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    const q = await request(app).get(`${api}/announcements?q[$ne]=x`);
    expect(q.status).toBe(400);
  });

  it('validates ids, query strings and unknown fields', async () => {
    const admin = await loginAs(app, 'admin');
    expect((await admin.get(`${api}/baptisms/not-an-id`)).status).toBe(400);
    expect((await admin.get(`${api}/baptisms?limit=9999`)).status).toBe(400);
    expect((await admin.get(`${api}/baptisms?year=abc`)).status).toBe(400);
    const res = await admin.post(`${api}/baptisms`, sampleBaptism({ status: 'verified' }));
    expect(res.status).toBe(400); // mass assignment of status is refused
    expect((await admin.post(`${api}/baptisms`, sampleBaptism({ dateOfBaptism: '2001-02-31' }))).status).toBe(400);
  });

  it('rejects oversized bodies and unknown routes consistently', async () => {
    const big = await request(app).post(`${api}/auth/login`).send({ email: 'a@b.co', password: 'x'.repeat(300_000) });
    expect(big.status).toBe(413);
    const nf = await request(app).get(`${api}/nope`);
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
