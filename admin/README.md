# VIVI Admin Dashboard

React + Vite admin console for VIVI Crochet. Manages courses, categories, and direct-to-Azure video uploads.

## Requirements

- Node.js 20+
- VIVI API running (default `http://localhost:5080`)
- **Azurite or Azure Storage** for real browser video uploads (InMemory blob provider does not accept browser PUTs)

## Quick start

```powershell
cd admin
cp .env.example .env.local   # or copy manually on Windows
npm install
npm run dev
```

Open http://localhost:5173 and sign in with the seeded admin account from the API (`Seed__AdminEmail` / `Seed__AdminPassword`).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:5080` | VIVI API base URL (no trailing slash) |

Never put storage keys, JWT signing keys, or database passwords in frontend env files. The API returns short-lived SAS URLs for uploads.

## Azurite setup (local blob uploads)

The API's Development profile uses `Blob:Provider=InMemory`, which is fine for API tests but **not** for browser uploads. For the full upload flow:

### 1. Start Azurite

```powershell
npx azurite --silent --location $env:TEMP\azurite --debug $env:TEMP\azurite\debug.log
```

Default blob endpoint: `http://127.0.0.1:10000`

### 2. Configure the API

Set these when starting the API (user-secrets or environment):

```powershell
$env:Blob__Provider = "Azure"
$env:Blob__ConnectionString = "UseDevelopmentStorage=true"
$env:Cors__AllowedOrigins__0 = "http://localhost:5173"
```

### 3. Configure Azurite CORS

Azurite must allow PUT from the admin origin. Using Azure CLI against Azurite:

```powershell
az storage cors add --services b --methods PUT OPTIONS --origins http://localhost:5173 --allowed-headers "Content-Type,x-ms-blob-type,x-ms-blob-content-type" --exposed-headers "*" --max-age 3600 --connection-string "UseDevelopmentStorage=true"
```

Or use the Azurite default (often works for local dev on `127.0.0.1`).

### 4. Start API + Admin

```powershell
# Terminal 1 — API
cd backend
$env:Jwt__SigningKey = "CHANGE_ME_to_a_long_random_string!!"
$env:Seed__AdminPassword = "ChangeMe!234"
$env:Blob__Provider = "Azure"
$env:Blob__ConnectionString = "UseDevelopmentStorage=true"
dotnet run --project VIVI.Api

# Terminal 2 — Admin
cd admin
npm run dev
```

## Upload architecture

```text
Admin browser
  → POST /api/videos/upload-url     (JWT, metadata only)
  ← SAS upload URL
  → PUT {uploadUrl}                 (file bytes, XHR progress)
  → POST /api/videos/{id}/upload-complete
  → PUT /api/videos/{id}            (title, duration, etc.)
  → POST /api/videos/{id}/publish
```

Video files never pass through the ASP.NET API.

## Routes

| Path | Screen |
| --- | --- |
| `/login` | Admin sign-in |
| `/` | Dashboard (course/video counts) |
| `/courses` | Courses table |
| `/courses/new` | Create course |
| `/courses/:id` | Course detail + lessons |
| `/courses/:id/edit` | Edit course |
| `/categories` | Category CRUD |

## Test the full flow

1. Start Azurite + API (Azure blob provider) + `npm run dev`
2. Login with seed admin
3. Create a course (Draft)
4. Open course → Add video → select a real `.mp4`
5. Watch upload progress reach 100%
6. Confirm video appears as Draft with upload confirmed
7. Publish video, then publish course
8. Refresh — state should persist

Also verify: invalid file type, logout, expired JWT redirect, API offline error message.

## Production build

```powershell
$env:VITE_API_BASE_URL = "https://your-api.azurewebsites.net"
npm run build
```

Deploy the `dist/` folder to Azure Static Web Apps or App Service. See [AZURE_DEPLOYMENT.md](../AZURE_DEPLOYMENT.md).
