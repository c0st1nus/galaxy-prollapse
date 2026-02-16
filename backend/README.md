# Backend Service

Elysia API service for the monorepo.

## Environment

Create runtime env file:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL`

Production requirement:
- `JWT_SECRET` must be a strong secret (startup validates this when `NODE_ENV=production`).

## Development

From repository root:

```bash
bun run infra:up
bun run --cwd backend dev
```

API health check:

```bash
curl http://localhost:3000/
```

## Build And Run

```bash
bun run --cwd backend build
bun run --cwd backend dist/index.js
```

## Migrations

```bash
bun run --cwd backend generate
bun run --cwd backend migrate
```
