FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY prisma ./prisma/
RUN bun x prisma generate

COPY . .

EXPOSE 6060

CMD ["bun", "run", "src/index.ts"]