ARG caddy_version=2.11@sha256:13ba145cba2f3e28fa801994876e4c086d1b95d5aa2a520a734765ffb6b12017
ARG caddy_builder_version=2.11-builder@sha256:403d237d0bb16d2e62b1f93ca9ebb4953ecbb78aee5986765713a39f9263a5b4

# hugo build
FROM hugomods/hugo:0.157.0@sha256:b3120a7fb2a29fca732193ec1273d21bae2353c81a432fa5f64902aaebc1e547 AS builder
WORKDIR /build

ADD ryanwallace.cloud .

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
