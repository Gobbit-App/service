# D51: build the Reader PWA to static files, then serve them (and route /api, /s) with Caddy.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

RUN corepack enable && corepack prepare pnpm@11.15.0 --activate && pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/api-client/ packages/api-client/
COPY apps/web/ apps/web/

# GIT_SHA (passed by CI) busts the persisted query cache and is served as /version.json.
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}

RUN pnpm --filter @pb/web build \
  && node -e "require('node:fs').writeFileSync('apps/web/dist/version.json', JSON.stringify({ commit: process.env.GIT_SHA }) + '\n')"

FROM caddy:2-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

EXPOSE 80

HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1/version.json || exit 1
