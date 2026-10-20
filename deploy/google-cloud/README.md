# Deploy NA Distributors to Google Cloud

Target project: **`radiant-destiny-366613`**. Run the deployment from **Google Cloud Shell**, where Google provides the CLI and your signed-in Google authentication. No service-account keys need to be downloaded or sent in chat.

This setup uses one Compute Engine VM in Mumbai (`asia-south1-a`) with 2 GB RAM, a 20 GB persistent boot disk, a reserved external IP, Artifact Registry, automatic HTTPS through Caddy, and daily disk snapshots retained for seven days. These are **billable resources**; check the Google Cloud pricing calculator and set a project budget. Stopping the VM alone does not remove disk, IP, image or snapshot charges.

SQLite lives on the VM's persistent disk, outside the application container. Replacing or restarting the container preserves records. The boot disk is retained if the VM is deleted. This is a single-server deployment, not a highly available or autoscaled service. Cloud Run's default ephemeral filesystem is unsuitable for this database.

## 1. Open Cloud Shell and upload the project

1. Open <https://shell.cloud.google.com/?project=radiant-destiny-366613> and select your Google account.
2. Confirm the project has an active billing account. The deploying account needs permission to enable APIs, create Compute Engine/network resources, create service accounts, act as the runtime service account, and manage Artifact Registry. A project owner can normally perform the installation; use narrower IAM roles where appropriate.
3. Use Cloud Shell's **Upload file** action to upload `na-distributors-google-cloud.tar.gz`. The package contains source code, lockfile and deployment instructions; it excludes databases, passwords, Git metadata, caches and installed dependencies.
4. In the Cloud Shell terminal, run:

```bash
tar -xzf na-distributors-google-cloud.tar.gz
cd NA-Distributors
bash deploy/google-cloud/deploy.sh radiant-destiny-366613
```

The deployment uses the existing Cloud Shell login and prompts Google's own authorization flow if needed. It builds and tests the image in Cloud Shell, pushes it to Artifact Registry, then starts the dedicated VM. No local Node installation, GitHub token or Docker installation is needed in Cloud Shell.

To see the resources without creating anything:

```bash
bash deploy/google-cloud/deploy.sh radiant-destiny-366613 --plan
```

The installer is for the **first deployment**. It refuses to overwrite an existing `na-distributors` VM. If a prior attempt stopped part way through, managed prerequisites can be reused. Existing resources with conflicting names/descriptions are preserved and the script stops. Resources already created are not automatically deleted after a failure.

## 2. Domain and HTTPS

Without a custom domain, the script generates an address such as:

```text
https://na-distributors.RESERVED_IP.sslip.io
```

`sslip.io` is a third-party DNS service that maps the IP embedded in the hostname. The VM serves the application directly; no application data is sent through an sslip.io hosting service. This DNS dependency and certificate issuance are outside the app's control. Use a domain you own for a long-term business deployment.

If you already own a domain, run instead:

```bash
bash deploy/google-cloud/deploy.sh radiant-destiny-366613 --domain app.example.com
```

The script prints the reserved IP. Add a DNS **A record** for your hostname pointing to that IP. Do not add an IPv6 AAAA record unless the VM is configured for it. Caddy obtains and renews the HTTPS certificate after DNS points to the VM and ports 80/443 are reachable.

The API binds to loopback, behind one Caddy reverse proxy. Only ports 80/443 are public. SSH is restricted to Google's IAP tunnel IP range; the deployment does not expose port 3001 or SSH to the Internet. Secure cookies and proxy-aware rate limits are enabled.

## 3. Complete the first website setup

Wait for installation and DNS/certificate provisioning, then run the HTTPS health-check command printed by the script. It must return:

```json
{ "ok": true, "database": "sqlite", "persistent": true }
```

Read the private first-visit setup code in your own Cloud Shell:

```bash
gcloud compute ssh na-distributors \
  --project=radiant-destiny-366613 \
  --zone=asia-south1-a \
  --tunnel-through-iap \
  --command='sudo cat /etc/na-distributors/setup-code'
```

Keep that code private. Enter it in the website's **Setup code** field and create Naween's administrator password. The setup endpoint rejects missing/incorrect codes and is permanently closed once an administrator password exists. Then use **Team & access** to set temporary passwords for Anura and Mangala. No default passwords or sample business records are deployed. An existing local database is not uploaded or migrated by this package.

SSH/IAP access may require `roles/iap.tunnelResourceAccessor`, `roles/compute.osAdminLogin` and permission to act as the VM service account. If access is denied, an administrator must grant the required roles; do not create or share service-account keys as a workaround.

## Diagnose startup

Connect over IAP:

```bash
gcloud compute ssh na-distributors --project=radiant-destiny-366613 --zone=asia-south1-a --tunnel-through-iap
```

On the VM:

```bash
sudo journalctl -u google-startup-scripts.service --no-pager -n 100
sudo systemctl status na-distributors na-distributors-https
sudo journalctl -u na-distributors.service --no-pager -n 100
sudo journalctl -u na-distributors-https.service --no-pager -n 100
curl --fail http://127.0.0.1:3001/api/health
```

Do not print `/etc/na-distributors/app.env`, paste setup codes into chat, or enable shell tracing. If the API works internally but HTTPS fails, check DNS, the public firewall and certificate logs. Certificate providers can rate-limit repeated requests; preserve `/var/lib/na-distributors-caddy` across restarts.

## Update the app without replacing its database

Keep the last working image digest for rollback. Back up the disk before changes that alter the database schema. From the updated project folder in Cloud Shell:

```bash
PROJECT_ID=radiant-destiny-366613
REGISTRY=asia-south1-docker.pkg.dev
IMAGE="$REGISTRY/$PROJECT_ID/na-distributors/app:update-$(date -u +%Y%m%d-%H%M%S)"
gcloud auth configure-docker "$REGISTRY" --quiet
docker build --platform=linux/amd64 --tag "$IMAGE" .
docker push "$IMAGE"
IMAGE_DIGEST=$(docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}')
gcloud compute instances add-metadata na-distributors \
  --project="$PROJECT_ID" --zone=asia-south1-a \
  --metadata="na-image=$IMAGE_DIGEST" \
  --metadata-from-file=startup-script=deploy/google-cloud/vm-startup.sh
gcloud compute ssh na-distributors \
  --project="$PROJECT_ID" --zone=asia-south1-a --tunnel-through-iap \
  --command='sudo google_metadata_script_runner startup'
```

This replaces the app container and briefly interrupts requests; the database directory is retained. Verify the HTTPS health check and sign-in afterwards. To roll back code, set `na-image` to the earlier digest and rerun the startup script. Do not roll back database files unless a verified migration/restore procedure requires it. The startup script requires a digest, not a mutable tag.

## Backups and removal

Daily snapshots are configured on the whole persistent disk, including the SQLite WAL. They provide crash-consistent disk recovery, not a tested application-level restore guarantee. Test a restoration before relying on it. For an additional clean manual snapshot, stop only the application service, create a disk snapshot, then restart the service. The HTTPS proxy can remain running while the API is temporarily unavailable.

Keep snapshots and the setup code private; they contain user authentication and business data. Do not delete the VM's disk, `/var/lib/na-distributors`, or its SQLite WAL/SHM files during routine updates.

To remove the deployment, first export/backup any records you need. Delete the VM, then explicitly remove its retained disk, reserved IP, snapshot policy/snapshots, Artifact Registry images/repository, firewall rules, subnet/network and dedicated runtime service account when no longer needed. Use the Google Cloud console to review dependencies and billing. The installer intentionally does not offer an automatic destructive cleanup command.

## Validation status

Local validation passed: the frontend production build and type check, 14 API tests, the browser workflow (including rejection of a wrong setup code), and a Docker container restart check preserving account credentials, products, stock, invoices and payments. The local container build used checksum-verified packages from the existing npm cache because this workspace's Docker network could not resolve the npm registry. The shipped Dockerfile uses normal frozen-lockfile installation in Cloud Shell.

The deployment shell scripts passed Bash syntax and plan-mode checks. No Google Cloud resources were created from this workspace: Google Cloud authentication is not available here, and Google API/documentation requests are blocked by its network proxy. IAM, billing, VM provisioning, DNS and public certificate issuance still require execution in your authenticated project. A VM creation response alone is not proof the website is live.
