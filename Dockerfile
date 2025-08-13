ARG caddy_version=2.10@sha256:133b5eb7ef9d42e34756ba206b06d84f4e3eb308044e268e182c2747083f09de
ARG caddy_builder_version=2.10-builder@sha256:fe8d0d6cdbfd382197c4d715ffd5b41210165e2f64a81ce546ae63eeef35873a

# node bundling
FROM node:24.5.0@sha256:dc4ac80350904c2797058e477a30b6285e9e025f23f139ea8b277c9efe55dd9a as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.148.2@sha256:3580c438a87d91fab06209c7e633bd2f8e9cccef2021743272293625f3c2119b AS builder
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
