# Deploy NA Distributors to Google Cloud

Target project: **`radiant-destiny-366613`**. Run the deployment from **Google Cloud Shell**, where Google provides the CLI and your signed-in Google authentication. No service-account keys need to be downloaded or sent in chat.

This setup uses one Compute Engine VM in Mumbai (`asia-south1-a`) with 2 GB RAM, a 20 GB persistent boot disk, a reserved external IP, Artifact Registry, automatic HTTPS through Caddy, and daily disk snapshots retained for seven days. These are **billable resources**; check the Google Cloud pricing calculator and set a project budget. Stopping the VM alone does not remove disk, IP, image or snapshot charges.

The default deployment uses **MongoDB Atlas**, with its URI loaded from **Google Cloud Secret Manager** by the VM's dedicated service account. Credentials stay out of Git, image layers and VM metadata. This is a single application VM; restarting or replacing its container preserves Atlas records. Optional `--sqlite` mode stores records on the retained persistent disk.

## 1. Save the MongoDB connection securely

If a connection URI/password was shared in chat, **rotate that Atlas password first**. Do not reuse the exposed password.

1. In Atlas, create/update a database user with `readWrite` access to **`na_distributors`**. Use Atlas's Drivers connection string for your cluster and the replacement password (percent-encode reserved password characters).
2. Open [Secret Manager in this project](https://console.cloud.google.com/security/secret-manager?project=radiant-destiny-366613). Enable the Secret Manager API if prompted.
3. Create **`na-distributors-mongodb-uri`**. Paste the complete replacement URI into **Secret value**, with no trailing newline, and save. If the secret exists, add a new enabled version instead. Never paste the URI into chat or deployment commands.
4. The installer checks the secret metadata and grants its dedicated runtime service account access to this secret only. It does not print or copy the value. The URI is retrieved into backend memory at startup using the VM identity, with checksum and TLS verification.

Database name and secret name are nonsecret configuration. Advanced overrides: `--mongodb-secret SECRET_NAME --mongodb-database DATABASE_NAME` (configure that database's Atlas permissions accordingly). Atlas/replica-set transactions are required. The app does not fall back to a different database if Atlas is unavailable.

## 2. Open Cloud Shell and get the project

1. Open <https://shell.cloud.google.com/?project=radiant-destiny-366613> and select your Google account.
2. Confirm the project has an active billing account. The deploying account needs permission to enable APIs, create Compute Engine/network resources, create service accounts, act as the runtime service account, and manage Artifact Registry. A project owner can normally perform the installation; use narrower IAM roles where appropriate.
3. In the Cloud Shell terminal, clone the GitHub repository:

```bash
git clone https://github.com/naween1994/NA-Distributors.git
cd NA-Distributors
bash deploy/google-cloud/deploy.sh radiant-destiny-366613
```

The deployment uses the existing Cloud Shell login and prompts Google's own authorization flow if needed. It builds and tests the image in Cloud Shell, pushes it to Artifact Registry, then starts the dedicated VM. No local Node installation, GitHub token or Docker installation is needed in Cloud Shell.

To see the resources without creating anything:

```bash
bash deploy/google-cloud/deploy.sh radiant-destiny-366613 --plan
```

The installer is for the **first deployment**. It refuses to overwrite an existing `na-distributors` VM. If a prior attempt stopped part way through, managed prerequisites can be reused. Existing resources with conflicting names/descriptions are preserved and the script stops. Resources already created are not automatically deleted after a failure.

## 3. Atlas network access, domain and HTTPS

Without a custom domain, the script generates an address such as:

```text
https://na-distributors.RESERVED_IP.sslip.io
```

`sslip.io` is a third-party DNS service that maps the IP embedded in the hostname. The VM serves the application directly; no application data is sent through an sslip.io hosting service. This DNS dependency and certificate issuance are outside the app's control. Use a domain you own for a long-term business deployment.

If you already own a domain, run instead:

```bash
bash deploy/google-cloud/deploy.sh radiant-destiny-366613 --domain app.example.com
```

For either domain option, the script prints the reserved IP. In Atlas **Network Access → Add IP address**, add exactly that address with `/32` (not all Internet addresses). The application retries startup until Atlas allows it. For a custom domain, also add a DNS **A record** for your hostname pointing to that IP. Do not add an IPv6 AAAA record unless the VM is configured for it. Caddy obtains and renews the HTTPS certificate after DNS points to the VM and ports 80/443 are reachable.

The API binds to loopback, behind one Caddy reverse proxy. Only ports 80/443 are public. SSH is restricted to Google's IAP tunnel IP range; the deployment does not expose port 3001 or SSH to the Internet. Secure cookies and proxy-aware rate limits are enabled.

## 4. Complete the first website setup

Wait for installation and DNS/certificate provisioning, then run the HTTPS health-check command printed by the script. It must return:

```json
{ "ok": true, "database": "mongodb", "persistent": true }
```

Read the private first-visit setup code in your own Cloud Shell:

```bash
gcloud compute ssh na-distributors \
  --project=radiant-destiny-366613 \
  --zone=asia-south1-a \
  --tunnel-through-iap \
  --command='sudo cat /etc/na-distributors/setup-code'
```

Keep that code private. Enter it in the website's **Setup code** field and create Naween's administrator password. The setup endpoint rejects missing/incorrect codes and is permanently closed once an administrator password exists. Then use **Team & access** to set temporary passwords for Anura and Mangala. No default passwords or sample business records are deployed. An existing local SQLite database is not uploaded, migrated or synchronized. MongoDB stores sessions and settings as well as business records.

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

Do not print `/etc/na-distributors/app.env`, paste setup codes into chat, or enable shell tracing. For MongoDB startup failures, verify that the latest secret version is enabled, the runtime service account can access that secret, the Atlas user can write the selected database, and the VM IP `/32` is allowed in Atlas. Do not disable TLS verification. Secret rotation takes effect after `sudo systemctl restart na-distributors`. If the API works internally but HTTPS fails, check DNS, the public firewall and certificate logs. Certificate providers can rate-limit repeated requests; preserve `/var/lib/na-distributors-caddy` across restarts.

## Update the app without replacing its database

Keep the last working image digest for rollback. Back up the active database before changes that alter its schema. Use Atlas backups for MongoDB. From the updated project folder in Cloud Shell:

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

This replaces the app container and briefly interrupts requests; database configuration is retained. Atlas data and the SQLite directory are preserved. Verify the HTTPS health check and sign-in afterwards. To roll back code, set `na-image` to the earlier digest and rerun the startup script. Do not roll back database files unless a verified migration/restore procedure requires it. The startup script requires a digest, not a mutable tag.

## Switch an existing SQLite deployment to MongoDB

First save the rotated URI in Secret Manager as above and update to the current application image using the preceding commands. Then run in Cloud Shell:

```bash
gcloud services enable secretmanager.googleapis.com --project=radiant-destiny-366613
gcloud secrets add-iam-policy-binding na-distributors-mongodb-uri \
  --project=radiant-destiny-366613 \
  --member=serviceAccount:na-distributors-runtime@radiant-destiny-366613.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
gcloud compute instances add-metadata na-distributors \
  --project=radiant-destiny-366613 --zone=asia-south1-a \
  --metadata='na-database=mongodb,na-mongodb-db=na_distributors,na-mongodb-secret=projects/radiant-destiny-366613/secrets/na-distributors-mongodb-uri/versions/latest' \
  --metadata-from-file=startup-script=deploy/google-cloud/vm-startup.sh
gcloud compute ssh na-distributors \
  --project=radiant-destiny-366613 --zone=asia-south1-a --tunnel-through-iap \
  --command='sudo google_metadata_script_runner startup'
```

Allow the existing VM's external IP `/32` in Atlas. The startup script stores only the secret reference and database name in its root-owned environment file. Existing SQLite files remain untouched; their records are **not migrated**. A fresh MongoDB database requires website account setup again. Do not switch an existing business database without planning the data transfer you need.

## Backups and removal

For MongoDB, enable the backup capability supported by your Atlas plan, set retention and test restores. VM disk snapshots do **not** contain the Atlas database. The default daily VM snapshots preserve machine configuration and must be kept private.

Optional SQLite mode (`--sqlite` on first deployment) uses a persistent disk and the same transaction-based API. Its health response reports `sqlite`. Daily snapshots are configured on the whole persistent disk, including the SQLite WAL. They provide crash-consistent disk recovery, not a tested application-level restore guarantee. Test a restoration before relying on it. For an additional clean manual snapshot, stop only the application service, create a disk snapshot, then restart the service. The HTTPS proxy can remain running while the API is temporarily unavailable.

Keep snapshots and the setup code private; they contain user authentication and business data. Do not delete the VM's disk, `/var/lib/na-distributors`, or its SQLite WAL/SHM files during routine updates.

To remove the deployment, first export/backup any records you need. Delete the VM, then explicitly remove its retained disk, reserved IP, snapshot policy/snapshots, Artifact Registry images/repository, firewall rules, subnet/network and dedicated runtime service account when no longer needed. Use the Google Cloud console to review dependencies and billing. The installer intentionally does not offer an automatic destructive cleanup command.

## Validation status

Verified locally: TypeScript and production build; SQLite/API and secret configuration tests; native MongoDB tests against an isolated MongoDB 8 replica set, including simultaneous orders/payments, complete rollback, cost visibility, persistence and exports; and the browser workflow. See the repository test commands for reproducible checks. Secret Manager payload/checksum handling is tested with controlled responses; a live Google Secret Manager request requires Google authentication.

The deployment scripts pass Bash syntax and plan-mode checks. Google Cloud authentication is unavailable in this workspace and Atlas DNS access is blocked here. No live Atlas connection or Google Cloud deployment is claimed. Run the installer in your authenticated Cloud Shell after saving the rotated secret, then verify HTTPS health reports `mongodb` and website sign-in works.
