ARG caddy_version=2.10@sha256:c10cf853496a180595e521a7e5081e0ba0a85e4bd54321a751e3dc91c7b3dac9
ARG caddy_builder_version=2.10-builder@sha256:bcb684def90ebfaee228c239584efa7f4404f5af8dadefadd0bfc15d296cec7c

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
FROM hugomods/hugo:0.147.9@sha256:224b8b35194cbc3208119e90623bdf96c392afa17e87930147b9b2b1a0ff6866 AS builder
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
