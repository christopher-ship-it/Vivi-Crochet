# Deploy pre-published VIVI API zip to Azure App Service (no Oryx build).
# Requires: Azure CLI logged in (`az login`)

param(
    [Parameter(Mandatory = $true)]
    [string]$AppName,

    [string]$ResourceGroup,

    [string]$ZipPath = "$PSScriptRoot\..\publish\api.zip",

    [string]$StartupCommand = "dotnet VIVI.Api.dll"
)

$ErrorActionPreference = "Stop"

$az = "${env:ProgramFiles}\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
if (-not (Test-Path $az)) {
    $az = (Get-Command az -ErrorAction SilentlyContinue).Source
}
if (-not $az) {
    throw "Azure CLI not found. Install from https://aka.ms/installazurecliwindows"
}

if (-not (Test-Path $ZipPath)) {
    throw "Zip not found: $ZipPath. Run .\scripts\publish-api.ps1 first."
}

& $az account show *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Not logged in. Run: az login"
}

if (-not $ResourceGroup) {
    Write-Host "Looking up resource group for $AppName ..."
    $ResourceGroup = & $az webapp list --query "[?name=='$AppName'].resourceGroup | [0]" -o tsv
    if (-not $ResourceGroup) {
        throw "Web app '$AppName' not found in current subscription."
    }
}

Write-Host "App: $AppName"
Write-Host "Resource group: $ResourceGroup"
Write-Host "Zip: $ZipPath"

Write-Host "Ensuring SCM basic auth is enabled for Kudu zip deploy..."
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
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false WEBSITE_RUN_FROM_PACKAGE=0 `
    --only-show-errors | Out-Null

if ($StartupCommand) {
    Write-Host "Setting startup command: $StartupCommand"
    & $az webapp config set `
        --resource-group $ResourceGroup `
        --name $AppName `
        --startup-file $StartupCommand `
        --always-on true `
        --only-show-errors | Out-Null
}

Write-Host "Ensuring health check path /api/health (keeps Always On warm)..."
& $az resource update `
    --resource-group $ResourceGroup `
    --name $AppName `
    --resource-type "Microsoft.Web/sites" `
    --set properties.siteConfig.healthCheckPath="/api/health" `
    --only-show-errors | Out-Null

$creds = & $az webapp deployment list-publishing-credentials `
    --resource-group $ResourceGroup `
    --name $AppName `
    -o json | ConvertFrom-Json

$scmHost = ([Uri]$creds.scmUri).Host
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($creds.publishingUserName):$($creds.publishingPassword)"))
$headers = @{ Authorization = "Basic $auth" }

Write-Host "Deploying via Kudu zipdeploy to $scmHost (no Oryx build) ..."
$uri = "https://$scmHost/api/zipdeploy?isAsync=true"
Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -InFile $ZipPath -ContentType "application/octet-stream" | Out-Null

Start-Sleep -Seconds 10
$latest = Invoke-RestMethod -Uri "https://$scmHost/api/deployments/latest" -Headers $headers
if (-not $latest.complete -and $latest.status -ne 4) {
    Write-Host "Waiting for deployment to finish ..."
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 5
        $latest = Invoke-RestMethod -Uri "https://$scmHost/api/deployments/latest" -Headers $headers
        Write-Host "  $($latest.progress)"
        if ($latest.complete -or $latest.status -eq 4) { break }
    }
}

if ($latest.status -eq 3) {
    $log = Invoke-RestMethod -Uri "$($latest.log_url)" -Headers $headers
    $log | ForEach-Object { Write-Host $_.message }
    throw "Deploy failed."
}

& $az webapp restart --resource-group $ResourceGroup --name $AppName --only-show-errors | Out-Null
Start-Sleep -Seconds 8

$hostName = & $az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv
Write-Host "Deploy complete."
Write-Host "Health: https://$hostName/api/health"
