import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, loginAs, startDb, stopDb } from './helpers';

let app: Express;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);
beforeEach(clearDb);

const visitor = (over = {}) => ({
  visitorName: 'Visitor Test', email: 'visitor@test.invalid', category: 'baptism',
  summary: 'I need a copy of my baptism certificate please.', consentGiven: true, ...over
});

describe('visitor requests', () => {
  it('accepts a valid request and returns only a reference', async () => {
    const res = await request(app).post(`${api}/requests`).send(visitor());
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^REQ-\d{8}-[A-F0-9]{6}$/);
    expect(Object.keys(res.body.data).sort()).toEqual(['message', 'reference']);
  });

  it('requires consent, contact details and a known category', async () => {
    expect((await request(app).post(`${api}/requests`).send(visitor({ consentGiven: false }))).status).toBe(400);
    expect((await request(app).post(`${api}/requests`).send(visitor({ email: undefined }))).status).toBe(400);
    expect((await request(app).post(`${api}/requests`).send(visitor({ category: 'hack' }))).status).toBe(400);
    expect((await request(app).post(`${api}/requests`).send(visitor({ status: 'resolved' }))).status).toBe(400);
  });

  it('silently drops honeypot submissions', async () => {
    const { SupportRequest } = await import('../src/models/SupportRequest');
    const res = await request(app).post(`${api}/requests`).send(visitor({ website: 'http://spam' }));
    expect(res.status).toBe(201);
    expect(await SupportRequest.countDocuments()).toBe(0);
  });

  it('flags sick-call assistance requests as high priority', async () => {
    await request(app).post(`${api}/requests`).send(visitor({ category: 'sick_call_assistance' }));
    const care = await loginAs(app, 'customer_care');
    expect((await care.get(`${api}/requests`)).body.data[0].priority).toBe('high');
  });
});

describe('customer-care ↔ admin workflow', () => {
  it('runs the full lifecycle and enforces who may do what', async () => {
    const created = await request(app).post(`${api}/requests`).send(visitor());
    const care = await loginAs(app, 'customer_care');
    const admin = await loginAs(app, 'admin');
    const id = (await care.get(`${api}/requests`)).body.data[0].id;

    // 1. staff review
    expect((await care.post(`${api}/requests/${id}/status`, { status: 'in_review' })).body.data.status).toBe('in_review');
    // invalid jump is refused
    expect((await care.post(`${api}/requests/${id}/status`, { status: 'contact_attempted' })).status).toBe(400);
    expect((await care.post(`${api}/requests/${id}/status`, { status: 'closed', note: 'x' })).status).toBe(200); // allowed, then reopen below
    expect((await care.post(`${api}/requests/${id}/status`, { status: 'in_review' })).status).toBe(422); // closed is terminal

    // fresh request for the main flow
    await request(app).post(`${api}/requests`).send(visitor({ summary: 'Second request about confirmation records.' }));
    const id2 = (await care.get(`${api}/requests?status=new`)).body.data[0].id;
    await care.post(`${api}/requests/${id2}/status`, { status: 'in_review' });

    // 2. forward to admin
    const fwd = await care.post(`${api}/requests/${id2}/forward`, { subject: 'Confirmation record check', question: 'Please confirm whether a record exists.' });
    expect(fwd.status).toBe(201);
    const enquiryId = fwd.body.data.id;
    expect((await care.get(`${api}/requests/${id2}`)).body.data.status).toBe('forwarded_to_admin');

    // customer care cannot answer its own enquiry
    expect((await care.post(`${api}/admin-enquiries/${enquiryId}/respond`, { response: 'self answer' })).status).toBe(403);

    // 3. admin acknowledges and responds
    expect((await admin.post(`${api}/admin-enquiries/${enquiryId}/acknowledge`)).status).toBe(200);
    expect((await care.get(`${api}/requests/${id2}`)).body.data.status).toBe('awaiting_admin_response');
    const resp = await admin.post(`${api}/admin-enquiries/${enquiryId}/respond`, { response: 'A record exists; contact the visitor.', adminInternalNotes: 'private admin note' });
    expect(resp.status).toBe(200);

    // 4. care sees the response but never admin-internal notes
    const detail = (await care.get(`${api}/requests/${id2}`)).body.data;
    expect(detail.status).toBe('response_received');
    expect(detail.adminEnquiry.response).toMatch(/record exists/);
    expect(JSON.stringify(detail)).not.toMatch(/private admin note/);
    expect((await admin.get(`${api}/admin-enquiries/${enquiryId}`)).body.data.adminInternalNotes).toBe('private admin note');

    // 5. contact the visitor, record the attempt
    expect((await care.post(`${api}/requests/${id2}/contact-attempts`, { method: 'phone', outcome: 'no_answer' })).status).toBe(422); // not ready yet
    await care.post(`${api}/requests/${id2}/status`, { status: 'ready_to_contact_visitor' });
    const attempt = await care.post(`${api}/requests/${id2}/contact-attempts`, { method: 'phone', outcome: 'reached', note: 'Explained next steps' });
    expect(attempt.status).toBe(201);
    expect(attempt.body.data.status).toBe('contact_attempted');
    expect(attempt.body.data.contactAttempts[0].confirmedByStaff).toBe(true);

    // 6. resolve and close; history is complete
    await care.post(`${api}/requests/${id2}/status`, { status: 'resolved' });
    await care.post(`${api}/requests/${id2}/status`, { status: 'closed' });
    const final = (await care.get(`${api}/requests/${id2}`)).body.data;
    expect(final.status).toBe('closed');
    const actions = final.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['request_submitted', 'forwarded_to_admin', 'admin_acknowledged', 'admin_responded', 'contact_attempt_recorded']));
    void created;
  });

  it("customer care only sees enquiries they forwarded; other staff and visitors can't read requests", async () => {
    await request(app).post(`${api}/requests`).send(visitor());
    const care1 = await loginAs(app, 'customer_care');
    const care2 = await loginAs(app, 'customer_care');
    const id = (await care1.get(`${api}/requests`)).body.data[0].id;
    await care1.post(`${api}/requests/${id}/status`, { status: 'in_review' });
    const enq = (await care1.post(`${api}/requests/${id}/forward`, { subject: 'Subject here', question: 'A question for admin.' })).body.data.id;
    expect((await care2.get(`${api}/admin-enquiries/${enq}`)).status).toBe(404);
    expect((await care2.get(`${api}/admin-enquiries`)).body.data).toHaveLength(0);
    expect((await request(app).get(`${api}/requests`)).status).toBe(401);
    const member = await loginAs(app, 'member');
    expect((await member.get(`${api}/requests`)).status).toBe(403);
  });
});
