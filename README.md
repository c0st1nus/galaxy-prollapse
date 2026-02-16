# Galaxy Prollapse Monorepo

Monorepo with:
- `backend/`: Elysia API + Drizzle migrations
- `web/`: SvelteKit frontend + Capacitor projects (Android/iOS) kept in repo

## Deployment Strategy

Only two modes are supported:
- Local development
- AWS production build/deploy

`deploy:aws` never triggers Capacitor Android/iOS commands.

## Prerequisites

- Bun
- Docker + Docker Compose

```bash
bun --version
docker --version
docker compose version
```

## Environment Files

- `.env` (root): local infra values and frontend build vars
- `backend/.env`: backend runtime values

Bootstrap from templates:

```bash
bun run setup
```

## Local Development

```bash
bun run infra:up
bun run dev
```

Default endpoints:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Stop/reset infra:

```bash
bun run infra:down
bun run infra:reset
```

## AWS Production

```bash
bun run deploy:aws
```

This runs:
- `bun run --cwd backend build`
- `bun run --cwd web build`

It does not run any `android:*`, `ios:*`, or `cap:*` scripts.

## Capacitor Note

Capacitor projects remain versioned in GitHub for mobile maintenance, but are not part of production deployment.
If mobile native sync/build is needed, run commands directly from `web/package.json`.

## Key Scripts

- `bun run setup`
- `bun run infra:up`
- `bun run infra:down`
- `bun run infra:reset`
- `bun run dev`
- `bun run deploy:aws`

See `DEPLOYMENT.md` for full env and rollout details.
