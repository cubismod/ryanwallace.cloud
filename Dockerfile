ARG caddy_version=2.9@sha256:1c4bc9ead95a0888f1eea3a56ef79f30bd0d271229828fdd25090d898f553571
ARG caddy_builder_version=2.9-builder@sha256:c293af6a9b5a979534765f31611267f47a2af6a7268641dec398e567605e00cf

# node bundling
FROM node:23.8.0@sha256:89832d6c472e744355c3751da68d60d8f79bb20a79fe7497672d4099b898a7f4 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
RUN yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.144.2@sha256:179958387a1d3bd2260cf9bb434cc069f7eca8d20a10cda79cda792ab65ad830 AS builder
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
