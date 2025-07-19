ARG caddy_version=2.10@sha256:e23538fceb12f3f8cc97a174844aa99bdea7715023d6e088028850fd0601e2e2
ARG caddy_builder_version=2.10-builder@sha256:acf9b51367f2cdd94a5621b1d5f37a3d095b5f6e2157c83b48d2b1f127576366

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
