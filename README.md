# attendance-backend

## Setup

```bash
npm install
cp .env.example .env
# fill in .env with your real Supabase DATABASE_URL and JWT secrets
npm run dev
```

Then visit http://localhost:3000/health — you should see `{"status":"ok"}`.
This confirms Express itself is running. It does NOT yet confirm the DB
connection, since the health route doesn't query the database — that's an
easy first improvement once `src/config/db.js` is wired into a route.

## What's implemented vs. stubbed

- **Fully implemented:** Express app wiring (`app.js`), error handler,
  `authenticate` middleware (JWT verification), `requireAdmin` middleware,
  `token.service.js` (JWT sign/verify).
- **Stubbed (returns HTTP 501, has TODO comments):** every controller
  function. Each stub is wired to its route already, so you can build them
  out one at a time and test immediately with Postman/curl without touching
  routing code.

## Suggested build order

1. `src/config/db.js` — confirm the Supabase connection works (add a
   `SELECT NOW()` test route temporarily).
2. `controllers/auth.controller.js` → `register`, then `login`. This is the
   first real endpoint pair worth getting fully working end-to-end.
3. `services/checkin.service.js` + `controllers/checkin.controller.js` — the
   core feature.
4. Everything else in `docs/api-contract.md`, in whatever order suits you.

Refer to `../docs/api-contract.md` (one level up, at the monorepo root) for
exact request/response shapes for every endpoint.
