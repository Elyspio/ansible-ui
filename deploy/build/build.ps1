# Build de l'image mono-conteneur + (option) push + déploiement Helm.
# Usage : ./deploy/build/build.ps1 [-Image registry.elylan/elyspio/ansible-ui]
param([string]$Image = "registry.elylan/elyspio/ansible-ui")

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$tag = Get-Date -Format "yyyy.MM.dd.HHmm"

Write-Host "Build $Image`:$tag depuis $root" -ForegroundColor Cyan
docker build -f "$root/deploy/build/dockerfile" --build-arg APP_VERSION=$tag -t "$Image`:$tag" $root

docker push "$Image`:$tag"

$chart = "P:\own\common\keycloak\kubernetes\apps\ansible-ui"
helm upgrade --install ansible-ui $chart `
        -f "$chart/values.yaml" -f "$chart/values.secrets.yaml" `
        --set image.tag=$tag -n apps

Write-Host "OK : $Image`:$tag" -ForegroundColor Green
