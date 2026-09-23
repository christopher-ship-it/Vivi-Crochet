# Set admin dashboard login on the production API (Azure App Service + DB seed upsert).
# Requires: az login (with MFA), then restart so DatabaseSeeder applies the password.
#
# Example:
#   .\scripts\set-admin-login.ps1 -Email "admin@vivicrochet01.com" -Password "YourPassword"

param(
    [Parameter(Mandatory = $true)]
    [string]$Email,

    [Parameter(Mandatory = $true)]
    [string]$Password,

    [string]$ResourceGroup = "RG-vivi",
    [string]$ApiAppName = "app-vivi-api",
    [string]$AdminName = "Vivi Priya"
)

$ErrorActionPreference = "Stop"

function Get-AzCli {
    $az = "${env:ProgramFiles}\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    if (-not (Test-Path $az)) {
        $az = (Get-Command az -ErrorAction SilentlyContinue).Source
    }
    if (-not $az) {
        throw "Azure CLI not found."
    }
    return $az
}

$az = Get-AzCli

Write-Host "Setting Seed__Admin* on $ApiAppName ..."
& $az webapp config appsettings set `
    --resource-group $ResourceGroup `
    --name $ApiAppName `
    --settings `
        "Seed__AdminEmail=$Email" `
        "Seed__AdminPassword=$Password" `
        "Seed__AdminName=$AdminName" `
        "Database__AutoSeed=true" `
    --only-show-errors | Out-Null

if ($LASTEXITCODE -ne 0) {
    throw "Failed to set app settings. Run: az logout; az login"
}

Write-Host "Restarting API so seeder applies credentials ..."
& $az webapp restart --resource-group $ResourceGroup --name $ApiAppName --only-show-errors | Out-Null
Start-Sleep -Seconds 12

Write-Host ""
Write-Host "Admin login updated (after API finishes starting):"
Write-Host "  Email:    $Email"
Write-Host "  Password: (the value you passed)"
Write-Host "  Admin URL: https://admin.vivicrochet01.com  (or the Azure default host)"
Write-Host ""
Write-Host "After you can sign in, remove Seed__AdminPassword from App Service settings."
