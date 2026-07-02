# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

# Copy workspace manifests for dependency layer caching
COPY .npmrc ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY turbo.json ./

# Copy only the package.json files first (better cache hit ratio)
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install all dependencies (including dev, needed for the build)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Build shared package first (web may import from it)
RUN pnpm --filter @operaclinic/shared build || true

# Build Next.js — outputs standalone because next.config.ts has output: 'standalone'
# NEXT_PUBLIC_API_BASE_URL is baked in at build time; override at runtime via env
ARG NEXT_PUBLIC_API_BASE_URL=https://operaclinic-api.onrender.com/api/v1
ARG NEXT_PUBLIC_API_URL=https://operaclinic-api.onrender.com
ARG NEXT_PUBLIC_APP_NAME=OperaClinic
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

RUN pnpm --filter @operaclinic/web build

# ─── Stage 2: Production runner ──────────────────────────────────────────────
# next.config.ts sets outputFileTracingRoot to the monorepo root,
# so Next.js emits the standalone tree with paths relative to the root:
#   .next/standalone/apps/web/server.js   ← entry point
#   .next/standalone/apps/web/.next/      ← chunked runtime
#   .next/static/                         ← public static assets
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy the standalone output (already contains all required node_modules)
COPY --from=builder /app/apps/web/.next/standalone ./

# Static assets must live beside the app at the path Next.js expects
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Public assets (favicons, images, etc.)
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

# server.js is at apps/web/server.js inside the standalone tree
CMD ["node", "apps/web/server.js"]
