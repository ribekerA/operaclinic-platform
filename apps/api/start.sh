#!/bin/sh
set -e

# Start the NestJS app in the foreground immediately. PrismaService connects
# lazily (onModuleInit is a no-op) so no DB connection is needed at startup.
# The health endpoint returns 200 without querying the DB, which allows
# Render's rolling deploy to mark this container healthy and stop the old one.
#
# Once the old container stops, its DB connections are released. A background
# process then runs migrations and exits. The app continues serving traffic.

SCHEMA="./prisma/schema.prisma"
MIGRATE_BIN="node_modules/.bin/prisma"

run_migrations() {
  echo "[startup] Running migrations in background..."
  RETRIES=0
  while [ $RETRIES -lt 15 ]; do
    if "$MIGRATE_BIN" migrate deploy --schema="$SCHEMA" 2>&1; then
      echo "[startup] Migrations applied successfully."
      return 0
    fi
    RETRIES=$((RETRIES + 1))
    echo "[startup] Migration attempt $RETRIES failed — retrying in 10s..."
    sleep 10
  done
  echo "[startup] WARNING: migrations did not complete after $RETRIES attempts." >&2
}

# Run migrations in background (non-blocking so the app starts immediately)
run_migrations &

# Start the app in the foreground — signals (SIGTERM) are delivered directly
exec node dist/src/main.js
