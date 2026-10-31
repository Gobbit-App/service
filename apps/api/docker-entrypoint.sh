#!/bin/sh
set -e
# Fail fast: the migrate script would otherwise fall back to a localhost URL.
: "${DATABASE_URL:?DATABASE_URL is required}"
echo 'running migrations'
pnpm --filter @gobbit/db db:migrate
exec pnpm --filter @gobbit/api start
