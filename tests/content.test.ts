import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, loginAs, startDb, stopDb } from './helpers';

let app: Express;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);
beforeEach(clearDb);

describe('public website content', () => {
  it('returns published items only; unpublished ids look missing', async () => {
    const admin = await loginAs(app, 'admin');
    const a = (await admin.post(`${api}/announcements`, { title: 'Draft notice', body: 'Not yet' })).body.data;
    expect(a.published).toBe(false);
    expect((await request(app).get(`${api}/announcements`)).body.data).toHaveLength(0);
    expect((await request(app).get(`${api}/announcements/${a.id}`)).status).toBe(404);

    await admin.post(`${api}/announcements/${a.id}/publish`);
    const list = await request(app).get(`${api}/announcements`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].createdBy).toBeUndefined(); // internal fields are not exposed
    expect((await request(app).get(`${api}/announcements/${a.id}`)).status).toBe(200);

    await admin.post(`${api}/announcements/${a.id}/unpublish`);
    expect((await request(app).get(`${api}/announcements`)).body.data).toHaveLength(0);
    expect((await admin.get(`${api}/announcements/manage/all`)).body.data).toHaveLength(1);
    expect((await admin.get(`${api}/announcements/manage/all?published=false`)).body.data).toHaveLength(1);
  });

  it('restricts management to admins and allows deleting website content', async () => {
    const admin = await loginAs(app, 'admin');
    const care = await loginAs(app, 'customer_care');
    expect((await care.post(`${api}/events`, { title: 'E', startsAt: '2030-01-01T10:00:00Z' })).status).toBe(403);
    expect((await request(app).post(`${api}/events`).send({})).status).toBe(401);
    const ev = (await admin.post(`${api}/events`, { title: 'Harvest', startsAt: '2030-01-01T10:00:00Z' })).body.data;
    expect((await admin.patch(`${api}/events/${ev.id}`, { location: 'Hall' })).body.data.location).toBe('Hall');
    expect((await admin.del(`${api}/events/${ev.id}`)).status).toBe(200);
    expect((await admin.get(`${api}/events/manage/${ev.id}`)).status).toBe(404);
  });

  it('validates content (mass time format, URLs, unknown fields)', async () => {
    const admin = await loginAs(app, 'admin');
    expect((await admin.post(`${api}/mass-schedules`, { dayOfWeek: 9, time: '25:00' })).status).toBe(400);
    expect((await admin.post(`${api}/gallery`, { title: 'x', imageUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await admin.post(`${api}/news`, { title: 'x', slug: 'Bad Slug', body: 'b' })).status).toBe(400);
    expect((await admin.post(`${api}/announcements`, { title: 'x', body: 'y', published: true })).status).toBe(400);
  });

  it('serves and updates public website settings', async () => {
    const admin = await loginAs(app, 'admin');
    expect((await request(app).get(`${api}/website-settings`)).status).toBe(200);
    expect((await admin.put(`${api}/website-settings`, { churchName: 'Test Parish', phone: '+234000' })).status).toBe(200);
    expect((await request(app).get(`${api}/website-settings`)).body.data.churchName).toBe('Test Parish');
    const care = await loginAs(app, 'customer_care');
    expect((await care.put(`${api}/website-settings`, { churchName: 'Hacked' })).status).toBe(403);
  });
});

describe('donations and messages', () => {
  it('records donations as demo data, never claiming a payment was processed', async () => {
    const res = await request(app).post(`${api}/donations`).send({ donorName: 'Donor Test', amount: 5000, currency: 'NGN', paymentStatus: 'paid' });
    expect(res.status).toBe(400); // client cannot set payment status
    const ok = await request(app).post(`${api}/donations`).send({ donorName: 'Donor Test', amount: 5000 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.paymentStatus).toBe('not_processed');
    expect(ok.body.data.isDemo).toBe(true);
    expect(ok.body.data.message).toMatch(/No payment has been processed/);
    const admin = await loginAs(app, 'admin');
    expect((await admin.get(`${api}/donations`)).body.data[0].paymentStatus).toBe('not_processed');
    expect((await admin.del(`${api}/donations/${ok.body.data.id}`)).status).toBe(404); // no delete route
    expect((await request(app).get(`${api}/donations`)).status).toBe(401);
    expect((await request(app).post(`${api}/donations`).send({ amount: -5 })).status).toBe(400);
  });

  it('accepts contact messages with consent and lets admins triage them', async () => {
    expect((await request(app).post(`${api}/messages`).send({ name: 'M T', email: 'm@test.invalid', body: 'Hello parish', consentGiven: false })).status).toBe(400);
    expect((await request(app).post(`${api}/messages`).send({ name: 'Msg Test', email: 'm@test.invalid', body: 'Hello parish', consentGiven: true })).status).toBe(201);
    const admin = await loginAs(app, 'admin');
    const list = await admin.get(`${api}/messages`);
    expect(list.body.data).toHaveLength(1);
    expect((await admin.patch(`${api}/messages/${list.body.data[0].id}`, { status: 'read' })).body.data.status).toBe('read');
    const care = await loginAs(app, 'customer_care');
    expect((await care.get(`${api}/messages`)).status).toBe(403);
  });
});

describe('API docs', () => {
  it('serves an OpenAPI document that includes the register routes but no register DELETE', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/baptisms'].post.requestBody).toBeDefined();
    expect(res.body.paths['/baptisms/{id}'].delete).toBeUndefined();
    expect(res.body.paths['/sick-calls/{id}'].delete).toBeUndefined();
    expect(res.body.paths['/announcements/{id}'].delete).toBeDefined();
  });
});
