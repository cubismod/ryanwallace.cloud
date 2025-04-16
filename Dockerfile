ARG caddy_version=2.9@sha256:1972548f05660a069cfdf052aa2b923ce691627cbad1b7b97fb0a18533a766f2
ARG caddy_builder_version=2.9-builder@sha256:84c64e5704f0b7366f0721cd9f5e6be155e824126dd12fe3f0fd7d6ea996b78b

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
FROM hugomods/hugo:0.146.5@sha256:b94021030ccb01c67485c0ffa7fd6077777d2155c07b9277c3658a5ff5046d80 AS builder
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
