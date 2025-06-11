ARG caddy_version=2.10@sha256:cd038960363e661b805a40ee6d03ba98608538f197c08cb915cb4af89e23a5b4
ARG caddy_builder_version=2.10-builder@sha256:c7237a4e4b7d31b697a8672c7418be98471a3f30f44477e3fa36b9d16df35797

# node bundling
FROM node:24.2.0@sha256:16d3d3862d7442290079b2d073805f7584f466f7e2f69bde164ad5f16b272c67 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.147.8@sha256:ee996d7166c8ab5c511f4d261f529ac478bdce5d6354fe92b3d00c2e3212bfbd AS builder
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
