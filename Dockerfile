ARG caddy_version=2.10@sha256:f880657326733fb266a317b4ee31d6a3090a6bbff3dcb0c97833093810d59b46
ARG caddy_builder_version=2.10-builder@sha256:e5612b84a4a8c0d452da55d3d7d97985a5039ef3be6e399fd7264bb070f30559

# node bundling
FROM node:24.3.0@sha256:256a2e7037e745228f7630d578e6c1d327ab4c0a8e401c63d0d4d9dfb3c13465 as node

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
