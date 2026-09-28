FROM node:22-slim

WORKDIR /app

# Copy workspace configuration and root files for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy workspace package.json files
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

# Install dependencies
RUN corepack enable && corepack prepare pnpm@11.15.0 --activate && pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY apps/api/ apps/api/

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use non-root user
RUN chown -R node:node /app
USER node

# Entrypoint
ENTRYPOINT ["sh", "apps/api/docker-entrypoint.sh"]
