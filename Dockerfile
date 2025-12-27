FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS build
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --target=bun --outdir=dist

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S app && \
    adduser -S -u 1001 -G app app

# Create config directory for tokens
RUN mkdir -p /home/app/.config/antigravity-openai && \
    chown -R app:app /home/app/.config

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

USER app

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
