ARG caddy_version=2.10@sha256:5ce77de8c70cbdbd17ea69162b5a0539503fb9e1a9329cce42dc0f54821cc2af
ARG caddy_builder_version=2.10-builder@sha256:cc39c328df6f5688c9fd98c2f4babb9b6ba38f1dda7d9a47b726fbc5b863d655

# node bundling
FROM node:24.4.1@sha256:601f205b7565b569d3b909a873cc9aa9c6f79b5052a9fe09d73e885760237c4c as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.148.1@sha256:8672c5cd543a066f4c04a8c6920d9ffff5bb596dfa57f9c707a6ef0fae859717 AS builder
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
