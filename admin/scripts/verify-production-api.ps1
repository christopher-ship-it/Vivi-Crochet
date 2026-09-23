# Verify production API flows used by the admin dashboard.
param(
    [string]$ApiBase = "https://app-vivi-api-hwbmc3dzhkewa5hb.centralindia-01.azurewebsites.net",
    [string]$AdminOrigin = "https://admin.vivicrochet01.com",
    [string]$AdminEmail = "admin@vivicrochet01.com",
    [string]$AdminPassword
)

$ErrorActionPreference = "Continue"
$results = [ordered]@{}

function Test-Step($name, [scriptblock]$action) {
    try {
        $value = & $action
        $results[$name] = "PASS: $value"
        Write-Host "[PASS] $name - $value"
    } catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $msg = $reader.ReadToEnd()
        }
        $results[$name] = "FAIL: $msg"
        Write-Host "[FAIL] $name - $msg"
    }
}

Test-Step "health" { (Invoke-RestMethod "$ApiBase/api/health").status }
Test-Step "cors-preflight" {
    $r = Invoke-WebRequest -Uri "$ApiBase/api/courses" -Method Options -Headers @{
        Origin = $AdminOrigin
        "Access-Control-Request-Method" = "GET"
        "Access-Control-Request-Headers" = "authorization,content-type"
    } -UseBasicParsing
    "$($r.StatusCode) ACAO=$($r.Headers['Access-Control-Allow-Origin'])"
}

if (-not $AdminPassword) {
    Write-Host "Skipping authenticated tests (pass -AdminPassword to run full CRUD/upload verification)."
    $results.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }
    exit 0
}

$login = $null
Test-Step "login" {
    $login = Invoke-RestMethod -Uri "$ApiBase/api/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json)
    "token length $($login.accessToken.Length)"
}

if (-not $login) { $results.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }; exit 1 }

$headers = @{ Authorization = "Bearer $($login.accessToken)"; Origin = $AdminOrigin }

Test-Step "categories-list" { (Invoke-RestMethod "$ApiBase/api/categories" -Headers $headers).Count }
Test-Step "courses-list" { (Invoke-RestMethod "$ApiBase/api/courses" -Headers $headers).Count }

$courseId = $null
Test-Step "course-create" {
    $body = @{ title = "Admin Verify Course"; description = "Temporary verification course"; categoryId = $null; status = "Draft" } | ConvertTo-Json
    $course = Invoke-RestMethod -Uri "$ApiBase/api/courses" -Method Post -Headers ($headers + @{ "Content-Type" = "application/json" }) -Body $body
    $courseId = $course.id
    $course.title
}

if ($courseId) {
    Test-Step "course-update" {
        $body = @{ title = "Admin Verify Course Updated"; description = "Updated"; categoryId = $null; status = "Draft" } | ConvertTo-Json
        $updated = Invoke-RestMethod -Uri "$ApiBase/api/courses/$courseId" -Method Put -Headers ($headers + @{ "Content-Type" = "application/json" }) -Body $body
        $updated.title
    }
}

$results.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }
