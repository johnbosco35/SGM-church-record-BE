import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, loginAs, startDb, stopDb, TINY_PNG, type Session } from './helpers';

let app: Express;
let admin: Session;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);
beforeEach(async () => { await clearDb(); admin = await loginAs(app, 'admin'); });

const upload = (s: Session, files: Array<{ buf: Buffer; name: string; type: string }>) => {
  const r = s.agent.post(`${api}/uploads`).set('X-CSRF-Token', s.csrf);
  files.forEach((f) => r.attach('files', f.buf, { filename: f.name, contentType: f.type }));
  return r;
};

describe('uploads', () => {
  it('accepts a real image, stores it privately under a generated name', async () => {
    const res = await upload(admin, [{ buf: TINY_PNG, name: '../../etc/passwd.png', type: 'image/png' }]);
    expect(res.status).toBe(201);
    expect(res.body.data[0].originalName).toBe('passwd.png'); // path components stripped
    expect(JSON.stringify(res.body)).not.toMatch(/storedName/);
    const file = await admin.get(`${api}/uploads/${res.body.data[0].id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toMatch(/no-store/);
  });

  it('rejects disguised files, wrong types and too many files', async () => {
    expect((await upload(admin, [{ buf: Buffer.from('<script>alert(1)</script>'), name: 'x.png', type: 'image/png' }])).status).toBe(415);
    expect((await upload(admin, [{ buf: Buffer.from('hello'), name: 'x.txt', type: 'text/plain' }])).status).toBe(415);
    const many = Array.from({ length: 11 }, (_, i) => ({ buf: TINY_PNG, name: `p${i}.png`, type: 'image/png' }));
    expect((await upload(admin, many)).status).toBe(400);
    expect((await admin.agent.post(`${api}/uploads`).set('X-CSRF-Token', admin.csrf)).status).toBe(400); // no file
  });

  it('is restricted to authorised staff', async () => {
    const care = await loginAs(app, 'customer_care');
    expect((await upload(care, [{ buf: TINY_PNG, name: 'a.png', type: 'image/png' }])).status).toBe(403);
    const up = await upload(admin, [{ buf: TINY_PNG, name: 'a.png', type: 'image/png' }]);
    expect((await care.get(`${api}/uploads/${up.body.data[0].id}/file`)).status).toBe(403);
    expect((await (await import('supertest')).default(app).get(`${api}/uploads/${up.body.data[0].id}/file`)).status).toBe(401);
  });
});

describe('extraction (mock provider)', () => {
  it('creates flagged DRAFT records and is explicit that no real OCR happened', async () => {
    const up = await upload(admin, [{ buf: TINY_PNG, name: 'page1.png', type: 'image/png' }]);
    const fileId = up.body.data[0].id;
    const res = await admin.post(`${api}/extractions`, { registerKey: 'baptisms', fileIds: [fileId] });
    expect(res.status).toBe(201);
    expect(res.body.data.isMock).toBe(true);
    expect(res.body.data.warnings[0]).toMatch(/no OCR or AI extraction was performed/i);
    const rec = res.body.data.records[0];
    expect(rec.status).toBe('draft');
    expect(rec.source).toBe('extraction');
    expect(rec.uncertainFields.length).toBeGreaterThan(0);
    expect(rec.sourceDocument.fileId).toBe(fileId);
    expect(rec.extraction.isMock).toBe(true);
    expect(rec.createdBy).toBe(admin.id);
    // cannot become official without human work
    expect((await admin.post(`${api}/baptisms/${rec.id}/submit`)).status).toBe(422);
  });

  it('404s for unknown files and rejects unknown registers', async () => {
    expect((await admin.post(`${api}/extractions`, { registerKey: 'baptisms', fileIds: ['64b64b64b64b64b64b64b64'] })).status).toBe(404);
    expect((await admin.post(`${api}/extractions`, { registerKey: 'nope', fileIds: ['64b64b64b64b64b64b64b64'] })).status).toBe(400);
  });
});
