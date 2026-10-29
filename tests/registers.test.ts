import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, loginAs, sampleBaptism, startDb, stopDb, type Session } from './helpers';

let app: Express;
let admin: Session;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);
beforeEach(async () => { await clearDb(); admin = await loginAs(app, 'admin'); });

const create = async (over = {}) => (await admin.post(`${api}/baptisms`, sampleBaptism(over))).body.data as { id: string; version: number; status: string };

describe('sacramental record lifecycle', () => {
  it('creates a draft, submits, verifies, and records an immutable revision for each step', async () => {
    const rec = await create();
    expect(rec.status).toBe('draft');
    expect((await admin.post(`${api}/baptisms/${rec.id}/submit`)).body.data.status).toBe('pending_review');
    const verified = await admin.post(`${api}/baptisms/${rec.id}/verify`);
    expect(verified.body.data.status).toBe('verified');

    const revs = await admin.get(`${api}/baptisms/${rec.id}/revisions`);
    expect(revs.body.data.map((r: { action: string }) => r.action).sort()).toEqual(['create', 'submit', 'verify']);
  });

  it('blocks submission when required fields are missing', async () => {
    const rec = (await admin.post(`${api}/baptisms`, { surname: 'OnlySurname' })).body.data;
    const res = await admin.post(`${api}/baptisms/${rec.id}/submit`);
    expect(res.status).toBe(422);
    expect(res.body.error.details.missing).toContain('number');
  });

  it('requires a reason to correct a verified record, preserves the previous version, and returns it to review', async () => {
    const rec = await create();
    await admin.post(`${api}/baptisms/${rec.id}/submit`);
    await admin.post(`${api}/baptisms/${rec.id}/verify`);

    const noReason = await admin.patch(`${api}/baptisms/${rec.id}`, { surname: 'Corrected' });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REVISION_REASON_REQUIRED');

    const ok = await admin.patch(`${api}/baptisms/${rec.id}`, { surname: 'Corrected', revisionReason: 'Spelling corrected from register' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('pending_review');
    expect(ok.body.data.surname).toBe('Corrected');

    const revs = (await admin.get(`${api}/baptisms/${rec.id}/revisions`)).body.data;
    const update = revs.find((r: { action: string }) => r.action === 'update');
    expect(update.before.surname).toBe('Fixture'); // previous version preserved
    expect(update.after.surname).toBe('Corrected');
    expect(update.changedPaths).toContain('surname');
    expect(update.reason).toMatch(/Spelling/);
  });

  it('detects stale edits with optimistic locking', async () => {
    const rec = await create();
    await admin.patch(`${api}/baptisms/${rec.id}`, { remarks: 'one' });
    const stale = await admin.patch(`${api}/baptisms/${rec.id}`, { remarks: 'two', expectedVersion: rec.version });
    expect(stale.status).toBe(409);
  });

  it('request-correction needs a note; verification is blocked while fields are flagged uncertain', async () => {
    const rec = await create();
    await admin.patch(`${api}/baptisms/${rec.id}`, { uncertainFields: ['surname'] });
    await admin.post(`${api}/baptisms/${rec.id}/submit`);
    const blocked = await admin.post(`${api}/baptisms/${rec.id}/verify`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('UNCERTAIN_FIELDS_UNRESOLVED');
    expect((await admin.post(`${api}/baptisms/${rec.id}/request-correction`, {})).status).toBe(400);
    expect((await admin.post(`${api}/baptisms/${rec.id}/request-correction`, { note: 'Check surname' })).body.data.status).toBe('correction_required');
    await admin.patch(`${api}/baptisms/${rec.id}`, { uncertainFields: [] });
    await admin.post(`${api}/baptisms/${rec.id}/submit`);
    expect((await admin.post(`${api}/baptisms/${rec.id}/verify`)).body.data.status).toBe('verified');
  });

  it('warns about possible duplicates without merging', async () => {
    await create();
    const dup = await admin.post(`${api}/baptisms`, sampleBaptism());
    expect(dup.status).toBe(201);
    expect(dup.body.meta.warnings.length).toBeGreaterThan(0);
    expect((await admin.get(`${api}/baptisms`)).body.meta.total).toBe(2);
  });

  it('filters by the actual event year, status and search text', async () => {
    await create({ number: 'A1', dateOfBaptism: '1999-01-01', surname: 'Alpha' });
    await create({ number: 'B1', dateOfBaptism: '2005-06-06', surname: 'Bravo' });
    const y = await admin.get(`${api}/baptisms?year=2005`);
    expect(y.body.data).toHaveLength(1);
    expect(y.body.data[0].surname).toBe('Bravo');
    expect((await admin.get(`${api}/baptisms?yearFrom=1990&yearTo=2000`)).body.data).toHaveLength(1);
    expect((await admin.get(`${api}/baptisms?q=alph`)).body.data).toHaveLength(1);
    expect((await admin.get(`${api}/baptisms?status=verified`)).body.data).toHaveLength(0);
    expect((await admin.get(`${api}/baptisms?sort=surname:desc`)).body.data[0].surname).toBe('Bravo');
  });
});

describe('protection of official records', () => {
  it('offers no delete endpoint and the record survives delete attempts', async () => {
    const rec = await create();
    for (const slug of ['baptisms', 'sick-calls', 'membership-cards']) {
      const res = await admin.del(`${api}/${slug}/${rec.id}`);
      expect([404, 405]).toContain(res.status);
    }
    expect((await admin.del(`${api}/baptisms`)).status).toBeGreaterThanOrEqual(404);
    expect((await admin.get(`${api}/baptisms/${rec.id}`)).status).toBe(200);
  });

  it('the models themselves refuse deletion', async () => {
    const { Baptism } = await import('../src/models/registers/baptism.model');
    const rec = await create();
    await expect(Baptism.deleteOne({ _id: rec.id })).rejects.toThrow(/cannot be deleted/);
    await expect(Baptism.deleteMany({})).rejects.toThrow(/cannot be deleted/);
    const { Revision } = await import('../src/models/Revision');
    await expect(Revision.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe('role access to registers', () => {
  it('customer care, members and anonymous visitors cannot read any register', async () => {
    const care = await loginAs(app, 'customer_care');
    const member = await loginAs(app, 'member');
    for (const slug of ['membership-cards', 'baptisms', 'first-holy-communions', 'confirmations', 'holy-matrimonies', 'holy-orders', 'sick-calls']) {
      expect((await care.get(`${api}/${slug}`)).status).toBe(403);
      expect((await member.get(`${api}/${slug}`)).status).toBe(403);
      expect((await care.post(`${api}/${slug}`, {})).status).toBe(403);
    }
    const anon = await (await import('supertest')).default(app).get(`${api}/sick-calls`);
    expect(anon.status).toBe(401);
    expect((await care.get(`${api}/revisions`)).status).toBe(403);
  });

  it('sick-call records work for authorised staff and keep abbreviations as keys', async () => {
    const res = await admin.post(`${api}/sick-calls`, { number: 'S1', date: '2024-02-02', name: 'Test Patient', confr: 'x', absolu: 'x', anoint: 'x', viaticum: 'x' });
    expect(res.status).toBe(201);
    expect(res.body.data.anoint).toBe('x');
  });

  it('displays matrimony names in UPPERCASE while storing the original', async () => {
    const res = await admin.post(`${api}/holy-matrimonies`, { number: 'M1', dateOfMarriage: '2020-05-05', bridegroom: { name: 'John Test' }, bride: { name: 'Mary Test' } });
    expect(res.body.data.bridegroom.name).toBe('John Test');
    expect(res.body.data.presentation.bridegroom.name).toBe('JOHN TEST');
    expect(res.body.data.presentation.bride.name).toBe('MARY TEST');
  });

  it('only the parish priest can sign a membership card; edits invalidate the signature', async () => {
    const priest = await loginAs(app, 'parish_priest');
    const card = (await admin.post(`${api}/membership-cards`, { name: 'Test Member', year: 2024, amount: 5000 })).body.data;
    expect(card.parishPriestSignature.status).toBe('unsigned');
    await admin.post(`${api}/membership-cards/${card.id}/submit`);
    expect((await admin.post(`${api}/membership-cards/${card.id}/sign`, { confirm: true })).status).toBe(403);
    const signed = await priest.post(`${api}/membership-cards/${card.id}/sign`, { confirm: true });
    expect(signed.status).toBe(200);
    expect(signed.body.data.parishPriestSignature.status).toBe('signed');
    expect(signed.body.data.parishPriestSignature.signedName).toBe('Test parish_priest');
    // admin cannot forge a signature through the body
    expect((await admin.patch(`${api}/membership-cards/${card.id}`, { parishPriestSignature: { status: 'signed' } })).status).toBe(400);
    const edited = await admin.patch(`${api}/membership-cards/${card.id}`, { amount: 6000 });
    expect(edited.body.data.parishPriestSignature.status).toBe('unsigned');
  });
});
