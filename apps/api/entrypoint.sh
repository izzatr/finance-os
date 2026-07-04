#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/db
# migrate only — generating migrations at boot against a live database is a
# footgun; migrations are authored and committed at development time.
npx drizzle-kit migrate
cd /app

echo "Starting Finance OS API..."
exec npx tsx apps/api/src/index.ts
