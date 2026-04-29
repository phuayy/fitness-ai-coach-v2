# Fitness AI Local Pose Coach

A production-oriented starter for the architecture you requested:

- **Frontend on Vercel**: local camera preview, local MediaPipe Pose Landmarker inference, instant canvas overlay, immediate rep/form feedback.
- **Backend on Render**: user accounts, JWT login, session tracking, rep history, aggregate validation, coaching advice, database storage.
- **No WebRTC dependency** for the main coaching loop. The camera feed stays in the browser, so overlay latency is not tied to Render/Vercel round trips, TURN credentials, or server video relays.

This project is intentionally split into `apps/web` and `services/api` so you can deploy the frontend and backend independently.

## Architecture

```text
Browser / Vercel frontend
  ├─ getUserMedia camera preview
  ├─ MediaPipe Tasks Vision PoseLandmarker, running locally
  ├─ requestAnimationFrame canvas overlay
  ├─ local rep counter and form feedback
  └─ HTTPS JSON API calls only when saving sessions/reps

Render backend
  ├─ FastAPI REST API
  ├─ JWT auth
  ├─ SQLAlchemy database models
  ├─ SQLite for local dev / Postgres for Render production
  ├─ session and rep persistence
  └─ rule-based coaching advice + validation hooks
```

## Why this design fixes the lag you saw

Your earlier WebRTC design streamed frames to the backend, performed processing there, then returned overlay/results. That is fragile for real-time fitness feedback because every frame is affected by network jitter, ICE/TURN behavior, server CPU, Render cold starts, Python inference latency, serialization, and client redraw timing.

This version keeps inference and overlay drawing local in the browser. The backend receives small JSON events only after reps or session changes. That keeps the overlay tied to the camera frame instead of the network path.

## Current version choices

Frontend:

- React `19.2.5`
- React DOM `19.2.5`
- Vite `8.0.10`
- `@vitejs/plugin-react` `6.0.1`
- TypeScript `6.0.3`
- `@mediapipe/tasks-vision` `0.10.34`

Backend:

- Python `3.12+`
- FastAPI `0.136.1` via `fastapi[standard]`
- SQLAlchemy 2.x
- Pydantic Settings
- PyJWT
- pwdlib for password hashing
- psycopg for Render Postgres

## Local setup

### 1. Backend

```bash
cd services/api
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

### 2. Frontend

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Render deployment

Create a Render **Web Service** with:

- Root Directory: `services/api`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Runtime: Python 3.12+

Render environment variables:

```bash
APP_ENV=production
JWT_SECRET=<generate-a-long-random-secret>
DATABASE_URL=<your-render-postgres-internal-database-url>
FRONTEND_ORIGINS=https://your-vercel-domain.vercel.app
LOG_LEVEL=INFO
```

For first testing, you can omit `DATABASE_URL`; the backend will use SQLite. For public production, use Render Postgres.

## Vercel deployment

Create a Vercel project with:

- Root Directory: `apps/web`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Vercel environment variables:

```bash
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

Redeploy after changing environment variables.

## Security and privacy notes

- Camera frames are not uploaded in the main flow.
- Only session/rep metrics are sent to the backend.
- JWT secret must never be committed.
- Use HTTPS in production; browser camera APIs require a secure context outside localhost.
- The current database setup creates tables automatically for MVP speed. Add Alembic migrations before serious production use.

## What is included

- Local browser pose detection with MediaPipe PoseLandmarker.
- Smooth overlay with canvas drawing inside `requestAnimationFrame`.
- Throttled React state updates to avoid re-render lag.
- Squat and push-up starter rep logic.
- Login/register flow.
- Session start/finish.
- Rep saving.
- Session history.
- Backend validation and advice endpoints.

## What you should improve next

- Replace starter exercise heuristics with calibrated exercise-specific finite-state machines.
- Add calibration screen for camera angle and body proportions.
- Add Alembic migrations.
- Add refresh tokens and email verification.
- Add Google OAuth after the base email/password flow is stable.
- Add a real LLM advice provider behind the existing `advice_service.py` interface if needed.
