FROM hugomods/hugo:0.140.0 AS builder
WORKDIR /build
ADD ryanwallace.cloud .

RUN hugo build --cleanDestinationDir

FROM caddy:2.9 AS server
WORKDIR /var/www/html

COPY --from=builder /build/public/ .
ADD Caddyfile /etc/caddy/Caddyfile
