# ── Stage 1: install dependencies ─────────────────────────
FROM oven/bun:latest AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

# ── Stage 2: build ────────────────────────────────────────
FROM deps AS build
COPY src ./src
RUN bun build src/index.ts --outdir dist --target bun

# ── Stage 3: production image ─────────────────────────────
FROM oven/bun:latest AS runtime
WORKDIR /app

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=build   /app/dist         ./dist
COPY drizzle                          ./drizzle
COPY package.json                     ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
