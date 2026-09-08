# Build and deploy the VIVI Admin SPA to Azure App Service or Static Web Apps.
# Requires: Node.js 20+, npm. For deploy: Azure CLI (`az login`) or SWA CLI deployment token.

param(
    [string]$ResourceGroup = "RG-vivi",

    [string]$AppName = "vivi-admin",

    [string]$StaticWebAppName,

    [string]$ApiBaseUrl = "https://app-vivi-api-hwbmc3dzhkewa5hb.centralindia-01.azurewebsites.net",

    [string]$DeploymentToken,

    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Join-Path $PSScriptRoot ".."
$adminRoot = Join-Path $repoRoot "admin"
$distPath = Join-Path $adminRoot "dist"
$publishRoot = Join-Path $repoRoot "publish\admin"
$zipPath = Join-Path $repoRoot "publish\admin.zip"

function Get-AzCli {
    $az = "${env:ProgramFiles}\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    if (-not (Test-Path $az)) {
        $az = (Get-Command az -ErrorAction SilentlyContinue).Source
    }
    if (-not $az) {
        throw "Azure CLI not found. Install from https://aka.ms/installazurecliwindows"
    }
    return $az
}

Push-Location $adminRoot
try {
    Write-Host "Building admin SPA (production API: $ApiBaseUrl) ..."
    $env:VITE_API_BASE_URL = $ApiBaseUrl
    if (-not (Test-Path (Join-Path $adminRoot "node_modules"))) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
    } else {
        Write-Host "Using existing admin/node_modules (skip npm ci)."
    }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }

    if (-not (Test-Path (Join-Path $distPath "index.html"))) {
        throw "Build output missing: $distPath\index.html"
    }

    Write-Host "Build complete: $distPath"
}
finally {
    Pop-Location
}

if ($BuildOnly) {
    Write-Host "Build-only mode. Output: $distPath"
    exit 0
}

if ($DeploymentToken) {
    $swa = (Get-Command swa -ErrorAction SilentlyContinue).Source
    if (-not $swa) {
        throw "SWA CLI not found. Install: npm install -g @azure/static-web-apps-cli"
    }

    Write-Host "Deploying with SWA CLI ..."
    & $swa deploy $distPath --deployment-token $DeploymentToken --env production
    if ($LASTEXITCODE -ne 0) { throw "swa deploy failed." }
    Write-Host "Deployed to Azure Static Web Apps."
    exit 0
}

if ($StaticWebAppName) {
    $az = Get-AzCli
    & $az account show *> $null
    if ($LASTEXITCODE -ne 0) { throw "Not logged in. Run: az login" }

    Write-Host "Deploying to Static Web App '$StaticWebAppName' ..."
    & $az staticwebapp deploy `
        --name $StaticWebAppName `
        --resource-group $ResourceGroup `
        --source-location $distPath `
        --no-wait false

    if ($LASTEXITCODE -ne 0) { throw "az staticwebapp deploy failed." }
    Write-Host "Admin deployed to Static Web App."
    exit 0
}

if (-not $AppName) {
    throw "Provide -AppName (App Service), -StaticWebAppName, -DeploymentToken, or use -BuildOnly."
}

# --- Azure App Service (Linux Node) zip deploy ---
Write-Host "Packaging admin for App Service '$AppName' ..."

if (Test-Path $publishRoot) { Remove-Item $publishRoot -Recurse -Force }
New-Item -ItemType Directory -Path $publishRoot -Force | Out-Null

Copy-Item -Path (Join-Path $distPath "*") -Destination $publishRoot -Recurse -Force
Copy-Item -Path (Join-Path $adminRoot "deploy\package.json") -Destination $publishRoot -Force
$deploymentFile = Join-Path $adminRoot "deploy\.deployment"
if (Test-Path $deploymentFile) {
    Copy-Item -Path $deploymentFile -Destination $publishRoot -Force
}

Write-Host "Installing production Node dependencies locally (skip Oryx on Linux) ..."
Push-Location $publishRoot
try {
    npm install --omit=dev
    if ($LASTEXITCODE -ne 0) { throw "npm install in publish package failed." }
}
finally {
    Pop-Location
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path (Split-Path $zipPath) -Force | Out-Null

Write-Host "Creating Linux-friendly zip (forward-slash paths) ..."
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

$publishRoot = (Resolve-Path $publishRoot).Path.TrimEnd('\')
Get-ChildItem $publishRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($publishRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $relative) | Out-Null
}

$archive.Dispose()
$zipStream.Dispose()

$az = Get-AzCli
& $az account show *> $null
if ($LASTEXITCODE -ne 0) { throw "Not logged in. Run: az login" }

Write-Host "Configuring App Service (zip deploy, no Oryx/rsync) ..."
& $az resource update `
    --resource-group $ResourceGroup `
    --name scm `
    --namespace Microsoft.Web `
    --resource-type basicPublishingCredentialsPolicies `
    --parent "sites/$AppName" `
    --set properties.allow=true `
    --only-show-errors | Out-Null

& $az webapp config appsettings set `
    --resource-group $ResourceGroup `
    --name $AppName `
    --settings `
        SCM_DO_BUILD_DURING_DEPLOYMENT=false `
        ENABLE_ORYX_BUILD=false `
        WEBSITE_RUN_FROM_PACKAGE=0 `
        WEBSITE_NODE_DEFAULT_VERSION="~24" `
    --output none

if ($LASTEXITCODE -ne 0) { throw "Failed to set app settings." }

& $az webapp config set `
    --resource-group $ResourceGroup `
    --name $AppName `
    --startup-file "npm start" `
    --only-show-errors | Out-Null

$creds = & $az webapp deployment list-publishing-credentials `
    --resource-group $ResourceGroup `
    --name $AppName `
    -o json | ConvertFrom-Json

$scmHost = ([Uri]$creds.scmUri).Host
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($creds.publishingUserName):$($creds.publishingPassword)"))
$headers = @{ Authorization = "Basic $auth" }

Write-Host "Deploying via Kudu zipdeploy to $scmHost ..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$uri = "https://$scmHost/api/zipdeploy?isAsync=true"
Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -InFile $zipPath -ContentType "application/octet-stream" | Out-Null

Start-Sleep -Seconds 10
$latest = Invoke-RestMethod -Uri "https://$scmHost/api/deployments/latest" -Headers $headers
if (-not $latest.complete -and $latest.status -ne 4) {
    Write-Host "Waiting for deployment to finish ..."
    for ($i = 0; $i -lt 36; $i++) {
        Start-Sleep -Seconds 5
        $latest = Invoke-RestMethod -Uri "https://$scmHost/api/deployments/latest" -Headers $headers
        Write-Host "  $($latest.progress)"
        if ($latest.complete -or $latest.status -eq 4 -or $latest.status -eq 3) { break }
    }
}

if ($latest.status -eq 3) {
    try {
        $log = Invoke-RestMethod -Uri "$($latest.log_url)" -Headers $headers
        $log | ForEach-Object { Write-Host $_.message }
    } catch { }
    throw "Kudu zipdeploy failed."
}

& $az webapp restart --resource-group $ResourceGroup --name $AppName --only-show-errors | Out-Null
Start-Sleep -Seconds 8

$hostname = & $az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv
Write-Host ""
Write-Host "Admin deployed successfully."
Write-Host "  URL: https://$hostname"
Write-Host "  Custom domain: add CNAME admin -> $hostname in DNS, then bind admin.vivicrochet.in in Portal."
