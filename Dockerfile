# =========================
# Stage 1: Install All Dependencies
# =========================
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
# Prisma needs the schema during install to set up engines correctly sometimes
COPY prisma ./prisma/ 

RUN bun install --frozen-lockfile

# =========================
# Stage 2: Build / Generate Client
# =========================
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy node_modules and prisma files from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Generate Prisma client BEFORE copying application code
# This ensures it is cached unless your schema or packages change!
RUN bun x prisma generate

# Now copy the rest of your source code
COPY . .

# If you were compiling/building TS to JS, you would run 'bun run build' here

# =========================
# Stage 3: Production Run
# =========================
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what is strictly necessary for production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

EXPOSE 6060

USER bun

CMD ["bun", "run", "src/index.ts"]




# # =========================
# # Install dependencies
# # =========================
# FROM oven/bun:1 AS deps

# WORKDIR /app

# COPY package.json bun.lock ./

# RUN bun install --frozen-lockfile

# # =========================
# # Build stage
# # =========================
# FROM oven/bun:1 AS builder

# WORKDIR /app

# COPY --from=deps /app/node_modules ./node_modules

# COPY . .

# RUN bun x prisma generate

# # =========================
# # Production stage
# # =========================
# FROM oven/bun:1-slim

# WORKDIR /app

# ENV NODE_ENV=production

# COPY --from=builder /app ./

# EXPOSE 6060

# USER bun

# CMD ["bun", "run", "src/index.ts"]





# # FROM oven/bun:latest

# # WORKDIR /app

# # COPY package.json bun.lock ./
# # RUN bun install --frozen-lockfile

# # COPY . .

# # # Generate Prisma Client
# # RUN bun x prisma generate

# # # Use host network to access host Postgres directly
# # # Connects to postgres:5432 on host

# # EXPOSE 6060

# # CMD ["bun", "run", "src/index.ts"]
