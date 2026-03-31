#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/db
npx drizzle-kit generate 2>/dev/null || true
npx drizzle-kit migrate
cd /app

echo "Starting Finance OS API..."
exec npx tsx apps/api/src/index.ts
