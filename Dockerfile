ARG caddy_version=2.9@sha256:dd909ed5361bc60e7e27b6f03929cf2b8e15883139cadf14bcdb3dfbea6708b4
ARG caddy_builder_version=2.9-builder@sha256:e1d79fec37283c7a131b6c58be820c44263c118ee69dc0ce6b78a25515f96cc8

# node bundling
FROM node:23.11.0@sha256:c5bfe90b30e795ec57bcc0040065ca6f284af84a1dafd22a207bd6b48c39ce01 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.146.1@sha256:a75299129e204fe20acbcb13d97e278e361af1ca1d23aaa1b2e969f3d43d7754 AS builder
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
