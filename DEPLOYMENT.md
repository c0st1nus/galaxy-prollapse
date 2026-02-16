# Deployment And Environment Guide

This repo supports exactly two operational modes:
- Local development
- AWS production deploy

Capacitor Android/iOS projects are kept in the repository, but are not part of production deployment.

## 1. Environment Model

### 1.1 Root `.env` (infra + frontend build)

Used by:
- `docker-compose.yaml` local services (`db`, `minio`)
- frontend build-time vars (for example `PUBLIC_API_BASE_URL`)

Main keys:
- `POSTGRES_*`, `POSTGRES_PORT`
- `MINIO_*`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`
- `PUBLIC_API_BASE_URL`

### 1.2 `backend/.env` (backend runtime)

Used by:
- `bun run --cwd backend dev`
- backend runtime in production

Main keys:
- `DATABASE_URL` (required)
- `JWT_SECRET` (required)
- `PORT`
- `MINIO_*`
- `MINIO_PUBLIC_BASE_URL`
- `OPENAI_API_KEY` (optional)

## 2. Local Development

Bootstrap:

```bash
bun run setup
```

Run local stack:

```bash
bun run infra:up
bun run dev
```

Endpoints:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`
- minio api: `http://localhost:9000`
- minio console: `http://localhost:9001`

Stop/reset local infra:

```bash
bun run infra:down
bun run infra:reset
```

## 3. AWS Production Deploy

Single production build command:

```bash
bun run deploy:aws
```

`deploy:aws` performs:
- backend build (`bun run --cwd backend build`)
- frontend static build (`bun run --cwd web build`)

`deploy:aws` does not execute any Capacitor scripts.

### 3.1 Backend rollout

Prepare `backend/.env` with production values:
- `NODE_ENV=production`
- production `DATABASE_URL`
- strong `JWT_SECRET`
- production object storage config (`MINIO_*` or S3-compatible endpoint values)
- optional `OPENAI_API_KEY`

Run backend using your AWS runtime target (ECS/EC2/container/PM2/systemd), pointing to built backend output in `backend/dist`.

### 3.2 Frontend rollout

Deploy `web/build/` as static assets behind SPA fallback (`index.html` fallback for unknown routes).
Ensure `PUBLIC_API_BASE_URL` is set to the public backend API URL before build.

## 4. Production Smoke Checklist

1. `GET /` responds from backend service
2. auth flow works (login/register)
3. task list and task updates work
4. file upload URLs are reachable
5. frontend calls the expected production API host
