# Wire vivicrochet01.com custom domains to Azure App Service (admin + API).
# 1) Prints DNS records to add at your registrar
# 2) Updates API + Blob CORS for the admin origin
# 3) Optionally binds hostnames + free managed TLS once DNS CNAMEs resolve
#
# Usage:
#   .\scripts\wire-custom-domains.ps1                 # CORS only + DNS checklist
#   .\scripts\wire-custom-domains.ps1 -BindHostnames  # also bind + TLS (needs DNS)

param(
    [string]$ResourceGroup = "RG-vivi",
    [string]$ApiAppName = "app-vivi-api",
    [string]$AdminAppName = "vivi-admin",
    [string]$StorageAccount = "vivicstorage",
    [string]$RootDomain = "vivicrochet01.com",
    [switch]$BindHostnames,
    [switch]$SkipCors
)

$ErrorActionPreference = "Stop"

$AdminHost = "admin.$RootDomain"
$ApiHost = "api.$RootDomain"
$AdminOrigin = "https://$AdminHost"
$ApiOrigin = "https://$ApiHost"

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

function Test-DnsCname([string]$Name, [string]$ExpectedTarget) {
    try {
        $records = Resolve-DnsName -Name $Name -Type CNAME -ErrorAction Stop
        $target = ($records | Where-Object { $_.Type -eq "CNAME" } | Select-Object -First 1).NameHost
        if (-not $target) { return $false }
        $normalized = $target.TrimEnd('.').ToLowerInvariant()
        $expected = $ExpectedTarget.TrimEnd('.').ToLowerInvariant()
        return $normalized -eq $expected
    } catch {
        return $false
    }
}

$az = Get-AzCli

$apiDefault = & $az webapp show --resource-group $ResourceGroup --name $ApiAppName --query defaultHostName -o tsv
$adminDefault = & $az webapp show --resource-group $ResourceGroup --name $AdminAppName --query defaultHostName -o tsv
if (-not $apiDefault -or -not $adminDefault) {
    throw "Could not resolve App Service default hostnames."
}

Write-Host ""
Write-Host "=== DNS records to add at your domain registrar ==="
Write-Host "Type  Host   Value                                      TTL"
Write-Host "CNAME admin  $adminDefault    3600"
Write-Host "CNAME api    $apiDefault     3600"
Write-Host ""
Write-Host "Keep the apex ($RootDomain) on your marketing site if desired."
Write-Host "Target URLs after DNS + TLS:"
Write-Host "  Admin: $AdminOrigin"
Write-Host "  API:   $ApiOrigin"
Write-Host ""

if (-not $SkipCors) {
    Write-Host "Updating API CORS AllowedOrigins ..."
    & $az webapp config appsettings set `
        --resource-group $ResourceGroup `
        --name $ApiAppName `
        --settings `
            "Cors__AllowedOrigins__0=$AdminOrigin" `
            "Cors__AllowedOrigins__1=http://localhost:5173" `
            "Cors__AllowedOrigins__2=https://$adminDefault" `
        --only-show-errors | Out-Null

    Write-Host "Updating Blob Storage CORS for admin uploads ..."
    & $az storage cors clear --services b --account-name $StorageAccount --only-show-errors | Out-Null
    & $az storage cors add `
        --services b `
        --methods PUT OPTIONS HEAD GET `
        --origins $AdminOrigin "https://$adminDefault" "http://localhost:5173" `
        --allowed-headers "Content-Type,x-ms-blob-type,x-ms-blob-content-type,x-ms-version" `
        --exposed-headers "x-ms-request-id,x-ms-version" `
        --max-age 3600 `
        --account-name $StorageAccount `
        --only-show-errors | Out-Null

    Write-Host "Restarting API so CORS settings reload ..."
    & $az webapp restart --resource-group $ResourceGroup --name $ApiAppName --only-show-errors | Out-Null
    Write-Host "CORS updated."
    Write-Host ""
}

$adminDnsOk = Test-DnsCname -Name $AdminHost -ExpectedTarget $adminDefault
$apiDnsOk = Test-DnsCname -Name $ApiHost -ExpectedTarget $apiDefault

Write-Host "DNS check:"
Write-Host ("  {0} -> {1}" -f $AdminHost, $(if ($adminDnsOk) { "OK ($adminDefault)" } else { "NOT READY (add CNAME)" }))
Write-Host ("  {0} -> {1}" -f $ApiHost, $(if ($apiDnsOk) { "OK ($apiDefault)" } else { "NOT READY (add CNAME)" }))
Write-Host ""

if (-not $BindHostnames) {
    Write-Host "Next steps:"
    Write-Host "  1. Add the two CNAME records above at your DNS provider."
    Write-Host "  2. Wait for DNS (often 5-30 min), then re-run:"
    Write-Host "       .\scripts\wire-custom-domains.ps1 -BindHostnames -SkipCors"
    Write-Host "  3. Redeploy admin so the SPA calls ${ApiOrigin}:"
    Write-Host "       .\scripts\deploy-admin-azure.ps1 -ApiBaseUrl $ApiOrigin"
    Write-Host ""
    exit 0
}

if (-not $adminDnsOk -or -not $apiDnsOk) {
    throw "DNS CNAMEs are not resolving yet. Add/wait for records, then re-run with -BindHostnames."
}

function Bind-HostnameAndCert([string]$AppName, [string]$Hostname) {
    Write-Host "Binding $Hostname on $AppName ..."
    $existing = & $az webapp config hostname list --resource-group $ResourceGroup --webapp-name $AppName --query "[].name" -o tsv
    if ($existing -notcontains $Hostname) {
        & $az webapp config hostname add `
            --resource-group $ResourceGroup `
            --webapp-name $AppName `
            --hostname $Hostname `
            --only-show-errors | Out-Null
    } else {
        Write-Host "  Hostname already bound."
    }

    Write-Host "Creating/assigning managed TLS certificate for $Hostname ..."
    & $az webapp config ssl create `
        --resource-group $ResourceGroup `
        --name $AppName `
        --hostname $Hostname `
        --only-show-errors | Out-Null

    $thumb = & $az webapp config ssl list --resource-group $ResourceGroup `
        --query "[?contains(hostNames, '$Hostname')].thumbprint | [0]" -o tsv
    if (-not $thumb) {
        # Managed cert create is async on some SKUs; fall back to binding via hostname binding SSL state
        Write-Host "  Waiting for managed certificate ..."
        Start-Sleep -Seconds 20
        $thumb = & $az webapp config ssl list --resource-group $ResourceGroup `
            --query "[?contains(hostNames, '$Hostname')].thumbprint | [0]" -o tsv
    }
    if ($thumb) {
        & $az webapp config ssl bind `
            --resource-group $ResourceGroup `
            --name $AppName `
            --certificate-thumbprint $thumb `
            --ssl-type SNI `
            --only-show-errors | Out-Null
        Write-Host "  TLS bound (SNI)."
    } else {
        Write-Host "  WARNING: Could not auto-bind TLS. In Portal: $AppName → Custom domains → Add managed certificate for $Hostname."
    }
}

Bind-HostnameAndCert -AppName $AdminAppName -Hostname $AdminHost
Bind-HostnameAndCert -AppName $ApiAppName -Hostname $ApiHost

Write-Host ""
Write-Host "Custom domains bound."
Write-Host "  Admin: $AdminOrigin"
Write-Host "  API:   $ApiOrigin/api/health"
Write-Host ""
Write-Host "Redeploy admin so the SPA uses the custom API host:"
Write-Host "  .\scripts\deploy-admin-azure.ps1 -ApiBaseUrl $ApiOrigin"
Write-Host ""
