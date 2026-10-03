ARG caddy_version=2.11@sha256:13b7fbadd017b042956fddbceedeeea12bb1e560534f9b3df281269dbcc61813
ARG caddy_builder_version=2.11-builder@sha256:34466183d881df9a8226caf360ff86fe50456f0971221b127dcb756cf514e1ea

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
