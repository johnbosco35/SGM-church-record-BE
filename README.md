# Catholic Church Website & Management System: Backend API

Node.js · Express · TypeScript (strict) · MongoDB/Mongoose · Zod · JWT in HttpOnly cookies · Swagger/OpenAPI.

> **Status:** the code was written and partially verified in an offline sandbox (see "Verification status" at the bottom). Run the install, typecheck, test and build commands below on your machine before deploying.

## 1. Quick start

```bash
cd backend
cp .env.example .env            # then edit: MONGODB_URI, JWT_ACCESS_SECRET, CORS_ORIGINS
npm install
npm run seed:admin              # needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env (creates the first admin)
npm run dev                     # http://localhost:4000  ·  docs at /api/docs
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**MongoDB:** local (`mongodb://127.0.0.1:27017/church_db`; install MongoDB Community or `docker run -p 27017:27017 mongo:7`) or Atlas (`mongodb+srv://…`, allow your server IP). Collections and indexes are created automatically.

Commands: `npm run typecheck` · `npm test` · `npm run build` · `npm start` (runs `dist/server.js`).

## 2. Architecture (Model · Route · Controller)

```
src/
├── app.ts · server.ts          app wiring and startup
├── helpers.ts                  small shared functions + shared Zod schemas (one file, no utils folder)
├── config/                     env.ts (validated, fails fast) · db.ts · constants.ts · registerTypes.ts
├── models/                     Mongoose models (M)
│   └── registers/              the 7 register models, one file each + a shared builder
├── routes/                     URL → role → Zod schema → controller (R)
├── controllers/                request handling AND business logic (C)
├── middleware/                 auth · csrf · validate · sanitize · rateLimit · http (errors, logger, responses)
├── providers/                  swappable OCR/AI + chat providers (mock included)
└── scripts/seedAdmin.ts        creates the first administrator
```

**How a request flows:** `routes/*.routes.ts` declares each endpoint once (path, allowed roles, Zod schema, handler).
`routes/define.ts` turns that into the Express route (auth → roles → validation → handler) **and** the Swagger entry, so the docs cannot drift from behaviour.
The handler in `controllers/*.controller.ts` does the work using the `models/`.

There is no `services/`, `utils/`, `validators/`, `types/` or `constants/` folder: the logic lives in controllers (or on the model when it is about data, e.g. revision/audit writers), and Zod schemas sit beside the routes that use them.
All 7 registers share one tested controller and one router factory (`register.controller.ts`, `register.routes.ts`); each register's columns, labels and order are defined in `models/registers/<name>.model.ts`.

## 3. Security model

| Concern | Implementation |
|---|---|
| Passwords | bcryptjs (`BCRYPT_ROUNDS`, default 12); policy ≥10 chars, upper/lower/digit; generic login errors, constant-time-ish unknown-email path; 5 failures → 15 min lock |
| Tokens | 15-min JWT access token in HttpOnly cookie; opaque refresh token (HttpOnly, path `/api/v1/auth`, stored only as SHA-256); **rotation on every refresh**, reuse of a rotated token revokes the whole family; logout / password / role / deactivation revoke sessions |
| Role checks | Always from the database, never from the token; enforced per route on the API |
| CSRF | SameSite + `Origin` allow-list + double-submit: echo the `csrf_token` cookie in the `X-CSRF-Token` header on every POST/PUT/PATCH/DELETE (`GET /auth/csrf` re-issues it) |
| Input | Zod on body/params/query (strict objects → no mass assignment); `$`/`.` keys rejected; body limit `BODY_LIMIT_KB` |
| Abuse | `express-rate-limit` on login/register/refresh, public forms, chat, uploads and globally |
| Headers/CORS | Helmet (API-tight CSP); CORS only for origins in `CORS_ORIGINS`, credentials on |
| Logging | method, path (no query string), status, time, user id only. No bodies, cookies, tokens, names or register data |
| Errors | One envelope: `{success:false,error:{code,message,details?}}`; 500s never leak internals |

**Roles:** `admin` (everything, user management, website content), `parish_priest` (registers: read/write/verify, and the *only* role that can sign membership cards), `customer_care` (visitor requests only; **no access to any register, upload, extraction or revision**), `member` (no privileges; only created if `ALLOW_PUBLIC_REGISTRATION=true`).

## 4. Sacramental registers

Routes (identical for each): `/membership-cards`, `/baptisms`, `/first-holy-communions`, `/confirmations`, `/holy-matrimonies`, `/holy-orders`, `/sick-calls`

```
GET    /                      list: q, status, year, yearFrom, yearTo, source, sort=field:asc|desc, page, limit
POST   /                      create DRAFT (partial allowed); duplicate warnings in meta.warnings, never merged
GET    /:id                   detail (+ meta.warnings)
PATCH  /:id                   correct (expectedVersion for optimistic locking; revisionReason REQUIRED for verified records)
POST   /:id/submit            draft|correction_required → pending_review (required fields checked)
POST   /:id/request-correction   pending_review → correction_required (note required)
POST   /:id/verify            pending_review → verified (blocked while uncertainFields is non-empty)
POST   /:id/sign              membership cards only; parish_priest only
GET    /:id/duplicates · GET /:id/revisions
GET    /export.csv · /export.docx · /print      same filters as the list (max 5000 rows; narrow by year)
GET    /api/v1/revisions[?registerKey&recordId] · /revisions/:id
```

* **No DELETE endpoints exist for the registers**, and the Mongoose models additionally refuse `deleteOne/deleteMany/findOneAndDelete/replaceOne`. The `Revision` collection is append-only.
* Every change stores a revision with the **full before and after snapshot**, the changed field paths, reason, user, name and role. Editing a verified record returns it to `pending_review`; the verified version stays in history.
* `eventYear` is derived from each register's event date (membership: `Year`) and powers year filtering. Dates accept `YYYY`, `YYYY-MM`, `YYYY-MM-DD` because historic entries are often incomplete.
* CSV is spreadsheet-formula safe. DOCX is an editable table (A3 landscape for wide registers). Holy Matrimony bride/groom names are uppercased in `presentation`, print and exports only; stored values are untouched.
* `LBN`, `No.B.P.`, `Confr.`, `Absolu.`, `Anoint.` are preserved verbatim as labels/keys (`lbn`, `noBp`, `confr`, `absolu`, `anoint`) and never interpreted.
* Sick-call is `highlySensitive`: admin/priest only; absent from the public site, chat and customer care.

### Assumptions (please review)
* Columns with unknown value formats (`Baptized`, `Confirmed`, sick-call `Baptism…Viaticum`, `Age`, `Solemn`) are free text so register wording is preserved. `No of Children`, `Year`, `Amount` are numbers (currency unspecified).
* Matrimony "Baptism — Place/Date/No.B.P." is stored as one block as listed in your spec (not split bridegroom/bride). Tell me if you want both.
* Minimum fields before review (`requiredForReview` in each definition): e.g. baptism = number, surname, date of baptism. Adjust per register.
* Membership "Parish Priest Signature" is a signature **workflow**, not a text field: only a signed-in `parish_priest` can sign (electronic acknowledgement, not an image of a signature); any later edit resets it to unsigned (old signed version kept in history).

## 5. Uploads & extraction

`POST /uploads` (multipart field `files`; JPEG/PNG/WebP/PDF; size/count limits from env) → files go to the **private** `UPLOAD_DIR` under server-generated names, content verified by magic bytes, hashed (SHA-256), never served statically, streamed only to admin/priest via `GET /uploads/:id/file` (audited). Keep `UPLOAD_DIR` outside the web root and out of git; in production use a persistent volume or replace the storage functions in `controllers/upload.controller.ts` with object storage (S3/GCS) behind the same functions.

`POST /extractions {registerKey, fileIds}` runs the configured provider and creates **drafts** flagged `uncertainFields`, with `sourceDocument`, `extraction` metadata and creator recorded. Values that cannot be stored cleanly go to `extraction.unparsedValues`; nothing is silently dropped. Humans must correct, submit and verify.

**The `mock` provider performs no OCR/AI.** It returns empty drafts with every field flagged, and the response says so (`isMock: true`, `warnings`). To add a real provider implement `ExtractionProvider` (`src/providers/extraction.ts`), return it from `getExtractionProvider()` in the same file, and add its name to `EXTRACTION_PROVIDER` in `config/env.ts`. **No real OCR/AI provider is included yet.**

## 6. Customer care & admin enquiries

Visitor `POST /requests` (consent required, email or phone required, honeypot, rate limited) → staff: list/filter, notes, assign, `POST /:id/status` (transition table enforced), `POST /:id/forward` → admin enquiry → admin `acknowledge` / `respond` → request becomes `response_received` → staff `ready_to_contact_visitor` → `POST /:id/contact-attempts` → `resolved` → `closed`. Every step is in `activity`. Customer care sees only the enquiries they forwarded and never `adminInternalNotes`.
**The system sends no email and places no calls.** Contact attempts are recorded exactly as reported by staff (`confirmedByStaff: true`). To add real email, call your provider from `controllers/request.controller.ts` and record the provider's confirmed result.

## 7. JOHNBOSCO chat

`POST /chat` (≤12 messages × ≤1000 chars). Flow: privacy guard (declines record lookups, identity checks, prompt-injection phrasing) → context built **only from published website content** (`controllers/chat.controller.ts` imports only published-content models) → provider. `CHAT_PROVIDER=mock` (default) gives clearly labelled keyword replies; `anthropic` calls the Messages API server-side with `ANTHROPIC_API_KEY` / `CHAT_MODEL`. `POST /chat/support-request` forwards to customer care. The guard intentionally errs on the side of privacy and may occasionally decline harmless questions; the visitor can rephrase or leave a request.

## 8. Public content & donations

`announcements, events, mass-schedules, ministries, societies, sacraments-information, news, gallery, homilies`: public `GET /` and `GET /:id` return **published only**; admins use `/manage/all`, `/manage/:id`, `POST`, `PATCH`, `POST /:id/publish|unpublish`, `DELETE`. `website-settings` (public GET, admin PUT). `messages`: public POST, admin triage. `donations`: public POST records an **intention only**: `isDemo: true`, `paymentStatus: "not_processed"`; no payment provider is integrated; donations cannot be deleted. Gallery/cover images are URLs (host images on your CDN); only register scans use private storage.

## 9. Production checklist

* `NODE_ENV=production`, HTTPS everywhere, `TRUST_PROXY=<hops>` behind a proxy (needed for correct rate-limit IPs).
* `COOKIE_SECURE` defaults to true in production. Same site as the frontend → `COOKIE_SAMESITE=lax` (+ `COOKIE_DOMAIN=.yourparish.org` if API is on a subdomain). Cross-site → `none` (requires Secure/HTTPS).
* `CORS_ORIGINS` = exact frontend origin(s). The frontend must send `credentials: 'include'` and the `X-CSRF-Token` header; never put tokens in localStorage.
* Strong random `JWT_ACCESS_SECRET`; set `ENABLE_DOCS=false` if you don't want public docs.
* Back up MongoDB (these are permanent parish records) and the upload volume; enable Atlas/Mongo auth and network allow-lists.
* Revision snapshots and register data are personal data; apply your jurisdiction's data-protection rules (e.g. NDPA in Nigeria).
* Writes are sequential, not transactional (works on standalone MongoDB). If you run a replica set, wrapping record+revision writes in a transaction is a worthwhile hardening step.

## 10. Frontend integration

```js
// after login the csrf token is in the JSON body and the csrf_token cookie
fetch(`${API}/baptisms`, { method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({...}) });
// on 401 call POST /auth/refresh once, then retry
```

Example: create + verify a baptism entry

```
POST /api/v1/baptisms  {"number":"123","surname":"Okafor","dateOfBaptism":"1999-05-01","firstHolyCommunion":{"date":"2008"}}
→ 201 {"success":true,"data":{"id":"…","status":"draft","version":1,"eventYear":1999,…},"meta":{"warnings":[]}}
POST /api/v1/baptisms/{id}/submit   → status pending_review
POST /api/v1/baptisms/{id}/verify   → status verified
```
Error example: `400 {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[{"path":"dateOfBaptism","message":"Use YYYY, YYYY-MM or YYYY-MM-DD"}]}}`

## 11. Tests

`npm test` (Vitest + Supertest + `mongodb-memory-server`, which downloads a `mongod` binary on first run; or set `MONGODB_URI_TEST` to use an existing server). Fixtures are fully synthetic. Suites: auth/authorization/refresh rotation/CSRF, validation, rate limiting, register lifecycle & revisions & delete protection, role isolation, CSV/DOCX exports, uploads & extraction, customer-care↔admin workflow, chat privacy, published-vs-unpublished content, donations/messages, OpenAPI.

## Verification status

Built in a sandbox **without network access**, so `npm install`, the Mongo-backed integration tests and `npm run build` were **not run** there. What *was* executed: the TypeScript compiler over all source (no errors beyond those caused by the missing packages), and real runs of the register definitions (column counts/order/labels), the generated Zod validators, CSV writer, DOCX builder (opened and inspected as real Word files) and the chat privacy guard against risky and harmless queries. Expect to fix small type or integration issues on first run; the test suite is there to find them.
