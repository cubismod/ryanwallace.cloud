ARG caddy_version=2.10@sha256:87aa104ed6c658991e1b0672be271206b7cd9fec452d1bf3ed9ad6f8ab7a2348
ARG caddy_builder_version=2.10-builder@sha256:13bf132b50ab5a3abd4d62d4da27a9d8fd98818028746fe85e745d73e3e71f3d


# node bundling
FROM node:24.8.0@sha256:82a1d74c5988b72e839ac01c5bf0f7879a8ffd14ae40d7008016bca6ae12852b as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map

ENV DISABLE_OVERPASS=true
ENV NODE_ENV=production

# Enable pnpm via corepack and install deps
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate && pnpm install --frozen-lockfile=false --force
# https://fly.io/docs/apps/build-secrets/
RUN pnpm exec webpack --config webpack.config.js --mode production && pnpm move && pnpm title && pnpm title:alerts

# hugo build
FROM hugomods/hugo:0.150.0@sha256:01f333546fe7e4c5cb136be29dd7ce549216ad5df1f9f92fc4e888f596907544 AS builder
WORKDIR /build

COPY --from=node /build .

RUN hugo build --cleanDestinationDir --minify --gc

# build caddy extension
FROM caddy:$caddy_builder_version AS caddy-builder

RUN xcaddy build \
     --with github.com/caddyserver/cache-handler

# final image
FROM caddy:$caddy_version AS server
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
WORKDIR /var/www/html

COPY --from=builder /build/public/ .
ADD Caddyfile /etc/caddy/Caddyfile
