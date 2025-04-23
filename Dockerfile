ARG caddy_version=2.9@sha256:748016f285ed8c43a9ce6e3aed6d92d3009d90ca41157950880f40beaf3ff62b
ARG caddy_builder_version=2.9-builder@sha256:1609bfce85bd4452a875e4d459f25e602c484b5a36e9c015511b5bdbd3539784

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
FROM hugomods/hugo:0.146.7@sha256:caa341cea1f248ed5c82228b9596239dfeef4c35308b3e9b4f3c3db95da9bfa3 AS builder
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
