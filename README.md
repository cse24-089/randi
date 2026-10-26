# Thuso — Botswana Skills Intelligence

Thuso helps people explore Botswana labour-market signals, skills demand, career suitability, skills gaps, and training opportunities. The application now includes an Express API and PostgreSQL persistence; GitHub Pages can serve only the static prototype, not the full-stack features.

## Run locally with Docker

1. Copy `.env.example` to `.env`.
2. Set a unique URL-safe `POSTGRES_PASSWORD`, a random `SESSION_SECRET` of at least 32 characters, and the initial `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
3. Start the app and database:

   ```powershell
   docker compose up --build
   ```

4. Open `http://localhost:3000`. Sign in with the configured administrator account to import datasets. Register other accounts through the sign-in dialog.

The app creates or updates its database schema on startup. PostgreSQL data is stored in the `postgres-data` Docker volume. This local HTTP Compose setup disables secure-only cookies for localhost; do not expose it as a public deployment. Never commit `.env` or expose credentials in a public repository.

### Run without Docker

Install Node.js 20+ and PostgreSQL, configure `.env`, then run:

```powershell
npm ci
npm start
```

For development with automatic server restarts, use `npm run dev`. To apply the schema separately, use `npm run migrate`.

## Labour-market CSV imports

In the administrator account, open **Data administration** and use one of the downloadable CSV templates. A file can contain `job` and `training` records. Jobs require `title`, `company`, `sector`, `location`, `source_name`, `posted_at` (`YYYY-MM-DD`), and `skills` (semicolon-separated); salary and source URL may be blank. Training records require `provider_name`, `location`, and `offerings`; `source_url` may be blank.

Imports are limited to 2 MB and 10,000 rows, validated before database writes, and applied in a transaction. HTTPS source URLs are used for de-duplication; rows without URLs are de-duplicated by job title/company/date or provider name/location. Each import is audited. Only trusted, lawfully obtained data should be imported.

The initial deployment supports administrator-managed CSV sources. It does not crawl job sites or connect to external labour-market APIs; source agreements, formats, refresh schedules, and provenance need to be agreed before adding automated feeds.

## Included capabilities

- Registration, sign-in/sign-out, hashed passwords, CSRF protection, secure session cookies, and rate limits on authentication and imports.
- Per-account profile fields for skills, proficiency, qualifications, interests, and career goals.
- Database-backed saved insights.
- Public market summary, trends, skills-demand ranking and change, employer directory, and training provider list.
- Signed-in recommendations that combine skills match with profile interests, qualifications, career goals, and vacancy demand; skills-gap reports can include matching training providers.
- Administrator-only CSV templates, transactional imports, audit history, dataset counts, and database-pool status.
- PNG dashboard snapshot export.

The values displayed before any CSV data is imported are illustrative samples. They must not be presented as official or live labour-market statistics.

Career suitability is a transparent starting score: up to 80 points from matched required skills and a 20-point profile-context match, with roles ordered by vacancy volume. It is not a hiring outcome or a guarantee of employment.

## API overview

All API endpoints are same-origin under `/api`. State-changing requests require the CSRF token from `GET /api/csrf` in the `X-CSRF-Token` header.

| Area | Endpoints |
| --- | --- |
| Health | `GET /api/health` |
| Accounts | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Profile | `GET /api/profile`, `PUT /api/profile` |
| Saved insights | `GET /api/saved-insights`, `PUT` and `DELETE /api/saved-insights/:id` |
| Labour market | `GET /api/market/summary`, `/trends`, `/skills`, `/employers`, `/training` |
| Recommendations | `GET /api/recommendations`, `GET /api/skills-gap` (signed in) |
| Administration | `GET /api/admin/overview`, `GET /api/admin/imports`, `POST /api/admin/imports`, `GET /api/admin/template/:kind.csv` (admin only) |

## Production deployment and operations

GitHub Pages is static hosting and cannot run Express or PostgreSQL. Deploy the Docker image or Node app to an application host and use a managed PostgreSQL service (or a secured private database). Configure HTTPS at the hosting proxy, set `SESSION_COOKIE_SECURE=true`, set `TRUST_PROXY=1` only behind a trusted proxy, and supply secrets through the host’s secret manager. Set `PGSSLMODE=require` when the database provider requires TLS. Choose database storage with encryption at rest for profile and account data; production session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. The Compose setup defaults to not trusting forwarded proxy headers; override `TRUST_PROXY=1` only when traffic actually arrives through a trusted proxy.

The `/api/health` endpoint checks the database connection and is used by the container health check. For recovery, take encrypted off-host database backups and test restores. For example, run `pg_dump` against the production database and store the output in access-controlled backup storage; a Docker volume by itself is not a backup. Configure monitoring, alerting, managed database backups, multi-zone capacity, and an incident/recovery runbook with the selected host.

The application code alone cannot guarantee 99% availability, 24/7 service, backup retention, recovery time, data-source licensing, or a five-second response at arbitrary scale. Those targets require production infrastructure, operational monitoring, load tests, regular restore tests, and agreed labour-market data feeds. The included connection pool and database indexes are starting points, not a capacity guarantee.

## Checks

```powershell
npm test
npm run check
```
