ARG caddy_version=2.10@sha256:4163a5c7b7631707956db4057720ec75de429992d5e3aa518d54872c01644dbe
ARG caddy_builder_version=2.10-builder@sha256:3c711fcf9a64d31e8927a2efb538cf99e6f758f737aadcde5fd7dfadc93287a8


# node bundling
FROM node:24.7.0@sha256:701c8a634cb3ddbc1dc9584725937619716882525356f0989f11816ba3747a22 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map

ENV DISABLE_OVERPASS=true
ENV NODE_ENV=production
# Enable pnpm via corepack and install deps
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate && pnpm install --frozen-lockfile=false --force
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
    MT_KEY="$(cat /run/secrets/MT_KEY)" pnpm exec webpack --config webpack.config.js --mode production && pnpm move && pnpm title && pnpm title:alerts

# hugo build
FROM hugomods/hugo:0.149.0@sha256:ceac84d818db61e6514fef53b25bc225ef3364fe2f0a4ae1df2e4a3fe6be37c0 AS builder
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
