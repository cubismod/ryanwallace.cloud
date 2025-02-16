ARG caddy_version=2.9@sha256:f27c4c64e20ca80651d1fdee831785e49553169bf9c9668600b456932f75ac47
ARG caddy_builder_version=2.9-builder@sha256:f27c4c64e20ca80651d1fdee831785e49553169bf9c9668600b456932f75ac47

# node bundling
FROM node:23.8.0@sha256:a182b9b37154a3e11e5c1d15145470ceb22069646d0b7390de226da2548aa2a7 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
RUN yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.143.1@sha256:cbf29f5d97937a8948a331c0762e0bf5b3124fd9ee1de644fc9e608db8505668 AS builder
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
