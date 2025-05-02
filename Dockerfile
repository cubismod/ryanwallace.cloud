ARG caddy_version=2.10@sha256:e759110e56bae353dbceddff9d7665feb5229d5afac1a5e7e3f42d99218f9ba6
ARG caddy_builder_version=2.10-builder@sha256:680deea9ca2c0e5e415573a0debd1aa92a7a298a147e70079fd5ac6eaaadbad9

# node bundling
FROM node:23.11.0@sha256:ee8a0bc5bbaece0c538c76e7c20fde6d4db319bbd5d4e423940999f16da89aa1 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.147.1@sha256:d8dae8479fcc0b5f1fbe904bdf29a776022c62158128184246113a259c9722bb AS builder
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
