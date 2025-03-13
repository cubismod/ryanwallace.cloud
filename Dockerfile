ARG caddy_version=2.9@sha256:cd261fc62394f1ff0b44f16eb1d202b4e71d5365c9ec866a4f1a9c5a52da9352
ARG caddy_builder_version=2.9-builder@sha256:84fcb47a54c6149dcbb8f6320dc9421a8c9fb16879d3b6c71741d6a9ebea7c37

# node bundling
FROM node:23.9.0@sha256:c29271c7f2b4788fe9b90a7506d790dc8f2ff46132e1b70e71bf0c0679c8451c as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
RUN yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.145.0@sha256:879cf9ff9c411cf9a2904d466bedcac1f26a8c09fcdb663ca90dcf94a47f49cb AS builder
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
