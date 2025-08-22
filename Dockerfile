ARG caddy_version=2.10@sha256:133b5eb7ef9d42e34756ba206b06d84f4e3eb308044e268e182c2747083f09de
ARG caddy_builder_version=2.10-builder@sha256:fe8d0d6cdbfd382197c4d715ffd5b41210165e2f64a81ce546ae63eeef35873a


# node bundling
FROM node:24.6.0@sha256:d2b6b5aedb5b729f68ee1129e0f5a5d4713d93f82448249e82241876d8e8d86e as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
ENV DISABLE_OVERPASS=true
# Enable pnpm via corepack and install deps
RUN corepack prepare pnpm@10.15.0 --activate && pnpm install --frozen-lockfile=false
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" pnpm build && pnpm move && pnpm title

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
