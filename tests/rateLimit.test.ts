import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, startDb, stopDb } from './helpers';

let app: Express;
beforeAll(async () => {
  process.env.RATE_LIMIT_ENABLED = 'true';
  process.env.RATE_LIMIT_AUTH_MAX = '3';
  process.env.RATE_LIMIT_CHAT_MAX = '2';
  process.env.RATE_LIMIT_PUBLIC_FORM_MAX = '2';
  await startDb();
  app = (await import('../src/app')).createApp();
});
afterAll(stopDb);

describe('rate limiting', () => {
  it('throttles login attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).post(`${api}/auth/login`).send({ email: 'x@test.invalid', password: 'nope-nope' })).status);
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes[3]).toBe(429);
  });

  it('throttles chat and public forms', async () => {
    const chat = () => request(app).post(`${api}/chat`).send({ messages: [{ role: 'user', content: 'Mass times?' }] });
    expect([(await chat()).status, (await chat()).status, (await chat()).status]).toEqual([200, 200, 429]);
    const form = () => request(app).post(`${api}/messages`).send({ name: 'Rate Test', email: 'r@test.invalid', body: 'hello there', consentGiven: true });
    expect([(await form()).status, (await form()).status, (await form()).status]).toEqual([201, 201, 429]);
  });
});
