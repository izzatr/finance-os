#!/bin/sh
set -eu

# Some managed runtimes override Dockerfile USER. Drop privileges before doing
# anything, including migrations, so production cannot silently run as root.
if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$0" "$@"
fi

if [ "${NODE_ENV:-development}" = "production" ]; then
  : "${DATABASE_URL:?DATABASE_URL is required in production}"
  : "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required in production}"
  : "${BETTER_AUTH_URL:?BETTER_AUTH_URL is required in production}"
  : "${WEB_ORIGIN:?WEB_ORIGIN is required in production}"
  case "$BETTER_AUTH_URL" in https://*) ;; *) echo "BETTER_AUTH_URL must use https:// in production" >&2; exit 1 ;; esac
  case "$WEB_ORIGIN" in https://*) ;; *) echo "WEB_ORIGIN must use https:// in production" >&2; exit 1 ;; esac
  if [ "${#BETTER_AUTH_SECRET}" -lt 32 ]; then
    echo "BETTER_AUTH_SECRET must be at least 32 characters in production" >&2
    exit 1
  fi
fi

echo "Running database migrations..."
# Use Drizzle's runtime migrator. drizzle-kit remains development-only for
# authoring committed migrations and is never launched in production.
./node_modules/.bin/tsx packages/db/src/migrate.ts

echo "Starting Finance OS API..."
exec ./node_modules/.bin/tsx apps/api/src/index.ts
