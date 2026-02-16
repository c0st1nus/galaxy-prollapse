FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN bun install --frozen-lockfile
RUN bun run build

FROM base AS release
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./package.json

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
