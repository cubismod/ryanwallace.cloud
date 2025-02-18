ARG caddy_version=2.9@sha256:1c4bc9ead95a0888f1eea3a56ef79f30bd0d271229828fdd25090d898f553571
ARG caddy_builder_version=2.9-builder@sha256:4acea926083a7bc7a4aca4250cec68c9dd6d4a6dc66c6ca8e26ceb1041bca86a

# node bundling
FROM node:23.8.0@sha256:a182b9b37154a3e11e5c1d15145470ceb22069646d0b7390de226da2548aa2a7 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
RUN yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.144.0@sha256:d7399e6cefb9db1aa10f3f8528b9d856b265441ad3645659f52c85e5b0105645 AS builder
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
