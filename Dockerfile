ARG caddy_version=2.10@sha256:e759110e56bae353dbceddff9d7665feb5229d5afac1a5e7e3f42d99218f9ba6
ARG caddy_builder_version=2.10-builder@sha256:680deea9ca2c0e5e415573a0debd1aa92a7a298a147e70079fd5ac6eaaadbad9

# node bundling
FROM node:23.11.0@sha256:42cb7b259ff53bf6012a5e68a6d00f9f9a70857be829059e355ffff1feaaa48b as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.147.0@sha256:978396724c9b157e4598893e7b0bff52934ad9fd88cd532e17ac3683b4582481 AS builder
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
