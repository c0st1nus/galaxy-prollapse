FROM oven/bun:latest AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY ./dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "dist/index.ts"]