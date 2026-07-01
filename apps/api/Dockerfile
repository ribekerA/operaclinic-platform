# =============================================================================
# Stage 1 — builder
# =============================================================================
FROM node:22-alpine AS builder

RUN corepack enable \
    && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY package.json ./
COPY apps/api/package.json             ./apps/api/package.json
COPY packages/shared/package.json      ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api      ./apps/api
COPY packages/shared ./packages/shared

# Gera o Prisma client antes de compilar (tipos são necessários para nest build)
RUN pnpm --filter @operaclinic/api exec prisma generate

RUN pnpm --filter @operaclinic/shared build
RUN pnpm --filter @operaclinic/api run build

# pnpm deploy: cria /app/deploy com prod deps + onlyBuiltDependencies permite
# que @prisma/engines e prisma rodem seus postinstall (baixam binaries)
RUN pnpm --filter @operaclinic/api deploy --prod /app/deploy

# =============================================================================
# Stage 2 — runner
# =============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/deploy ./
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

CMD ["sh", "-c", "node_modules/.bin/prisma generate --schema=./prisma/schema.prisma && node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma && node dist/src/main.js"]
