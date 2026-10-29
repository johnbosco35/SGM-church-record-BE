import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, binaryParser, clearDb, loginAs, sampleBaptism, startDb, stopDb, type Session } from './helpers';

let app: Express;
let admin: Session;
beforeAll(async () => { await startDb(); app = (await import('../src/app')).createApp(); });
afterAll(stopDb);
beforeEach(async () => { await clearDb(); admin = await loginAs(app, 'admin'); });

describe('exports', () => {
  it('exports CSV in register column order and neutralises spreadsheet formulas', async () => {
    await admin.post(`${api}/baptisms`, sampleBaptism({ surname: '=HYPERLINK("http://x")', remarks: 'a, "quoted"' }));
    const res = await admin.get(`${api}/baptisms/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const lines = res.text.replace('\uFEFF', '').split('\r\n');
    expect(lines[0].startsWith('Number,Date of Baptism,Place of Baptism,Baptismal Name,Other Name,Surname')).toBe(true);
    expect(lines[0]).toContain('First Holy Communion — Date');
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).toContain('"a, ""quoted"""');
  });

  it('exports an editable DOCX table', async () => {
    await admin.post(`${api}/baptisms`, sampleBaptism());
    const res = await admin.get(`${api}/baptisms/export.docx`).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/wordprocessingml/);
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('applies filters to exports and provides print-friendly data', async () => {
    await admin.post(`${api}/baptisms`, sampleBaptism({ number: 'N1', dateOfBaptism: '1990-01-01' }));
    await admin.post(`${api}/baptisms`, sampleBaptism({ number: 'N2', dateOfBaptism: '2010-01-01', surname: 'Other' }));
    const print = await admin.get(`${api}/baptisms/print?year=2010`);
    expect(print.body.data.count).toBe(1);
    expect(print.body.data.headers[0]).toBe('Number');
    expect(print.body.data.rows[0][0]).toBe('N2');
  });

  it('uppercases bride and groom names in matrimony exports', async () => {
    await admin.post(`${api}/holy-matrimonies`, { number: 'M1', dateOfMarriage: '2020-05-05', bridegroom: { name: 'John Test' }, bride: { name: 'Mary Test' } });
    const csv = (await admin.get(`${api}/holy-matrimonies/export.csv`)).text;
    expect(csv).toContain('JOHN TEST');
    expect(csv).toContain('MARY TEST');
  });

  it('refuses exports to customer care', async () => {
    const care = await loginAs(app, 'customer_care');
    expect((await care.get(`${api}/baptisms/export.csv`)).status).toBe(403);
    expect((await care.get(`${api}/sick-calls/export.docx`)).status).toBe(403);
  });
});
