FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy workspace package.jsons for dependency resolution
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/finance-capabilities/package.json packages/finance-capabilities/package.json
COPY apps/api/package.json apps/api/package.json

RUN apk add --no-cache su-exec \
  && npm ci

# Copy source code
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/billing packages/billing
COPY packages/finance-capabilities packages/finance-capabilities
COPY apps/api apps/api

EXPOSE 27032

COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '27032') + '/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["/entrypoint.sh"]
