# Deploy a pre-published API zip to Azure App Service via Kudu (no Oryx build).
# Use this instead of Portal "QuickDeploy", which tries to build from source.

param(
    [Parameter(Mandatory = $true)]
    [string]$AppName,

    [string]$ZipPath = "$PSScriptRoot\..\publish\api.zip",

    [string]$PublishProfilePath,

    [string]$ScmHost,

    [string]$Username,
    [string]$Password
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ZipPath)) {
    throw "Zip not found: $ZipPath. Run .\scripts\publish-api.ps1 first."
}

if ($PublishProfilePath) {
    [xml]$profile = Get-Content $PublishProfilePath
    $publishData = @($profile.publishData.publishProfile) |
        Where-Object { $_.publishMethod -eq "MSDeploy" -or $_.publishMethod -eq "ZipDeploy" } |
        Select-Object -First 1

    if (-not $publishData) {
        throw "Could not find a deploy profile in $PublishProfilePath"
    }

    $Username = $publishData.userName
    $Password = $publishData.userPWD

    if (-not $ScmHost -and $publishData.publishUrl) {
        $publishUrl = $publishData.publishUrl
        if ($publishUrl -notmatch '^https?://') { $publishUrl = "https://$publishUrl" }
        $ScmHost = ([Uri]$publishUrl).Host
    }
}

if (-not $Username -or -not $Password) {
    @"
Missing credentials. Either pass -PublishProfilePath or -Username/-Password.

Get a publish profile:
  Azure Portal -> app-vivi-api -> Overview -> Download publish profile

Or set deployment credentials:
  Deployment Center -> FTPS credentials -> set username/password
"@ | Write-Host
    throw "Deployment credentials required."
}

$zipItem = Get-Item $ZipPath
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${Password}"))
$headers = @{
    Authorization = "Basic $auth"
}

if (-not $ScmHost) {
    $ScmHost = "$AppName.scm.azurewebsites.net"
}
$uri = "https://$ScmHost/api/zipdeploy?isAsync=true"

Write-Host "Uploading $($zipItem.Name) ($([math]::Round($zipItem.Length / 1MB, 2)) MB) to $ScmHost ..."
Write-Host "This uses Kudu zip deploy (no Oryx build)."

$response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -InFile $zipItem.FullName -ContentType "application/octet-stream"
Write-Host "Deploy started. Id: $($response.id)"

$statusUri = "https://$ScmHost/api/deployments/$($response.id)"
do {
    Start-Sleep -Seconds 3
    $status = Invoke-RestMethod -Uri $statusUri -Headers @{ Authorization = "Basic $auth" }
    Write-Host "Status: $($status.status) ($($status.progress))"
} while ($status.status -eq 1 -or $status.status -eq 0)

if ($status.status -ne 4) {
    Write-Host "Deploy log:"
    Write-Host $status.log_url
    throw "Deploy failed. Open https://$ScmHost/api/deployments/$($response.id)/log for details."
}

Write-Host "Deploy complete."
Write-Host "Verify: https://$AppName.azurewebsites.net/api/health"
