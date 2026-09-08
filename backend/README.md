# VIVI Crochet API

ASP.NET Core backend for the VIVI Crochet MVP. This service issues JWTs for admins, stores course/lesson metadata in SQL Server, and mints short-lived Azure Blob SAS URLs so large videos never pass through the API.

## Requirements

- **.NET 10 SDK** (LTS). `dotnet --list-sdks` should show `10.0.x`.
  If the SDK is installed only for the current user, add `%USERPROFILE%\.dotnet` to PATH.
- **SQL Server** for local runs: SQL Server LocalDB, SQL Server Express, or Azure SQL.
- **Azure Storage** for real uploads: an Azure Storage Account, or [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) locally.
- Optional: Application Insights connection string.

The Development profile uses `Blob:Provider=InMemory` so `dotnet run` works without Azurite. InMemory SAS URLs are placeholders — they are **not** a real upload target. Switch to Azure or Azurite before testing a browser PUT.

## Solution layout

```text
backend/
├── VIVI.Api/                 HTTP, Swagger, validation
├── VIVI.Core/                entities, enums, file rules
├── VIVI.Infrastructure/      EF Core, JWT, Blob
└── VIVI.Api.Tests/           critical-path tests
```

## Environment variables

Secrets are **not** in `appsettings.json`. Set them with user-secrets (local) or Azure App Service application settings (production). See `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `Jwt__SigningKey` | HMAC key, **at least 32 characters**. Required. |
| `Jwt__Issuer` / `Jwt__Audience` | Token issuer/audience. Defaults: `vivi-api` / `vivi-clients`. |
| `Jwt__AccessTokenMinutes` | Access token lifetime. Default `480` (8 hours). |
| `Seed__AdminEmail` | First admin email if the table is empty. |
| `Seed__AdminPassword` | First admin password. If empty, no admin is seeded. |
| `Seed__AdminName` | Display name. Default `Vivi Priya`. |
| `ConnectionStrings__DefaultConnection` | Azure SQL or LocalDB. |
| `Blob__Provider` | `Azure` or `InMemory`. |
| `Blob__ConnectionString` | Storage account or `UseDevelopmentStorage=true`. |
| `Blob__ContainerName` | Default `videos` (private). |
| `Blob__UploadSasMinutes` | Write SAS lifetime. Default `30`. |
| `Blob__ReadSasMinutes` | Read SAS lifetime. Default `15`. |
| `Blob__MaxUploadBytes` | Default `2147483648` (2 GB). |
| `Cors__AllowedOrigins__0` | Admin SPA origin (add `__1`, `__2` for more). |
| `Database__AutoMigrate` | Apply EF migrations on startup. Default `false` in Production. |
| `Database__AutoSeed` | Seed admin/categories when empty. Default `true`. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Optional. Telemetry is disabled when empty. |

See [AZURE_DEPLOYMENT.md](../AZURE_DEPLOYMENT.md) for full Azure deployment steps.

### Local user-secrets

```powershell
cd backend/VIVI.Api
dotnet user-secrets set "Jwt:SigningKey" "CHANGE_ME_to_a_long_random_string!!"
dotnet user-secrets set "Seed:AdminPassword" "ChangeMe!234"
```

## Database

Development default (in `appsettings.Development.json`, not a secret):

```text
Server=(localdb)\mssqllocaldb;Database=ViviCrochet;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True
```

On startup the API optionally runs EF migrations and seeds data, controlled by `Database:AutoMigrate` and `Database:AutoSeed`:

- **Development** (`appsettings.Development.json`): `AutoMigrate=true`, `AutoSeed=true`
- **Production** (`appsettings.Production.json`): `AutoMigrate=false`, `AutoSeed=true`

For production, run migrations explicitly before deploy:

```powershell
.\scripts\apply-migrations.ps1 -ConnectionString "<azure-sql-connection-string>"
```

Seeding:

- the admin account (only when `AdminUsers` is empty **and** `Seed__AdminPassword` is set)
- two categories: Learn & Loop, Viral projects

### Migration commands

From `backend/`:

```powershell
dotnet tool restore
dotnet ef migrations add InitialCreate --project VIVI.Infrastructure --startup-project VIVI.Api --output-dir Data/Migrations
dotnet ef database update --project VIVI.Infrastructure --startup-project VIVI.Api
```

If the `dotnet-ef` tool is not installed:

```powershell
dotnet tool install --global dotnet-ef
```

To apply migrations without starting the API:

```powershell
$env:ConnectionStrings__DefaultConnection = "Server=(localdb)\mssqllocaldb;Database=ViviCrochet;Trusted_Connection=True;TrustServerCertificate=True"
dotnet ef database update --project VIVI.Infrastructure --startup-project VIVI.Api
```

## Run locally

```powershell
cd backend
$env:Jwt__SigningKey = "CHANGE_ME_to_a_long_random_string!!"
$env:Seed__AdminPassword = "ChangeMe!234"
dotnet run --project VIVI.Api
```

- API: http://localhost:5080
- Swagger: http://localhost:5080/swagger

Authorize in Swagger with `Bearer {accessToken}` after `POST /api/auth/login`.

## Seed admin

1. Set `Seed__AdminPassword` (and optionally `Seed__AdminEmail`).
2. Start the API against an empty database (or delete the `AdminUsers` row).
3. Log in:

```json
POST /api/auth/login
{ "email": "admin@vivicrochet.local", "password": "ChangeMe!234" }
```

The password is hashed with ASP.NET Identity. It is never stored in source.

## Tests

```powershell
cd backend
$env:Jwt__SigningKey = "vivi-test-signing-key-must-be-32-chars!"
dotnet test
```

Tests use EF InMemory + the InMemory blob provider. They do not need SQL Server or Azure.

## Video upload flow (how to test)

Large files go **browser → Blob**, never through this API.

### 1. Login

`POST /api/auth/login` → copy `accessToken`.

### 2. Create a course

`POST /api/courses` (Authorize: Admin)

### 3. Request a write SAS

```json
POST /api/videos/upload-url
{
  "courseId": "...",
  "fileName": "lesson-01.mp4",
  "contentType": "video/mp4",
  "fileSizeBytes": 10485760
}
```

Allowed extensions: `.mp4`, `.mov`, `.webm`. Max size: 2 GB. The video row is created as **Draft**.

### 4. Upload directly to Blob

```http
PUT {uploadUrl}
x-ms-blob-type: BlockBlob
Content-Type: video/mp4
```

Body = the raw file bytes. Watch progress in the client (`xhr.upload.onprogress`).

With `Blob:Provider=InMemory` this PUT is not a real store — skip to step 5 for API-only testing.

With Azurite:

```powershell
npx azurite --silent --location $env:TEMP\azurite --debug $env:TEMP\azurite\debug.log
```

Set `Blob__Provider=Azure` and `Blob__ConnectionString=UseDevelopmentStorage=true`.

### 5. Confirm

`POST /api/videos/{id}/upload-complete`

The API checks that the blob exists (Azure) or records completion (InMemory). Status stays **Draft**.

### 6. Publish

`POST /api/videos/{id}/publish`  
`POST /api/courses/{id}/publish`

### 7. Stream

`GET /api/videos/{id}/stream-url` (any authenticated user)

Returns a **15-minute read SAS**. Draft videos return `403 VIDEO_NOT_PUBLISHED`. Unpublished courses are hidden from anonymous `GET /api/courses`.

## Azure resources (production)

| Resource | Use |
| --- | --- |
| Resource group | Holds everything |
| Azure SQL Database | EF tables |
| Storage account + private `videos` container | Lesson files. Disable public blob access. |
| App Service (Linux) | This API |
| Application Insights | Request/dependency logs |
| Key Vault (later) | Same settings as environment variables |

Do **not** put the storage account key in any frontend. Only this API mints SAS tokens.

Storage CORS (for the future admin SPA origin):

- Allowed origins: the admin site
- Allowed methods: `PUT`, `OPTIONS`
- Allowed headers: `Content-Type`, `x-ms-blob-type`, `x-ms-blob-content-type`

## API surface

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/login` | Anonymous |
| POST | `/api/auth/dev/customer-login` | Anonymous (Development only — mobile dev login) |
| GET | `/api/health` | Anonymous |
| GET | `/api/categories` | Anonymous (active only) |
| POST/PUT/DELETE | `/api/categories` | Admin |
| GET | `/api/courses` | Anonymous (published only) |
| GET | `/api/courses/{id}` | Anonymous (published only) |
| POST/PUT/DELETE | `/api/courses` | Admin |
| POST | `/api/courses/{id}/publish` | Admin |
| POST | `/api/courses/{id}/unpublish` | Admin |
| GET | `/api/videos` | Anonymous (published only) |
| GET | `/api/videos/{id}` | Anonymous (published only) |
| POST | `/api/videos/upload-url` | Admin |
| POST | `/api/videos/{id}/upload-complete` | Admin |
| PUT/DELETE | `/api/videos/{id}` | Admin |
| POST | `/api/videos/{id}/publish` | Admin |
| POST | `/api/videos/{id}/unpublish` | Admin |
| GET | `/api/videos/{id}/stream-url` | Authenticated + published |

## Notes

- `Course.CategoryId` is optional and links to `Categories`.
- Videos stay Draft until an admin publishes them after `upload-complete`.
- Application Insights is registered and stays silent without a connection string.
