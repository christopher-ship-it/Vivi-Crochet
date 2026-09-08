# Apply EF Core migrations to Azure SQL (run before or during deployment)

param(
    [Parameter(Mandatory = $true)]
    [string]$ConnectionString
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Prefer user-installed .NET 10 SDK over system .NET 8
$dotnetRoot = Join-Path $env:USERPROFILE ".dotnet"
if (Test-Path $dotnetRoot) {
    $env:DOTNET_ROOT = $dotnetRoot
    $env:PATH = "$dotnetRoot;$dotnetRoot\tools;$env:PATH"
}

$env:ConnectionStrings__DefaultConnection = $ConnectionString
$env:Jwt__SigningKey = "migration-placeholder-key-32chars-min!!"

Write-Host "Applying EF migrations..."
Push-Location "$root\backend"
try {
    dotnet tool restore | Out-Null
    dotnet-ef database update `
        --project VIVI.Infrastructure `
        --startup-project VIVI.Api
}
finally {
    Pop-Location
}

Write-Host "Done."
