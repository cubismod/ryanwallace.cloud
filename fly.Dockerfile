ARG caddy_version=2.11@sha256:3095ad245c353e3bdb27a38f22a095c1cfa9e295ab21c0214c3e72b0e2960525
ARG caddy_builder_version=2.11-builder@sha256:671d2a6e5465cc894c9ca57706c7ea7d101018059fe3154c65805a0eda550467

# hugo build
FROM hugomods/hugo:0.165.0@sha256:cf1a2009a1edf807d0880af344c4dd13b40b308c340501128fb54e5aab17b009 AS builder
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
