# =============================================================================
# Stage 1 — builder
# =============================================================================
FROM node:22-alpine AS builder

RUN corepack enable \
    && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

COPY .npmrc ./
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

# Copia o Prisma client JÁ GERADO para o diretório de deploy.
# pnpm deploy --prod instala o pacote base @prisma/client do npm (sem os
# arquivos gerados pelo prisma generate). Ao copiar o .prisma gerado aqui no
# builder evitamos ter que rodar prisma generate de novo no CMD do runner,
# o que eliminaria a latência de ~30-60s no startup de produção.
RUN cp -r /app/apps/api/node_modules/.prisma /app/deploy/node_modules/ 2>/dev/null || true

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

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma && node dist/src/main.js"]
