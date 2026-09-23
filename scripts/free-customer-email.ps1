# Free an email address so it can be re-registered for notification testing.
# Does NOT delete orders/bookings — renames the old login email out of the way.
#
# Usage (PowerShell):
#   .\scripts\free-customer-email.ps1 -Email "info@socmed.io" -ConnectionString "<Azure SQL connection string>"
#
# Get the connection string from Azure Portal → app-vivi-api → Configuration → Connection strings
# or App Settings: ConnectionStrings__DefaultConnection

param(
    [Parameter(Mandatory = $true)]
    [string]$Email,

    [Parameter(Mandatory = $true)]
    [string]$ConnectionString
)

$ErrorActionPreference = "Stop"
$normalized = $Email.Trim().ToLowerInvariant()

Add-Type -AssemblyName System.Data

$sql = @"
DECLARE @email nvarchar(256) = @p_email;
DECLARE @suffix nvarchar(64) = CONVERT(nvarchar(36), NEWID());
DECLARE @users int = 0;
DECLARE @customers int = 0;

UPDATE AdminUsers
SET Email = N'released.' + @suffix + N'.' + Email,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Email) = @email;
SET @users = @@ROWCOUNT;

UPDATE Customers
SET Email = N'released.' + @suffix + N'.' + Email,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Email) = @email;
SET @customers = @@ROWCOUNT;

SELECT @users AS UsersUpdated, @customers AS CustomersUpdated;
"@

$conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    [void]$cmd.Parameters.AddWithValue("@p_email", $normalized)
    $reader = $cmd.ExecuteReader()
    if ($reader.Read()) {
        $users = [int]$reader["UsersUpdated"]
        $customers = [int]$reader["CustomersUpdated"]
        Write-Host "Freed '$normalized'."
        Write-Host "  AdminUsers updated: $users"
        Write-Host "  Customers updated:  $customers"
        if ($users -eq 0 -and $customers -eq 0) {
            Write-Host "No matching rows found (already free, or different database)."
        } else {
            Write-Host "You can now Create account / set profile email to $normalized again."
        }
    }
    $reader.Close()
}
finally {
    $conn.Close()
}
