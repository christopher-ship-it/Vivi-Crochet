# Build and publish the VIVI API for Azure App Service deployment

param(
    [string]$OutputDir = "$PSScriptRoot\..\publish\api",
    [string]$ZipPath = "$PSScriptRoot\..\publish\api.zip",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Publishing VIVI.Api ($Configuration) to $OutputDir ..."
dotnet publish "$root\backend\VIVI.Api\VIVI.Api.csproj" `
    -c $Configuration `
    -o $OutputDir `
    --no-self-contained

# A non-zero exit from a native command does not trip ErrorActionPreference, so without
# this the script would happily zip and deploy whatever the previous build left behind.
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE. Nothing was packaged."
}

# Ensure SqlClient is at the publish root for Linux App Service probing.
$unixSqlClient = Join-Path $OutputDir "runtimes\unix\lib\net9.0\Microsoft.Data.SqlClient.dll"
if (Test-Path $unixSqlClient) {
    Copy-Item $unixSqlClient (Join-Path $OutputDir "Microsoft.Data.SqlClient.dll") -Force
    Write-Host "Copied Linux SqlClient assembly to publish root."
}

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Write-Host "Creating deployment zip (forward-slash paths for Linux) ..."
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# CreateFromDirectory writes Windows separators into entry names, which Kudu's rsync
# then treats as literal characters in the filename and fails to stat.
$zipStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

$publishRoot = (Resolve-Path $OutputDir).Path.TrimEnd('\')
Get-ChildItem $publishRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($publishRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $relative) | Out-Null
}

$archive.Dispose()
$zipStream.Dispose()

Write-Host "Publish complete."
Write-Host "  Folder: $OutputDir"
Write-Host "  Zip:    $ZipPath"
