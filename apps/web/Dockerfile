FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy workspace package.jsons for dependency resolution
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

# Copy source (only what web needs)
COPY packages/domain packages/domain
COPY apps/web apps/web

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build --workspace @finance-os/web

# Serve with nginx
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# The nginx image envsubsts /etc/nginx/templates/*.template into conf.d at boot,
# so the api upstream stays configurable per environment.
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:27032

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
