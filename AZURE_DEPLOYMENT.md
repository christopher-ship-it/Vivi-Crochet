# VIVI Crochet — Azure Deployment Guide

This document describes how to deploy the VIVI platform to Azure App Service, Azure SQL, and Azure Blob Storage.

**Architecture**

```text
VIVI Admin (Static Web Apps or App Service)
        ↓ HTTPS
Azure App Service  →  ASP.NET Core API
        ├── Azure SQL Database
        └── Azure Blob Storage (private `videos` container)
                ↑ HTTPS (read/write SAS)
VIVI Mobile App (Expo)
```

**Prerequisites**

- Azure subscription with permission to create resources
- [.NET 10 SDK](https://dotnet.microsoft.com/download) locally
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`) logged in
- Node.js 20+ (admin build)
- Expo / EAS account (mobile production builds)

**Region recommendation:** Central India or South India (customers and operator are India-based).

---

## 1. Azure resources

Create a resource group and core services. Replace names and passwords with your own values.

```powershell
$RG = "rg-vivi-prod"
$LOCATION = "centralindia"
$SQL_ADMIN = "viviadmin"
$SQL_PASSWORD = "REPLACE_STRONG_PASSWORD"
$SQL_SERVER = "sql-vivi-prod"          # must be globally unique
$SQL_DB = "sqldb-vivi"
$STORAGE = "stvivi$(Get-Random -Maximum 99999)"   # globally unique, lowercase
$APP_PLAN = "plan-vivi"
$API_APP = "app-vivi-api"              # globally unique
$INSIGHTS = "appi-vivi"

az group create --name $RG --location $LOCATION

# Application Insights
az monitor app-insights component create `
  --app $INSIGHTS --location $LOCATION --resource-group $RG `
  --application-type web

$AI_CONNECTION = az monitor app-insights component show `
  --app $INSIGHTS --resource-group $RG --query connectionString -o tsv

# Storage account — disable public blob access
az storage account create `
  --name $STORAGE --resource-group $RG --location $LOCATION `
  --sku Standard_LRS --kind StorageV2 `
  --allow-blob-public-access false

$STORAGE_CONN = az storage account show-connection-string `
  --name $STORAGE --resource-group $RG -o tsv

# Private videos container
az storage container create `
  --name videos --account-name $STORAGE --auth-mode login `
  --public-access off

# Azure SQL
az sql server create `
  --name $SQL_SERVER --resource-group $RG --location $LOCATION `
  --admin-user $SQL_ADMIN --admin-password $SQL_PASSWORD

az sql server firewall-rule create `
  --resource-group $RG --server $SQL_SERVER `
  --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Add your developer IP for initial migration (remove after deploy):
# az sql server firewall-rule create --resource-group $RG --server $SQL_SERVER `
#   --name DevMachine --start-ip-address YOUR.IP --end-ip-address YOUR.IP

az sql db create `
  --resource-group $RG --server $SQL_SERVER --name $SQL_DB `
  --service-objective S0 --backup-storage-redundancy Local

$SQL_CONN = "Server=tcp:${SQL_SERVER}.database.windows.net,1433;Initial Catalog=${SQL_DB};User ID=${SQL_ADMIN};Password=${SQL_PASSWORD};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

# App Service Plan + API
az appservice plan create `
  --name $APP_PLAN --resource-group $RG --location $LOCATION `
  --sku B1 --is-linux

az webapp create `
  --name $API_APP --resource-group $RG --plan $APP_PLAN `
  --runtime "DOTNET:10"
```

---

## 2. Azure SQL — migrations

The project includes one EF Core migration: `20260831053734_InitialCreate`.

### Initial migration (recommended for production)

Run migrations **before** starting the API with `Database__AutoMigrate=false`:

```powershell
cd d:\Vivi
.\scripts\apply-migrations.ps1 -ConnectionString $SQL_CONN
```

Or manually:

```powershell
$env:ConnectionStrings__DefaultConnection = $SQL_CONN
$env:Jwt__SigningKey = "migration-placeholder-key-32chars-min!!"
dotnet ef database update `
  --project backend\VIVI.Infrastructure `
  --startup-project backend\VIVI.Api
```

### Production startup behaviour

| Setting | Production default | Purpose |
| --- | --- | --- |
| `Database__AutoMigrate` | `false` | Do **not** auto-apply migrations on App Service restart |
| `Database__AutoSeed` | `true` | Seed admin + categories only when tables are empty |

Set `Database__AutoMigrate=true` only for disposable environments. Prefer CI/CD or `apply-migrations.ps1` for production.

### Future migrations

```powershell
dotnet ef migrations add <Name> --project backend\VIVI.Infrastructure --startup-project backend\VIVI.Api
.\scripts\apply-migrations.ps1 -ConnectionString $SQL_CONN
```

Never drop or recreate the production database.

---

## 3. Azure Blob Storage

| Setting | Value |
| --- | --- |
| Container | `videos` |
| Public access | **Off** (private) |
| Account setting | `AllowBlobPublicAccess = false` |

**Upload flow (Admin)**

```text
Admin → POST /api/videos/upload-url → API mints write SAS → Browser PUT → private blob
```

**Playback flow (Mobile)**

```text
Mobile → GET /api/videos/{id}/stream-url → API mints 15-min read SAS → expo-video streams
```

Storage account keys and connection strings stay **server-side only** in App Service settings.

### Blob CORS (required for Admin direct upload)

Configure CORS on the **storage account** (not the API). Allow only admin origins.

**Production example** (replace with your admin URL):

```powershell
az storage cors add `
  --services b `
  --methods PUT OPTIONS HEAD GET `
  --origins https://admin.vivicrochet.in `
  --allowed-headers "Content-Type,x-ms-blob-type,x-ms-blob-content-type,x-ms-version" `
  --exposed-headers "x-ms-request-id,x-ms-version" `
  --max-age 3600 `
  --account-name $STORAGE
```

**Local development** (add Azurite or dev storage account rule):

```powershell
az storage cors add `
  --services b `
  --methods PUT OPTIONS `
  --origins http://localhost:5173 `
  --allowed-headers "Content-Type,x-ms-blob-type,x-ms-blob-content-type" `
  --max-age 3600 `
  --account-name $STORAGE
```

Do **not** use `*` for origins in production.

---

## 4. API — App Service configuration

Generate a JWT signing key (32+ characters). Set application settings in Azure Portal or CLI:

```powershell
$JWT_KEY = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))

az webapp config appsettings set --resource-group $RG --name $API_APP --settings `
  ASPNETCORE_ENVIRONMENT=Production `
  Jwt__SigningKey=$JWT_KEY `
  Jwt__Issuer=vivi-api `
  Jwt__Audience=vivi-clients `
  ConnectionStrings__DefaultConnection=$SQL_CONN `
  Blob__Provider=Azure `
  Blob__ConnectionString=$STORAGE_CONN `
  Blob__ContainerName=videos `
  Database__AutoMigrate=false `
  Database__AutoSeed=true `
  Seed__AdminEmail=admin@vivicrochet.in `
  Seed__AdminPassword="REPLACE_ON_FIRST_DEPLOY_ONLY" `
  Seed__AdminName="Vivi Priya" `
  Cors__AllowedOrigins__0="https://YOUR-ADMIN-URL" `
  APPLICATIONINSIGHTS_CONNECTION_STRING=$AI_CONNECTION
```

**After first admin login:** remove `Seed__AdminPassword` from App Service settings.

### Health check

Configure App Service health check:

| Setting | Value |
| --- | --- |
| Path | `/api/health` |
| Response | `{ "status": "ok" }` |

Portal: App Service → **Health check** → enable, path `/api/health`.

Or: `WEBSITE_HEALTHCHECK_PATH=/api/health`

### HTTPS

App Service provides TLS termination. The API enables:

- `UseHttpsRedirection()`
- `UseHsts()` in Production
- `UseForwardedHeaders()` for correct scheme behind the load balancer

### Swagger

Swagger UI is **disabled in Production**. It remains available in Development only.

---

## 5. API — build and deploy

```powershell
.\scripts\publish-api.ps1
Compress-Archive -Path publish\api\* -DestinationPath publish\api.zip -Force
```

### Do NOT use Portal “QuickDeploy” for pre-built zips

The Portal flow **“Deploy your application by uploading a zip file”** (QuickDeploy) runs **Oryx build** and expects source code (`.csproj`). Pre-published output will fail with:

`Couldn't detect a version for the platform 'dotnet' in the repo.`

`SCM_DO_BUILD_DURING_DEPLOYMENT=false` does **not** reliably disable that Portal builder.

### Recommended deploy methods (no build)

**Option A — Kudu Zip Push Deploy (Portal, no CLI)**

1. Set app settings: `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `ENABLE_ORYX_BUILD=false`
2. **app-vivi-api** → **Advanced Tools** → **Go** (opens Kudu)
3. Top menu → **Tools** → **Zip Push Deploy**
4. Drag `publish\api.zip` onto the page
5. Wait for “Deployment successful”

**Option B — Kudu script (PowerShell)**

Download publish profile from Portal → Overview → **Download publish profile**, then:

```powershell
.\scripts\deploy-api-kudu.ps1 -AppName app-vivi-api -PublishProfilePath .\app-vivi-api.PublishSettings
```

**Option C — Azure CLI**

```powershell
az webapp deployment source config-zip --resource-group $RG --name $API_APP --src publish\api.zip
```

Or deploy from local git / GitHub Actions using `azure/webapps-deploy`.

Verify:

```powershell
curl https://$API_APP.azurewebsites.net/api/health
# {"status":"ok"}
```

---

## 6. API CORS

Configured via `Cors__AllowedOrigins__0`, `__1`, etc.

| Environment | Example origins |
| --- | --- |
| Development | `http://localhost:5173` |
| Production | `https://admin.vivicrochet.in` |

Mobile apps call the API directly (not browser CORS). Only the Admin SPA needs API CORS.

Unauthorized browser origins are rejected by ASP.NET Core CORS middleware.

---

## 7. Admin Dashboard deployment

### Configure production API URL

```powershell
cd admin
$env:VITE_API_BASE_URL = "https://app-vivi-api.azurewebsites.net"
npm ci
npm run build
```

Output is in `admin/dist/`.

### Deploy options

**Azure Static Web Apps (recommended)**

1. Create SWA in Portal linked to your Git repo (`admin/` as app location).
2. Set build command: `npm run build`
3. Set output: `dist`
4. Set `VITE_API_BASE_URL` in SWA **Configuration → Application settings**.

**Azure App Service (static site)**

Upload `dist/` contents to an App Service static site or blob `$web` container with CDN.

### Post-deploy checklist

- [ ] Admin loads over HTTPS
- [ ] Login works against production API
- [ ] CORS allows admin origin on **API** App Service
- [ ] Blob CORS allows admin origin on **Storage account**
- [ ] Video upload reaches 100% and completes

---

## 8. Mobile app — production configuration

### Environment

Create `mobile/.env.production` (not committed):

```text
EXPO_PUBLIC_API_BASE_URL=https://app-vivi-api.azurewebsites.net
EXPO_PUBLIC_ALLOW_HTTP=false
```

### Build with EAS

```powershell
cd mobile
npm ci
eas build --platform android --profile production
eas build --platform ios --profile production
```

Example `eas.json` production profile should pass `EXPO_PUBLIC_API_BASE_URL` via EAS secrets.

**Production requirements:**

- HTTPS API URL only
- `EXPO_PUBLIC_ALLOW_HTTP` unset or `false` (disables Android cleartext)
- No `localhost`, `10.0.2.2`, or LAN IP in production builds

### Dev customer login

`POST /api/auth/dev/customer-login` is **disabled in Production** (`ASPNETCORE_ENVIRONMENT=Production`).

Phone OTP must be implemented before production mobile launch. Until then, test mobile against a Development API or implement OTP.

---

## 9. Security checklist

| Item | Status |
| --- | --- |
| Secrets in App Service settings / Key Vault, not Git | Required |
| JWT signing key ≥ 32 chars from config | Required |
| Issuer / audience validated | Configured |
| Admin endpoints require `Admin` role | Implemented |
| Blob container private | Configure in Portal |
| SAS URLs short-lived (30 min write, 15 min read) | Configured |
| No SAS / JWT / passwords in logs | Verified |
| File type + size validation on upload-url | Implemented |
| EF Core parameterized queries | EF Core default |
| Swagger disabled in Production | Implemented |
| HSTS in Production | Implemented |
| `dev/customer-login` disabled in Production | Implemented |

---

## 10. Production E2E test

Run after all resources are deployed:

```text
1. GET https://<api>/api/health → ok
2. Admin login (seeded admin)
3. Create course
4. Upload real MP4 (SAS → Blob)
5. Publish video + course
6. Mobile app (production build) → Learn → course → lesson
7. GET /api/videos/{id}/stream-url → play video from Blob
```

**This repository prepares deployment configuration. Actual E2E success requires real Azure resources to be created and tested manually.**

---

## 11. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Admin upload fails with CORS | Blob CORS missing admin origin |
| Admin API calls blocked | API `Cors__AllowedOrigins` missing admin URL |
| `Jwt:SigningKey` error on start | App setting not set or too short |
| Migration errors | Firewall blocking SQL; run `apply-migrations.ps1` from allowed IP |
| Video upload 403 to blob | SAS expired or wrong CORS headers |
| Mobile cannot connect | Wrong `EXPO_PUBLIC_API_BASE_URL`; must be HTTPS in prod |
| Mobile login 404 | `dev/customer-login` unavailable in Production — OTP not yet implemented |

---

## 12. Files reference

| File | Purpose |
| --- | --- |
| `backend/.env.example` | All API environment variables (placeholders) |
| `backend/VIVI.Api/appsettings.Production.json` | Production defaults (no secrets) |
| `admin/.env.example` | Admin API URL configuration |
| `mobile/.env.example` | Mobile API URL configuration |
| `scripts/publish-api.ps1` | Build API for App Service |
| `scripts/apply-migrations.ps1` | Apply EF migrations to Azure SQL |
