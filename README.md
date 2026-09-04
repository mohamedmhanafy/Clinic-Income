# Clinic Income Portal

A mobile-first web portal for recording and analysing the monthly income of multiple medical
clinics.

Pick a clinic and a date, enter the number of examinations (كشف) and consultations (استشارة), and
the system computes, stores and reports the income — by day, by month, across clinics and across a
year. Everything is kept in PostgreSQL.

The application is bilingual (English / العربية) with full right-to-left support, and is designed
for a phone first: tablet and desktop are progressive enhancements of the phone layout, not the
other way round.

---

## Contents

1. [Quick start](#quick-start)
2. [Creating the database](#creating-the-database)
3. [Running it](#running-it)
4. [Using it on a phone](#using-it-on-a-phone)
5. [Architecture](#architecture)
6. [Database design](#database-design)
7. [How historical pricing works](#how-historical-pricing-works)
8. [API reference](#api-reference)
9. [Frontend structure](#frontend-structure)
10. [Testing](#testing)
11. [Sample data](#sample-data)
12. [Scripts](#scripts)
13. [Extending it](#extending-it)

---

## Quick start

Requirements: **Node.js 20+** and **PostgreSQL 14+** running locally.

```bash
cp .env.example .env      # then edit DATABASE_URL if your credentials differ
npm install
npm run build -w @clinic/shared
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:5173>.

---

## Creating the database

The application connects as a dedicated role rather than as the Postgres superuser. Run the
following once, as a superuser.

On Windows, `psql` is usually not on `PATH`; use its full path:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost
```

Then:

```sql
CREATE ROLE clinic_app LOGIN PASSWORD 'clinic_app_password';

-- Prisma creates a temporary "shadow database" when generating migrations.
ALTER ROLE clinic_app CREATEDB;

CREATE DATABASE clinic_income      OWNER clinic_app;
CREATE DATABASE clinic_income_test OWNER clinic_app;

-- Required by the exclusion constraint that prevents overlapping price periods.
-- Must be run as a superuser, once per database.
\c clinic_income
CREATE EXTENSION IF NOT EXISTS btree_gist;

\c clinic_income_test
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

Put the matching connection strings in `.env`:

```ini
DATABASE_URL="postgresql://clinic_app:clinic_app_password@localhost:5432/clinic_income?schema=public"
TEST_DATABASE_URL="postgresql://clinic_app:clinic_app_password@localhost:5432/clinic_income_test?schema=public"
```

`clinic_income_test` is **truncated by the test suite**. It must never point at real data — the
suite refuses to run if `TEST_DATABASE_URL` is missing or equal to `DATABASE_URL`.

Then apply the schema and load the sample data:

```bash
npm run db:migrate
npm run db:seed
```

---

## Running it

```bash
npm run dev
```

| Service | URL |
|---|---|
| Web app | <http://localhost:5173> |
| API | <http://localhost:4000> |
| Health check | <http://localhost:4000/api/health> |

`npm run dev` starts both together. To run one on its own, use `npm run dev:api` or
`npm run dev:web`.

---

## Using it on a phone

This is the intended way to use the portal, and it needs no configuration.

1. Run `npm run dev` on your computer.
2. Note the **Network** URL Vite prints, e.g. `http://192.168.1.20:5173`.
3. Open that address on a phone connected to the same Wi-Fi.

It works because the dev server proxies `/api` to the API, so every request is same-origin. An
absolute `http://localhost:4000` would resolve to the *phone*, and per-device LAN addresses would
each need a CORS exception; the proxy avoids both. Leave `VITE_API_BASE_URL` empty unless the API
is genuinely hosted on a different origin.

---

## Architecture

An npm-workspaces monorepo — one `npm install`, one `npm run dev`.

```
d:\Dev\Clinic
├─ packages/
│  └─ shared/        @clinic/shared — zod schemas + TypeScript types
└─ apps/
   ├─ api/           Express 5 + Prisma 6 + PostgreSQL   (port 4000)
   └─ web/           React 19 + Vite + Tailwind 4        (port 5173)
```

### `packages/shared` — one definition of valid input

Every request schema is a zod schema defined once here. The API parses incoming requests with it,
and the web app imports the **same** schema and derives its TypeScript types from it. Client and
server validation cannot drift apart, and a request that bypasses the UI entirely is still fully
validated. (Section 11 of the brief: *validate on the backend, not only the frontend*.)

### Layering in the API

```
routes/      HTTP shape: parse with a shared schema, call a service, format the response
services/    business rules — fee resolution, income calculation, reporting
prisma/      schema, migrations, seed
lib/         money, dates, errors, CSV/XLSX export
middleware/  validation, error translation, auth seam
```

Routes contain no business logic and services contain no HTTP concepts, so the same logic could be
driven from a scheduled job or a CLI later without change.

### Two rules that shape the whole codebase

**Money is never a JavaScript `number`.** Binary floating point cannot represent `0.1` exactly,
which is unacceptable in a ledger. Money is `NUMERIC` in Postgres, `Prisma.Decimal` in the API, and
a **decimal string** across the wire. The browser formats those strings for display but never does
arithmetic on them — every figure shown to a user was computed by the database or the API. The only
conversions to `number` are at the two display edges (chart geometry and Excel cells), and both are
commented as such.

**Dates are never a JavaScript `Date` in transit.** On a UTC+02:00/+03:00 machine, serialising a
`Date` can shift the calendar day backwards and book a day's income against the wrong date. Dates
travel as `YYYY-MM-DD` strings end to end, are validated by schema (including rejecting `2026-02-30`),
and are stored in `DATE` columns. There are regression tests for this.

### Authentication seam

Authentication is not implemented, but it is pre-wired. Every request passes through
`middleware/auth.ts`, which populates `req.ctx.userId`, and `daily_activities` already carries
nullable `created_by` / `updated_by`. Adding real authentication means implementing that one
function — no schema change and no route changes.

---

## Database design

```
   clinics ──────< clinic_prices >────── services
      │                                      │
      └──< daily_activities ──< daily_activity_lines >──┘
```

| Table | Purpose |
|---|---|
| `clinics` | A clinic. `name` unique, `status` ACTIVE/INACTIVE. |
| `services` | A service type. `code` is a stable machine key; `name_en` / `name_ar` are shown to users. |
| `clinic_prices` | The fee for one service at one clinic **over a date range**. |
| `daily_activities` | One clinic on one calendar day. Unique on `(clinic_id, activity_date)`. |
| `daily_activity_lines` | Activity for one service within that day: quantity, the fee applied, and the resulting income. |

### Relationships

- A **clinic** has many prices and many daily activities. Deleting a clinic cascades to both.
- A **service** has many prices and many activity lines, and is `RESTRICT`-protected: a service
  that has been used in recorded income cannot be deleted out from under it. Deactivate it instead.
- A **daily activity** has many lines, one per service, cascading on delete.

### Why activity is split into a header and lines

The brief listed literal `examination_count` / `consultation_count` columns, but also asked that
examination and consultation not be hard-coded and that more services be possible later. Those
cannot both hold, so the schema follows the extensibility requirement: a day is a header plus one
line per service.

Adding *Follow-up* or *Procedure* is therefore a row in `services` plus a fee — **no migration, no
API change, no UI change**. It appears on the entry form, the dashboard and the reports immediately.
There is a test that proves this end to end.

Nothing is lost: every field the brief named still exists and is still persisted.
`examination_count` is the `quantity` on the line whose service is `EXAMINATION`, and the API
response *also* exposes flat `examinationCount` / `examinationFeeApplied` / `examinationIncome`
fields as a read-only projection, so the shape the brief described is exactly what the UI receives.

### Integrity enforced by the database, not by convention

These live in `prisma/migrations/*_integrity_constraints/migration.sql`, because they are what make
the financial guarantees enforceable rather than merely intended. Each is covered by a test that
attempts the violation and asserts it is refused.

| Rule | Mechanism |
|---|---|
| Only one price can apply to a given clinic/service/date | `EXCLUDE USING gist` over `daterange(effective_from, effective_to)` |
| Stored income always equals count × fee | `CHECK (line_total = quantity * unit_fee)` |
| A day's total always equals the sum of its lines | `AFTER INSERT/UPDATE/DELETE` trigger recomputing `total_income` |
| No duplicate record for a clinic on a date | `UNIQUE (clinic_id, activity_date)` |
| No negative counts, fees or totals | `CHECK (... >= 0)` |
| A price period cannot end before it starts | `CHECK (effective_to IS NULL OR effective_to >= effective_from)` |

The duplicate rule is worth calling out: because it is a unique index rather than an
application-level check, and because the save endpoint is an **upsert** keyed on `(clinic, date)`,
"edit the existing record instead of creating a duplicate" is the only behaviour the system can
produce — including for a caller that never touches the UI.

---

## How historical pricing works

A fee is not a value; it is a **period**. `clinic_prices` rows carry `effective_from` and
`effective_to` (`NULL` = open-ended), and the exclusion constraint guarantees the periods for one
clinic and service never overlap. So the fee applying on any date is unambiguous by construction.

When a day is saved, the fee in force **on that activity date** is looked up and **frozen onto the
line** as `unit_fee`. Reports read the stored figures. Consequently:

> Changing a fee today can never alter income recorded in the past.

Raising a fee uses `POST /api/clinics/:id/prices/schedule-change`, which closes the running period
and opens the new one in a single transaction:

```
before   300 |2026-01-01 ............................ open-ended|
after    300 |2026-01-01 .. 2026-12-31|  350 |2027-01-01 .. open-ended|
```

The 300 row is not edited — it keeps its fee and simply stops on 2026-12-31. September 2026 still
resolves to 300, and every income figure already stored for 2026 is untouched. This is exactly the
scenario in the brief, and it is an automated test.

Editing an existing record keeps the fee it was saved with, so correcting a typo in a count never
re-prices history. For the case where a *price row itself* was entered wrongly, the entry screen's
overflow menu offers **Re-apply price schedule**, which re-reads the schedule **for that activity
date** — never today's price.

---

## API reference

REST, JSON. Errors are `{ "error": { "code", "message", "details" } }`, with messages written to be
shown to a user.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness and configured currency |
| `GET` `POST` | `/api/clinics` | List / create clinics |
| `GET` `PATCH` | `/api/clinics/:id` | Read / update a clinic |
| `GET` `POST` | `/api/clinics/:id/prices` | Fee schedule for a clinic |
| `POST` | `/api/clinics/:id/prices/schedule-change` | Change a fee from a date, closing the running period |
| `PATCH` `DELETE` | `/api/prices/:id` | Amend or remove a price period |
| `GET` | `/api/prices/effective?clinicId&date` | Fees applicable on a date |
| `GET` `POST` | `/api/services` | List / create service types |
| `PATCH` | `/api/services/:id` | Update a service |
| `GET` | `/api/daily?clinicId&date` | The record for a clinic-day, or a blank one plus applicable fees |
| **`PUT`** | `/api/daily` | **Upsert** a clinic-day |
| `DELETE` | `/api/daily/:id` | Delete a clinic-day |
| `GET` | `/api/dashboard/summary?clinicId&year&month` | The six KPI figures |
| `GET` | `/api/reports/daily?clinicId&date` | Daily report |
| `GET` | `/api/reports/monthly?clinicId&year&month` | Day-by-day table with totals |

| `GET` | `/api/reports/annual?year` | Months × clinics |

Every `/api/reports/*` endpoint accepts `?format=csv` or `?format=xlsx` and streams a file instead
of JSON.

All aggregation is done in SQL (`SUM` / `GROUP BY`) rather than by adding values up in JavaScript.

### Example

```bash
curl -X PUT http://localhost:4000/api/daily \
  -H 'Content-Type: application/json' \
  -d '{"clinicId":1,"date":"2026-09-01","lines":[{"serviceId":1,"quantity":10},{"serviceId":2,"quantity":5}]}'
```

```json
{
  "activity": {
    "date": "2026-09-01",
    "examinationCount": 10,  "examinationFeeApplied": "300.00", "examinationIncome": "3000.00",
    "consultationCount": 5,  "consultationFeeApplied": "200.00", "consultationIncome": "1000.00",
    "totalDailyIncome": "4000.00"
  }
}
```

---

## Frontend structure

| Route | Screen |
|---|---|
| `/` | **Dashboard** — 6 KPIs and 4 charts for the selected clinic and month |
| `/daily` | **Daily Income** — the entry screen |
| `/monthly` | **Monthly Income** — day by day, with a pinned month total |
| `/reports` | **Reports** — Daily / Monthly / Annual, each exportable |
| `/settings/clinics` | Add and edit clinics |
| `/settings/services` | Add and edit service types |
| `/settings/pricing` | Fee schedule with effective dates and full history |

```
src/
├─ components/   AppShell (bottom nav + side rail), UI kit, charts, icons
├─ pages/        one file per screen
├─ lib/          API client, TanStack Query hooks, formatting, persisted app state
└─ i18n/         English and Arabic copy
```

### Mobile-first decisions

- **Bottom navigation** on phones — Dashboard, a raised **Add** action, Reports, More — because
  recording a day is what the app is opened for. `More` holds Monthly Income and Settings so the
  bar stays at four items. From `lg` upwards the same destinations become a side rail.
- **No wide tables on a phone.** The monthly table and the annual matrix render as expandable card
  lists below `lg` and as real tables above it. Nothing scrolls sideways.
- **Minimal typing.** The clinic is remembered between visits, the date defaults to today with
  `‹ ›` steppers, and counts have `− / +` buttons plus a numeric keypad. Fee and income are
  read-only and computed.
- **Totals stay visible.** The month total is pinned while the list scrolls; the daily total and
  Save button are pinned above the nav bar.
- **Touch targets** are ≥44px (primary actions ≥52px) and inputs are ≥16px so iOS does not zoom on
  focus. Layout uses `dvh` and safe-area insets, so landscape and the home indicator do not clip
  content.
- **Fast first paint.** Routes are code-split, and Recharts — by far the heaviest dependency — is
  isolated in a lazily-loaded chunk, so the dashboard's KPI figures render before the charts arrive.
  The daily-entry screen is ~12 kB.

### Bilingual and RTL

The language toggle sets `lang` and `dir` on `<html>`. Because the styling uses logical properties
(`ms-*`, `me-*`, `text-start`), the entire layout — including the order of the bottom bar — mirrors
with no second stylesheet. Service names come from the database (`name_en` / `name_ar`), so a
service added later is bilingual with no code change. Numerals stay Western in both languages for
financial readability.

PDF export is the browser's own **Print to PDF**, driven by a print stylesheet. The browser handles
Arabic text shaping properly, which a bundled server-side PDF font typically does not.

---

## Testing

```bash
npm test
```

30 tests run against a real PostgreSQL database (`TEST_DATABASE_URL`), through the HTTP API, so
every rule is proven to hold for a caller that never touches the web app.

The suite includes the brief's acceptance scenario verbatim — Rodayna, September 2026, 10+5 on the
1st and 8+4 on the 2nd at 300/200, asserting **4,000**, **3,200** and a month total of **7,200**
independently through the daily endpoint, the monthly report, the dashboard KPI *and* the annual
report — followed by raising the examination fee to 350 from January 2027 and re-asserting that
September 2026 is unchanged.

It also covers: negative and fractional counts, negative fees, missing and invalid dates, unknown
clinics, duplicate services in one payload, duplicate-day prevention and idempotency, overlapping
price periods, refusing to book income on a date with no configured fee, the `line_total` CHECK
constraint (attacked with raw SQL that bypasses the service layer), trigger-maintained day totals,
timezone-shift regressions, inactive-clinic rules, CSV/XLSX export, and adding a third service with
no schema change.

---

## Sample data

`npm run db:seed` loads clearly-marked example data:

| Clinic | Examination / كشف | Consultation / استشارة |
|---|---:|---:|
| Rodayna | 300 | 200 |
| ElSafwa | 350 | 250 |

Both effective from 2026-01-01, open-ended. Change them freely in **Settings → Clinics / Services /
Pricing**; the seed is idempotent and never touches recorded income.

---

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | API and web together |
| `npm run build` | Build all three packages |
| `npm test` | API test suite |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Load sample data |
| `npm run db:reset` | **Drop and rebuild** the development database, then re-seed |
| `npm run db:studio` | Prisma Studio, a database browser |

---

## Extending it

The schema and layering were chosen so the following need extension, not redesign:

- **More clinics / services** — data entry today, no code change.
- **Doctors and doctor-level income** — add a `doctors` table and a nullable `doctor_id` on
  `daily_activity_lines`; existing rows stay valid and reports gain a grouping.
- **Expenses and net profit** — a sibling table to `daily_activities`; the reporting layer already
  aggregates by clinic and date range.
- **Users, roles, audit logs** — the auth seam and the `created_by` / `updated_by` columns are
  already in place.
- **Payment methods, patient counts** — additional columns on the line or header.

The reason these stay cheap is that a clinic-day is modelled as a header plus service lines rather
than as a fixed set of columns, and that money and dates have exactly one representation throughout
the stack.
