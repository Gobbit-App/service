#!/bin/sh
set -e
echo 'running migrations'
pnpm --filter @pb/db db:migrate
exec pnpm --filter @pb/api start
