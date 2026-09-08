# Build and zip the VIVI API for Azure Linux App Service (self-contained).
# Output: publish/api-sc.zip  (Linux-friendly forward-slash paths)

param(
    [string]$OutputDir = "$PSScriptRoot\..\publish\api-sc",
    [string]$ZipPath = "$PSScriptRoot\..\publish\api-sc.zip",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dotnet = "$env:USERPROFILE\.dotnet\dotnet.exe"
if (-not (Test-Path $dotnet)) {
    $dotnet = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
}
if (-not $dotnet) {
    throw ".NET SDK not found. Install .NET 10 SDK first."
}

Write-Host "Publishing VIVI.Api ($Configuration, linux-x64, self-contained) ..."
Push-Location "$root\backend"
try {
    & $dotnet publish VIVI.Api\VIVI.Api.csproj `
        -c $Configuration `
        -r linux-x64 `
        --self-contained true `
        -o $OutputDir
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed." }
}
finally {
    Pop-Location
}

$OutputDir = (Resolve-Path $OutputDir).Path.TrimEnd('\')
$ZipPath = Join-Path $root "publish\api-sc.zip"

if (-not (Test-Path (Join-Path $OutputDir "VIVI.Api"))) {
    throw "Expected linux executable missing: $OutputDir\VIVI.Api"
}

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Write-Host "Creating Linux zip (forward-slash paths) ..."
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

Get-ChildItem $OutputDir -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($OutputDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $relative) | Out-Null
}

$archive.Dispose()
$zipStream.Dispose()

Write-Host "Publish complete."
Write-Host "  Folder: $OutputDir"
Write-Host "  Zip:    $ZipPath"
Write-Host "  Size:   $((Get-Item $ZipPath).Length) bytes"
Write-Host ""
Write-Host "Azure Portal: upload $ZipPath to app-vivi-api (Zip Deploy)."
Write-Host "Startup command: ./VIVI.Api"
