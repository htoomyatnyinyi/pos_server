# =========================
# Install dependencies
# =========================
FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

# =========================
# Build stage
# =========================
FROM oven/bun:1 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN bun x prisma generate

# =========================
# Production stage
# =========================
FROM oven/bun:1-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 6060

USER bun

CMD ["bun", "run", "src/index.ts"]





# FROM oven/bun:latest

# WORKDIR /app

# COPY package.json bun.lock ./
# RUN bun install --frozen-lockfile

# COPY . .

# # Generate Prisma Client
# RUN bun x prisma generate

# # Use host network to access host Postgres directly
# # Connects to postgres:5432 on host

# EXPOSE 6060

# CMD ["bun", "run", "src/index.ts"]
