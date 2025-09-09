ARG caddy_version=2.10@sha256:4163a5c7b7631707956db4057720ec75de429992d5e3aa518d54872c01644dbe
ARG caddy_builder_version=2.10-builder@sha256:5d3e2fc2ba02ecf51ebbfbbea2ce0ab64d3aa80c99722ed929f8bf973be7e831


# node bundling
FROM node:24.7.0@sha256:ccb086eb457ad144b1157af458bba3ed1352422f1f672609f54f8db567e55eb4 as node

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
FROM hugomods/hugo:0.149.1@sha256:61dd3db68b89d560908ad24d8c000b92f730c923cd9a6755b6c148d49ec96b13 AS builder
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
