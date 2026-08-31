# OfficeFlow — Guard Tracking — PRD

## Original Problem Statement
1. Load the git repo https://github.com/abirbox/OfficeflowV11-Guardtracking.git unchanged into /app and make a live preview.
2. Add to the Dispatch Schedule: a Shift URL (copy/open the unique shift-tracking link) on each schedule row.
3. Add a "Live Tracking" page/menu in the Dispatch portal showing a live map of currently clocked-in officers (pins with name, post pin, shift details), updating in near real-time.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), routes under `/app/backend/routes/*`, models `/app/backend/models/*`, utils `/app/backend/utils/*`. All API routes prefixed `/api`. MongoDB via Motor. APScheduler runs a 60s shift-alert scan.
- Frontend: React 19 + CRACO + Tailwind + shadcn/ui. Auth via zustand store + httpOnly cookies. Leaflet/react-leaflet for maps.
- Domain: workforce/HR + security-guard dispatch (employees, attendance, GPS, shifts, payroll, dispatch scheduling/invoices/payments, client portal, public token-based shift tracking).

## Setup / Environment Notes
- `.env` files are gitignored. Backend `.env` created with MONGO_URL, DB_NAME, CORS_ORIGINS, JWT_SECRET (mandatory), FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD, STORAGE_ROOT. (APP_ENCRYPTION_KEY omitted → derived from JWT_SECRET.)
- Frontend deps missing from repo package.json were added: zustand@5.0.15, use-sync-external-store@1.4.0, leaflet, react-leaflet, lottie-react@2.4.1, exceljs, @fontsource/{space-grotesk,manrope,jetbrains-mono}.
- Backend: installed requirements minus the redundant standalone `litellm` URL pin (it conflicts; emergentintegrations already pulls the same wheel).

## Credentials
- Super Admin: admin@example.com / admin123 (auto-seeded on empty DB). Auth is cookie-based (no bearer token).

## Implemented (with dates)
- 2026-08-31: Repo loaded verbatim into /app; backend+frontend running under supervisor.
- 2026-08-31: **Fixed critical login hang** ("Loading..." forever). Root cause: a corrupted/mismatched `zustand`/`use-sync-external-store` install broke `useSyncExternalStore`, so store updates never re-rendered. Fixed by clean reinstall (zustand 5.0.15 + use-sync-external-store 1.4.0). Also hardened: `GuestRoute` now renders the login form immediately with a background auth check; axios instance has a 15s timeout + one automatic retry for idempotent GETs (`/app/frontend/src/lib/axios.js`).
- 2026-08-31: **Shift URL on Dispatch Schedule rows** — Manage column has a copy-link icon (`copy-tracking-<id>`) plus a kebab menu with "Open tracking page" (`open-tracking-<id>`) and "Copy tracking link". URL = `<FRONTEND_URL>/shift/<tracking_token>` (schedules already return `tracking_token`/`tracking_url`). File: `DispatchSchedulePage.js`.
- 2026-08-31: **Live Tracking** — new page `LiveTrackingPage.js` (route `/dashboard/dispatch/live-tracking`), nav item in `DashboardLayout.js` (perm `dispatch.schedule.view`), backed by new endpoint `GET /api/dispatch/live-tracking` in `dispatch.py` returning clocked-in officers with last-known position (latest check-in ping → clock-in location → post geofence). Leaflet map with per-officer pins, geofence circles, popups (name/post pin/client/shift/clock-in/check-ins), "On Duty" side panel, 10s auto-refresh.

## Verified
- Testing agent iteration_2: backend 5/5 pytest pass, frontend 100%. Login works (no hang), Live Tracking map renders a seeded clocked-in officer with position, schedule rows expose working copy/open tracking links. Regression suite: `/app/backend/tests/test_iter31_live_tracking.py` (+ `seed_iter31_live.py`).
- Fixed the one reported UI issue (Manage column clipping) by moving tracking actions into the kebab menu + one visible copy icon.

## Backlog / Next (P1/P2)
- P2: `/api/dispatch/live-tracking` does N+1 lookups (officer/post/client per schedule) — batch with `$in` before large volumes.
- P2: `/api/ws/dispatch` WebSocket connection fails in preview (app falls back to polling; no functional impact) — silence/handle the noise, or implement true WS push for Live Tracking.
- P2: `dispatch.py` is very large (~3.3k lines) — split into sub-routers.
