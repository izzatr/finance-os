FROM node:20-alpine

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

RUN npm install

# Copy source code
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/billing packages/billing
COPY packages/finance-capabilities packages/finance-capabilities
COPY apps/api apps/api

EXPOSE 27032

COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
