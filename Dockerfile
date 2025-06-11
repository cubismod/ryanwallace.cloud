ARG caddy_version=2.10@sha256:c5876b163e84c44815e2fbba68245367dcf341a15947f80bffffa011bdc90ece
ARG caddy_builder_version=2.10-builder@sha256:6e7a8ab47f8663a71e07458bf7f58e258fda81697a5af99e9eb836d9341a953a

# node bundling
FROM node:24.2.0@sha256:2a44af4aa20d3c9a4cb80c979a9853974600dd73e00423130305f1331ac9e63c as node

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
