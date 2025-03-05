ARG caddy_version=2.9@sha256:1c4bc9ead95a0888f1eea3a56ef79f30bd0d271229828fdd25090d898f553571
ARG caddy_builder_version=2.9-builder@sha256:4c455f2cf685637594f7112b2526229a58a6039975fd1915281d452b2075bda3

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
