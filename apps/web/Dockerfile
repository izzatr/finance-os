FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

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
FROM nginx:alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# The nginx image envsubsts /etc/nginx/templates/*.template into conf.d at boot,
# so the api upstream stays configurable per environment.
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:27032

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
