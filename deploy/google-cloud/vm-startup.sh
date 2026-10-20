#!/usr/bin/env bash
# Runs as root on the dedicated Debian VM. Never enable shell tracing here.
set -euo pipefail
umask 077
metadata() { curl --fail --silent --show-error --retry 5 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
image=$(metadata na-image)
domain=$(metadata na-domain)
registry=$(metadata na-registry)
# Missing provider metadata preserves existing SQLite deployments during code-only updates.
provider=$(metadata na-database 2>/dev/null || true)
provider=${provider:-sqlite}
[[ "$provider" == sqlite || "$provider" == mongodb ]] || { echo 'Invalid database provider metadata.' >&2; exit 1; }
if [[ "$provider" == mongodb ]]; then
  mongodb_secret=$(metadata na-mongodb-secret)
  mongodb_db=$(metadata na-mongodb-db)
  [[ "$mongodb_secret" =~ ^projects/[a-z0-9-]+/secrets/[a-zA-Z0-9_-]+/versions/(latest|[1-9][0-9]*)$ ]] || { echo 'Invalid MongoDB secret reference.' >&2; exit 1; }
  [[ "$mongodb_db" =~ ^[a-zA-Z0-9_-]{1,63}$ ]] || { echo 'Invalid MongoDB database name.' >&2; exit 1; }
fi
[[ "$image" =~ ^[a-z0-9-]+-docker\.pkg\.dev/[a-z0-9-]+/na-distributors/app@sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid deployment image metadata.' >&2; exit 1; }
[[ "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo 'Invalid application domain metadata.' >&2; exit 1; }
[[ "$registry" =~ ^[a-z0-9-]+-docker\.pkg\.dev$ ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends docker.io ca-certificates curl openssl python3
systemctl enable --now docker
install -d -m 700 /etc/na-distributors
install -d -m 700 -o 1000 -g 1000 /var/lib/na-distributors
install -d -m 700 /var/lib/na-distributors-caddy
# Retain the first setup code across reboot and redeploy. It is ignored after admin setup.
if [[ ! -s /etc/na-distributors/setup-code ]]; then
  openssl rand -hex 24 > /etc/na-distributors/setup-code
fi
chmod 600 /etc/na-distributors/setup-code
{
  echo 'NODE_ENV=production'
  echo 'PORT=3001'
  echo 'HOST=127.0.0.1'
  printf 'DATABASE_PROVIDER=%s\n' "$provider"
  if [[ "$provider" == mongodb ]]; then
    # Only references are stored here. Node retrieves the URI through VM service-account ADC.
    printf 'MONGODB_URI_SECRET=%s\nMONGODB_DB_NAME=%s\n' "$mongodb_secret" "$mongodb_db"
  else
    echo 'DATABASE_PATH=/data/na-distributors.sqlite'
  fi
  echo 'COOKIE_SECURE=true'
  echo 'TRUST_PROXY_HOPS=1'
  printf 'CORS_ORIGINS=https://%s\n' "$domain"
  printf 'SETUP_TOKEN=%s\n' "$(cat /etc/na-distributors/setup-code)"
} > /etc/na-distributors/app.env
cat > /etc/na-distributors/Caddyfile <<CADDY
${domain} {
  encode zstd gzip
  header -Server
  reverse_proxy 127.0.0.1:3001
}
CADDY
# A short-lived token is used only to pull the image. It is never logged.
gcp_registry_token=$(curl --fail --silent --show-error --retry 5 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
printf '%s' "$gcp_registry_token" | docker login -u oauth2accesstoken --password-stdin "$registry" >/dev/null
unset gcp_registry_token
docker pull "$image"
docker logout "$registry" >/dev/null
docker pull caddy:2
cat > /etc/systemd/system/na-distributors.service <<UNIT
[Unit]
Description=NA Distributors persistent application
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
[Service]
Restart=always
RestartSec=5
TimeoutStopSec=45
ExecStartPre=-/usr/bin/docker rm -f na-distributors
ExecStart=/usr/bin/docker run --rm --name na-distributors --network host --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=64m --env-file /etc/na-distributors/app.env --mount type=bind,source=/var/lib/na-distributors,target=/data --log-opt max-size=10m --log-opt max-file=3 ${image}
ExecStop=/usr/bin/docker stop --time 30 na-distributors
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/na-distributors-https.service <<'UNIT'
[Unit]
Description=NA Distributors HTTPS proxy
Requires=docker.service
After=docker.service na-distributors.service network-online.target
Wants=network-online.target
[Service]
Restart=always
RestartSec=5
TimeoutStopSec=30
ExecStartPre=-/usr/bin/docker rm -f na-distributors-https
ExecStart=/usr/bin/docker run --rm --name na-distributors-https --network host --mount type=bind,source=/etc/na-distributors/Caddyfile,target=/etc/caddy/Caddyfile,readonly --mount type=bind,source=/var/lib/na-distributors-caddy,target=/data --log-opt max-size=10m --log-opt max-file=3 caddy:2
ExecStop=/usr/bin/docker stop --time 20 na-distributors-https
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable na-distributors.service na-distributors-https.service
systemctl restart na-distributors.service
systemctl restart na-distributors-https.service
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then break; fi
  if [[ "$attempt" -eq 30 ]]; then echo 'API is not healthy yet. Check Secret Manager access and Atlas IP access; the service continues retrying. Inspect journalctl -u na-distributors.' >&2; exit 1; fi
  sleep 2
done
printf 'Application started. HTTPS certificate provisioning for %s may take a few minutes.\n' "$domain"
