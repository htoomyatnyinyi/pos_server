FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Generate Prisma Client
RUN bun x prisma generate

# Use host network to access host Postgres directly
# Connects to postgres:5432 on host

EXPOSE 6060

CMD ["bun", "run", "src/index.ts"]
