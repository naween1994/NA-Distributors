#!/usr/bin/env bash
# Run from Google Cloud Shell. Uses the signed-in user's existing Google authentication.
set -euo pipefail
project=${1:-radiant-destiny-366613}
if (($#)); then shift; fi
region=asia-south1
zone=asia-south1-a
domain=''
plan=false
while (($#)); do
  case "$1" in
    --domain) domain=${2:?Provide a domain}; shift 2 ;;
    --plan) plan=true; shift ;;
    *) echo "Usage: bash deploy/google-cloud/deploy.sh PROJECT_ID [--domain app.example.com] [--plan]" >&2; exit 2 ;;
  esac
done
[[ "$project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo 'Invalid Google Cloud project ID.' >&2; exit 2; }
if [[ -n "$domain" ]]; then
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo 'Provide a lowercase hostname without scheme, port or path.' >&2; exit 2; }
fi
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
managed='Managed by NA Distributors deployment'
vm=na-distributors
network=na-distributors-network
subnet=na-distributors-subnet
address=na-distributors-ip
repository=na-distributors
account="na-distributors-runtime@${project}.iam.gserviceaccount.com"
registry="${region}-docker.pkg.dev"
if [[ "$plan" == true ]]; then
  printf 'Project: %s\nRegion: %s\nVM: %s (e2-small, 2 GB RAM)\nStorage: 20 GB persistent boot disk, retained if VM is deleted\nHTTPS domain: %s\nDaily snapshots: retained for 7 days\n' "$project" "$region" "$vm" "${domain:-generated from reserved IP using sslip.io}"
  echo 'Creates billable Compute Engine, persistent disk, external IP, snapshot and Artifact Registry resources. No resources changed in plan mode.'
  exit 0
fi
for command in gcloud docker curl python3 node; do command -v "$command" >/dev/null || { echo "Missing $command. Run this in Google Cloud Shell." >&2; exit 1; }; done
[[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ]] || { echo 'Sign in to Google Cloud Shell first.' >&2; exit 1; }
gcloud projects describe "$project" --format='value(projectId)' >/dev/null
billing=$(gcloud billing projects describe "$project" --format='value(billingEnabled)')
[[ "$billing" == True || "$billing" == true ]] || { echo 'Link an active billing account to this project before deploying.' >&2; exit 1; }
trap 'echo "Deployment stopped. Any resources already created remain and may incur charges; see the cleanup instructions." >&2' ERR
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com iam.googleapis.com iap.googleapis.com oslogin.googleapis.com --project="$project" --quiet
if [[ -n "$(gcloud compute instances list --project="$project" --zones="$zone" --filter="name=$vm" --format='value(name)')" ]]; then
  echo 'The na-distributors VM already exists. Stop here to preserve it. See the redeployment instructions; this installer is for the first deployment.' >&2
  exit 1
fi
# Existing infrastructure is reused only if it carries this installer's description.
ensure_owned() {
  local description=$1
  [[ "$description" == "$managed" ]] || { echo 'A resource with this name belongs to another setup. Nothing was overwritten. Choose different names in this script.' >&2; exit 1; }
}
if [[ -z "$(gcloud artifacts repositories list --project="$project" --location="$region" --filter="name:$repository" --format='value(name)')" ]]; then
  gcloud artifacts repositories create "$repository" --repository-format=docker --location="$region" --description="$managed" --project="$project" --quiet
else
  ensure_owned "$(gcloud artifacts repositories describe "$repository" --location="$region" --project="$project" --format='value(description)')"
fi
# Build in Cloud Shell, avoiding Cloud Build service-account setup and permissions.
gcloud auth configure-docker "$registry" --quiet
image="${registry}/${project}/${repository}/app:deploy-$(date -u +%Y%m%d-%H%M%S)"
docker build --platform=linux/amd64 --tag "$image" "$root"
node "$root/deploy/google-cloud/check-container.mjs" "$image"
docker push "$image"
image_digest=$(docker image inspect "$image" --format '{{index .RepoDigests 0}}')
[[ "$image_digest" == "${registry}/${project}/${repository}/app@sha256:"* ]] || { echo 'Could not verify the pushed image digest.' >&2; exit 1; }
if [[ -z "$(gcloud iam service-accounts list --project="$project" --filter="email=$account" --format='value(email)')" ]]; then
  gcloud iam service-accounts create na-distributors-runtime --display-name='NA Distributors image reader' --description="$managed" --project="$project" --quiet
else
  ensure_owned "$(gcloud iam service-accounts describe "$account" --project="$project" --format='value(description)')"
fi
gcloud artifacts repositories add-iam-policy-binding "$repository" --location="$region" --member="serviceAccount:$account" --role=roles/artifactregistry.reader --project="$project" --quiet >/dev/null
if [[ -z "$(gcloud compute networks list --project="$project" --filter="name=$network" --format='value(name)')" ]]; then
  gcloud compute networks create "$network" --subnet-mode=custom --description="$managed" --project="$project" --quiet
else
  ensure_owned "$(gcloud compute networks describe "$network" --project="$project" --format='value(description)')"
fi
if [[ -z "$(gcloud compute networks subnets list --project="$project" --regions="$region" --filter="name=$subnet" --format='value(name)')" ]]; then
  gcloud compute networks subnets create "$subnet" --network="$network" --range=10.42.0.0/24 --region="$region" --description="$managed" --project="$project" --quiet
else
  ensure_owned "$(gcloud compute networks subnets describe "$subnet" --region="$region" --project="$project" --format='value(description)')"
fi
for rule in na-distributors-web na-distributors-iap; do
  if [[ -n "$(gcloud compute firewall-rules list --project="$project" --filter="name=$rule" --format='value(name)')" ]]; then
    ensure_owned "$(gcloud compute firewall-rules describe "$rule" --project="$project" --format='value(description)')"
  elif [[ "$rule" == na-distributors-web ]]; then
    gcloud compute firewall-rules create "$rule" --network="$network" --allow=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=na-distributors-web --description="$managed" --project="$project" --quiet
  else
    gcloud compute firewall-rules create "$rule" --network="$network" --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=na-distributors-web --description="$managed" --project="$project" --quiet
  fi
done
if [[ -z "$(gcloud compute addresses list --project="$project" --regions="$region" --filter="name=$address" --format='value(name)')" ]]; then
  gcloud compute addresses create "$address" --region="$region" --network-tier=PREMIUM --description="$managed" --project="$project" --quiet
else
  ensure_owned "$(gcloud compute addresses describe "$address" --region="$region" --project="$project" --format='value(description)')"
fi
ip=$(gcloud compute addresses describe "$address" --region="$region" --project="$project" --format='value(address)')
if [[ -z "$domain" ]]; then domain="na-distributors.${ip}.sslip.io"; fi
printf '\nReserved IP: %s\nApplication domain: %s\n' "$ip" "$domain"
if [[ "$domain" != "na-distributors.${ip}.sslip.io" ]]; then
  echo "Create an A record for $domain pointing to $ip. HTTPS will become available after DNS propagates."
fi
gcloud compute instances create "$vm" --project="$project" --zone="$zone" --machine-type=e2-small --image-family=debian-12 --image-project=debian-cloud --boot-disk-size=20GB --boot-disk-type=pd-balanced --no-boot-disk-auto-delete --network="$network" --subnet="$subnet" --address="$ip" --tags=na-distributors-web --service-account="$account" --scopes=https://www.googleapis.com/auth/cloud-platform --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring --labels=app=na-distributors --metadata="enable-oslogin=TRUE,na-image=$image_digest,na-domain=$domain,na-registry=$registry" --metadata-from-file="startup-script=$root/deploy/google-cloud/vm-startup.sh" --quiet
# Snapshots capture the whole persistent disk, including SQLite WAL and related files.
policy=na-distributors-daily
if [[ -z "$(gcloud compute resource-policies list --project="$project" --filter="name=$policy AND region:/$region" --format='value(name)')" ]]; then
  gcloud compute resource-policies create snapshot-schedule "$policy" --description="$managed" --region="$region" --daily-schedule --start-time=21:00 --max-retention-days=7 --on-source-disk-delete=keep-auto-snapshots --project="$project" --quiet
else
  ensure_owned "$(gcloud compute resource-policies describe "$policy" --region="$region" --project="$project" --format='value(description)')"
fi
gcloud compute disks add-resource-policies "$vm" --zone="$zone" --resource-policies="$policy" --project="$project" --quiet
printf '\nVM created. Initial installation and HTTPS provisioning can take several minutes.\nWebsite: https://%s\n' "$domain"
printf '\nRetrieve the first-visit setup code in your own Cloud Shell (keep it private):\n'
printf "gcloud compute ssh %s --project=%s --zone=%s --tunnel-through-iap --command='sudo cat /etc/na-distributors/setup-code'\n" "$vm" "$project" "$zone"
printf '\nReadiness check (repeat after DNS and startup are complete):\ncurl --fail https://%s/api/health\n' "$domain"
echo 'Deployment is not verified until the HTTPS health check succeeds and sign-in works. See deploy/google-cloud/README.md for diagnosis, updates and cleanup.'
