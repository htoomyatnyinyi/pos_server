# =========================
# Stage 1: Install All Dependencies (Used directly for super-fast dev)
# =========================
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma/ 

RUN bun install --frozen-lockfile

# =========================
# Stage 2: Build / Generate Client
# =========================
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

RUN bun x prisma generate
COPY . .

# =========================
# Stage 3: Production Run
# =========================
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

EXPOSE 6060
USER bun
CMD ["bun", "run", "src/index.ts"]