FROM oven/bun:1

WORKDIR /app

# Copy dependency files first to leverage Docker caching
COPY package.json bun.lock ./
RUN bun install

# Copy Prisma schema and generate the client
COPY prisma ./prisma/
RUN bun x prisma generate

# Copy the rest of the application source code
COPY . .

EXPOSE 6060

# Corrected CMD syntax (removed the trailing ", load")
CMD ["bun", "run", "src/index.ts"]



# FROM oven/bun:1

# WORKDIR /app

# COPY package.json bun.lock ./
# RUN bun install

# COPY prisma ./prisma/
# RUN bun x prisma generate

# COPY . .

# EXPOSE 6060

# CMD ["bun", "run", "src/index.ts"]