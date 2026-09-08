# VIVI Crochet — Technical Implementation Plan

**Document status:** Analysis complete. Do not start major implementation until the questions in §13 are answered.  
**Target launch:** 15 September 2026  
**Authoring date:** 31 August 2026  
**Team:** one developer

---

## 0. Workspace inventory (what already exists)

The workspace is a **design/reference pack**, not an application repo. There is **no** ASP.NET API, no React/Next dashboard, no React Native / Flutter / Swift / Kotlin app, no `package.json`, no `.csproj`, no Azure Bicep/Terraform, and no existing auth or database code.

### Files that matter

| Path | What it is | Reuse? |
| --- | --- | --- |
| `vivi/VIVI Crochet App.dc.html` | Full interactive **customer mobile** prototype (Design Components + React-like `DCLogic`) | Visual + copy + flows source of truth. Do **not** ship the DC runtime. |
| `vivi/VIVI Admin (standalone).html` | Bundled interactive **admin console** prototype (same DC stack, Modernist tokens) | Visual + admin IA source of truth. Do **not** ship the bundler. |
| `vivi/support.js` | Generated DC runtime (`dc-runtime`). Not application code. | Do not reuse. |
| `vivi/_ds/modernist-…/` | **Modernist** design system (Archivo, red accent `#ec3013` in the system; product UI overrides to `#e8215b`, 0 radius, 2px rules) | Reuse tokens/classes conceptually. Both prototypes consume Modernist. |
| `vivi/_ds/nocturne-…/` | Unused **Nocturne** dark system (Inter, blurple). Not applied to VIVI screens. | Ignore for MVP. |
| `vivi/uploads/` | Brand + product photography | Reuse as seed images / splash / course heroes. |
| `__MACOSX/` | macOS zip leftovers | Ignore. |

### Brand assets already in the pack

- Circular brand mark / Vivi portrait: `uploads/731068068_17881715634670587_6839960888500779976_n.jpg`
- Hero (Vivi with handmade doll): `uploads/ae910767-1a30-4523-90f8-381a5002daf0.png`
- Product photos: Puffin Buddy, Grey Elephant, Plush Turtle, Mesh Crop Top, Sunday Chick, Stripe Blanket
- Product accent used in both prototypes (overrides Modernist red): **`#e8215b`**
- Ink: `#221a1e` · Cream canvas: `#fffaf9` / `#f7f4f5` · Admin rail: `#191315`
- Type: **Archivo 400/600/800**
- Support copy in the prototype: WhatsApp `+91 90000 12345` (placeholder), email `help@vivicrochet.in`, currency **INR**, India PIN-based delivery

### Design systems vs product UI

Both shipped screens use Modernist structure (flush-left labels, 2px rules, 0 radius) but **the live product palette is VIVI pink**, not Modernist’s `#ec3013`. Implementation should copy the **prototype CSS values**, not the unused Nocturne pack.

---

## 1. Project overview

VIVI Crochet is a Tamil Nadu–based handmade crochet brand that sells finished pieces **and** teaches the stitches behind them.

The design describes **one business with two clients**:

1. **VIVI Mobile App** — customer app: browse handmade products, buy **Learn & Loop** video courses (30-day streaming licence), book weekday live batches, track production orders, manage a phone-OTP account.
2. **VIVI Admin Console** — operator desk for Vivi: sales snapshot, handmade **production pipeline**, **courses & videos**, customers/entitlements, live-class capacity, payments, and an audit log.

The **MVP the business asked to have live by 15 September** is the **video spine**, not the entire designed platform:

```
Admin logs in
  → creates / opens a course
  → requests a secure upload URL
  → browser uploads the video file directly to Azure Blob Storage (with progress)
  → API stores lesson metadata in Azure SQL (status = Draft)
  → admin publishes the course / lesson
  → mobile app lists published lessons
  → signed, short-lived stream URL
  → customer plays the video
```

Everything else in the prototypes (shop checkout, Razorpay-style gateway, WhatsApp receipts, live seat booking, production Kanban, watermark transcoding, six audio tracks) is **real product intent** and is inventoried below so it is not forgotten — but it is **out of P0** so one developer can actually ship.

**Videos are not a flat gallery.** In both prototypes a video is a **lesson inside a course**. Courses have types (`DIGITAL_COURSE`, `PROJECT_COURSE`, `BUNDLE`), prices, 30-day access, renewal discount, languages, and `DRAFT` / `PUBLISHED` status. The API and schema follow that model.

---

## 2. Architecture

```
┌──────────────────────┐     JWT (admin)      ┌─────────────────────────┐
│  VIVI Admin          │ ───────────────────► │                         │
│  React + Vite        │                      │  VIVI API               │
│  (Azure Static       │  SAS URL (write)     │  ASP.NET Core           │
│   Web Apps / App     │ ◄─────────────────── │  Azure App Service      │
│   Service)           │                      │                         │
│                      │  PUT / blocks ───────┼──► Azure Blob (private) │
│                      │  (browser → blob,    │                         │
│                      │   never through API) │  EF Core ───────────────┼──► Azure SQL
└──────────────────────┘                      │                         │
                                              │  App Insights           │
┌──────────────────────┐     JWT (customer)   │  (ILogger + telemetry)  │
│  VIVI Mobile         │ ───────────────────► │                         │
│  Expo (React Native) │  GET published       │                         │
│                      │  GET stream-url      │                         │
│  expo-video player   │ ◄── short-lived SAS  │                         │
└──────────────────────┘     (read, 15 min)   └─────────────────────────┘
```

### How the pieces talk

| From | To | How | What travels |
| --- | --- | --- | --- |
| Admin browser | API | HTTPS + `Authorization: Bearer` | JSON only. Metadata, publish, SAS requests. **No video bytes.** |
| Admin browser | Blob | HTTPS PUT to SAS URL | Video bytes. `x-ms-blob-type: BlockBlob`. Progress from `XMLHttpRequest` / Azure SDK. |
| Mobile app | API | HTTPS + Bearer (after OTP) | Course/lesson catalogues, progress, stream-URL requests. |
| Mobile player | Blob | HTTPS GET to SAS URL | Video stream. Player never sees the storage account key. |
| API | Azure SQL | EF Core, TLS, managed identity in prod | Users, courses, videos, upload sessions. |
| API | Blob | `Azure.Storage.Blobs` + account key or managed identity **server-side only** | Mint SAS, delete blobs, verify upload exists. |

One API, one database, one storage account. No microservices, no Kubernetes, no API Management for MVP.

---

## 3. Repository structure

Keep a single git repo. One developer should not maintain three remotes.

```
vivi-crochet/
├── PROJECT_PLAN.md                 ← this file
├── design/                         ← move the existing prototype pack here (read-only reference)
├── backend/
│   └── Vivi.Api/                   ← ASP.NET Core Web API (.NET 10 LTS)
│       ├── Controllers/
│       ├── Domain/                 ← entities
│       ├── Data/                   ← DbContext + migrations
│       ├── Auth/
│       ├── Storage/                ← Blob + SAS
│       ├── Options/                ← strongly typed config
│       └── appsettings.json        ← non-secret defaults only
├── admin/                          ← Vite + React + TypeScript
│   └── src/
│       ├── pages/                  ← Login, Courses, VideoEditor
│       ├── api/                    ← fetch wrappers
│       └── styles/                 ← VIVI tokens from the prototype
├── mobile/                         ← Expo (React Native + TypeScript)
│   └── app/                        ← Learn, Course, Player, Account (Expo Router)
├── infra/                          ← optional later: Bicep for the Azure resources
└── .github/workflows/              ← build + deploy (add when Azure is ready)
```

**Shared types:** do **not** add a fourth package on day 1. The API is the contract. Generate an OpenAPI document from ASP.NET (`/swagger/v1/swagger.json`) and, if needed later, emit TypeScript types. Duplicating 15 DTO interfaces by hand is cheaper than a monorepo toolchain for one person.

**Do not** port `support.js` or the `__bundler` HTML. Rebuild screens in React / React Native against the prototype as a visual spec.

---

## 4. Database schema (Azure SQL, MVP only)

SQL Server naming: `PascalCase` tables, `Id uniqueidentifier` PKs, UTC `datetime2(0)`. Soft-delete on content tables.

### 4.1 `Roles`

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `tinyint` PK | Seeded |
| `Name` | `nvarchar(32)` UNIQUE | `Admin`, `Customer` |

Seed: `1 = Admin`, `2 = Customer`. One role per user for MVP (no extra `UserRoles` join).

### 4.2 `Users`

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `uniqueidentifier` PK | `NEWSEQUENTIALID()` |
| `RoleId` | `tinyint` NOT NULL FK → `Roles` | |
| `PhoneE164` | `nvarchar(16)` NULL UNIQUE | Customer login. Admin may be null. |
| `Email` | `nvarchar(256)` NULL UNIQUE | Admin login. Customer optional. |
| `PasswordHash` | `nvarchar(200)` NULL | Admin only. ASP.NET Identity hasher. |
| `DisplayName` | `nvarchar(120)` NULL | |
| `IsActive` | `bit` NOT NULL DEFAULT 1 | |
| `CreatedAtUtc` | `datetime2(0)` NOT NULL | |
| `LastLoginAtUtc` | `datetime2(0)` NULL | |

Indexes: `IX_Users_PhoneE164` (unique, filtered `WHERE PhoneE164 IS NOT NULL`), `IX_Users_Email` (unique, filtered).

### 4.3 `Categories`

The design does not have a standalone “Categories” admin. It has **course types** (Course / Viral project / Bundle) and the Learn tab (`courses` / `viral`). A small lookup keeps the API the user asked for without inventing extra IA.

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `uniqueidentifier` PK | |
| `Slug` | `nvarchar(64)` NOT NULL UNIQUE | `courses`, `viral-projects` |
| `Name` | `nvarchar(80)` NOT NULL | `Learn & Loop`, `Viral projects` |
| `SortOrder` | `int` NOT NULL | |
| `IsActive` | `bit` NOT NULL DEFAULT 1 | |

Seed two rows matching the Learn tabs. Shop categories (`Amigurumi`, `Apparel`, …) are **not** in P0.

### 4.4 `Courses`

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `uniqueidentifier` PK | |
| `CategoryId` | `uniqueidentifier` NOT NULL FK → `Categories` | |
| `Slug` | `nvarchar(80)` NOT NULL UNIQUE | `basic`, `rose` |
| `Name` | `nvarchar(160)` NOT NULL | |
| `Type` | `nvarchar(32)` NOT NULL | `DIGITAL_COURSE` \| `PROJECT_COURSE` \| `BUNDLE` |
| `Level` | `nvarchar(80)` NULL | “Beginner” |
| `About` | `nvarchar(2000)` NULL | |
| `PriceInr` | `int` NOT NULL | Stored as rupees integer |
| `MrpInr` | `int` NULL | Strike-through |
| `AccessDays` | `int` NOT NULL DEFAULT 30 | Stored for later entitlements; unused in P0 playback |
| `RenewalDiscountPercent` | `tinyint` NOT NULL DEFAULT 50 | Stored for later |
| `Status` | `nvarchar(16)` NOT NULL | `Draft` \| `Published` |
| `LanguagesCsv` | `nvarchar(200)` NULL | `Tamil,English,…` — display only in P0 |
| `HeroBlobPath` | `nvarchar(512)` NULL | Optional image |
| `SortOrder` | `int` NOT NULL DEFAULT 0 | |
| `CreatedByUserId` | `uniqueidentifier` NOT NULL FK → `Users` | |
| `CreatedAtUtc` | `datetime2(0)` NOT NULL | |
| `UpdatedAtUtc` | `datetime2(0)` NOT NULL | |
| `PublishedAtUtc` | `datetime2(0)` NULL | |
| `IsDeleted` | `bit` NOT NULL DEFAULT 0 | |

Indexes: `IX_Courses_Status_IsDeleted`, `IX_Courses_CategoryId`.

### 4.5 `Videos`

A row is one lesson. Blob path is stored here; the file itself is in Azure Blob.

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `uniqueidentifier` PK | |
| `CourseId` | `uniqueidentifier` NOT NULL FK → `Courses` | |
| `Title` | `nvarchar(200)` NOT NULL | |
| `Description` | `nvarchar(1000)` NULL | Under the player |
| `SortOrder` | `int` NOT NULL | Renumber on delete |
| `DurationSeconds` | `int` NULL | From admin `mm:ss` or later probe |
| `IsFreePreview` | `bit` NOT NULL DEFAULT 0 | Playable without login |
| `HasPatternPdf` | `bit` NOT NULL DEFAULT 0 | Flag only in P0; PDF upload is P1 |
| `Status` | `nvarchar(16)` NOT NULL | `Uploading` \| `Draft` \| `Published` \| `Failed` |
| `BlobContainer` | `nvarchar(64)` NOT NULL | `videos` |
| `BlobName` | `nvarchar(256)` NOT NULL | `{courseId}/{videoId}/{safeFile}` |
| `ContentType` | `nvarchar(80)` NULL | `video/mp4` |
| `SizeBytes` | `bigint` NULL | |
| `OriginalFileName` | `nvarchar(260)` NULL | |
| `ContentSha256` | `char(64)` NULL | Duplicate detection when provided |
| `HookNote` | `nvarchar(80)` NULL | e.g. `4 mm hook` (from player design) |
| `YarnNote` | `nvarchar(80)` NULL | e.g. `Cotton 8-ply` |
| `CreatedAtUtc` | `datetime2(0)` NOT NULL | |
| `UpdatedAtUtc` | `datetime2(0)` NOT NULL | |
| `PublishedAtUtc` | `datetime2(0)` NULL | |
| `IsDeleted` | `bit` NOT NULL DEFAULT 0 | Soft delete; blob purged after |

Indexes: `IX_Videos_CourseId_SortOrder`, `IX_Videos_Status` (filtered `IsDeleted = 0`), unique `UX_Videos_BlobName`.

### 4.6 `UploadSessions`

Required so interrupted / retried uploads do not leave orphan blobs or half-saved lessons.

| Column | Type | Notes |
| --- | --- | --- |
| `Id` | `uniqueidentifier` PK | Client-visible `uploadId` |
| `VideoId` | `uniqueidentifier` NOT NULL FK → `Videos` | |
| `RequestedByUserId` | `uniqueidentifier` NOT NULL FK → `Users` | |
| `BlobName` | `nvarchar(256)` NOT NULL | |
| `SasExpiresAtUtc` | `datetime2(0)` NOT NULL | |
| `ExpectedSizeBytes` | `bigint` NOT NULL | |
| `ExpectedContentType` | `nvarchar(80)` NOT NULL | |
| `State` | `nvarchar(16)` NOT NULL | `Pending` \| `Completed` \| `Abandoned` \| `Failed` |
| `CreatedAtUtc` | `datetime2(0)` NOT NULL | |
| `CompletedAtUtc` | `datetime2(0)` NULL | |

Index: `IX_UploadSessions_State_CreatedAtUtc` for the 24-hour sweeper.

### 4.7 Relationships

```
Roles 1 ── * Users
Users 1 ── * Courses (CreatedBy)
Categories 1 ── * Courses
Courses 1 ── * Videos
Videos 1 ── * UploadSessions
```

### 4.8 Explicitly **not** in the P0 schema

These exist in the prototypes and will need tables later: `Products`, `Orders`, `OrderItems`, `Entitlements`, `Payments`, `LiveBatches`, `Bookings`, `Tickets`, `AuditLogs`, `Addresses`, `RefreshTokens` (P0 uses short-lived access JWT + re-login). Do not create them now.

---

## 5. API specification

Base URL: `https://{app-service}/api`  
JSON, camelCase.  
Errors: `{ "code": "VIDEO_NOT_FOUND", "message": "…" }` with the HTTP status below.

**Auth schemes**

- `None` — public
- `Admin` — JWT `role=Admin`
- `Customer` — JWT `role=Customer`
- `AdminOrCustomer` — either

### 5.1 Auth

#### `POST /api/auth/admin/login`

- **Purpose:** Admin dashboard sign-in. The prototype has **no login screen** (it assumes “Vivi Priya · Owner”). We add this because the requested flow starts with Admin Login.
- **Auth:** None
- **Request:** `{ "email": "vivi@vivicrochet.in", "password": "…" }`
- **Response 200:** `{ "accessToken": "…", "expiresAtUtc": "…", "user": { "id", "displayName", "email", "role": "Admin" } }`
- **Errors:** `400` validation; `401` `INVALID_CREDENTIALS`; `429` `RATE_LIMITED`

#### `POST /api/auth/mobile/otp/request`

- **Purpose:** Start phone-OTP (matches the app gate). P0 may log the OTP or use a fixed test code if no SMS provider is ready.
- **Auth:** None
- **Request:** `{ "phone": "9876543210" }` — 10-digit Indian mobile
- **Response 200:** `{ "challengeId": "…", "expiresInSeconds": 300 }`
- **Errors:** `400` `INVALID_PHONE`; `429` `RATE_LIMITED`

#### `POST /api/auth/mobile/otp/verify`

- **Purpose:** Create/find customer and issue JWT.
- **Auth:** None
- **Request:** `{ "challengeId": "…", "code": "123456" }`
- **Response 200:** `{ "accessToken": "…", "expiresAtUtc": "…", "user": { "id", "displayName", "phone", "role": "Customer" } }`
- **Errors:** `400` `INVALID_CODE`; `401` `EXPIRED_CHALLENGE`; `429`

#### `GET /api/auth/me`

- **Purpose:** Session bootstrap for both clients.
- **Auth:** Admin or Customer
- **Response 200:** current user profile
- **Errors:** `401`

### 5.2 Categories

#### `GET /api/categories`

- **Purpose:** Learn tabs / filters.
- **Auth:** None (published catalogue)
- **Response 200:** `{ "items": [ { "id", "slug", "name", "sortOrder" } ] }`

#### `POST /api/categories` · `PUT /api/categories/{id}` · `DELETE /api/categories/{id}`

- **Purpose:** Admin-managed Learn groupings. Keep these thin; seed is enough for launch.
- **Auth:** Admin
- **Request:** `{ "name", "slug", "sortOrder", "isActive" }`
- **Errors:** `400`; `404`; `409` slug in use; `409` `CATEGORY_IN_USE` on delete

### 5.3 Courses

#### `GET /api/courses`

- **Purpose:** Mobile catalogue — **published** courses only, with lesson counts.
- **Auth:** None
- **Query:** `categoryId?`
- **Response 200:** `{ "items": [ { "id", "slug", "name", "type", "level", "about", "priceInr", "mrpInr", "accessDays", "heroUrl", "videoCount", "durationLabel", "category" } ] }`

#### `GET /api/admin/courses`

- **Purpose:** Admin table (draft + published).
- **Auth:** Admin
- **Response 200:** includes `status`, `updatedAtUtc`, `studentCount` (0 in P0)

#### `GET /api/courses/{id}`

- **Purpose:** Course detail + lesson list. Unpublished courses 404 for customers.
- **Auth:** None for published; Admin can see drafts
- **Response 200:** course + `lessons[]` (`id`, `title`, `durationSeconds`, `isFreePreview`, `sortOrder`, `status` if admin)

#### `POST /api/admin/courses`

- **Purpose:** “New course” panel.
- **Auth:** Admin
- **Request:** `{ "name", "categoryId", "type", "level", "about", "priceInr", "mrpInr", "accessDays", "renewalDiscountPercent", "languages", "status" }` — `status` defaults `Draft`
- **Response 201:** created course
- **Errors:** `400`; `404` category

#### `PUT /api/admin/courses/{id}`

- **Purpose:** Edit panel.
- **Auth:** Admin
- **Request:** same fields as create
- **Errors:** `404`; `400`

#### `DELETE /api/admin/courses/{id}`

- **Purpose:** Soft-delete course and its videos. Prototype warns if students exist (0 in P0).
- **Auth:** Admin
- **Response 204**
- **Errors:** `404`; `409` if any video `Uploading`

#### `POST /api/admin/courses/{id}/publish`  
#### `POST /api/admin/courses/{id}/unpublish`

- **Purpose:** Match `DRAFT` / `PUBLISHED` chips.
- **Auth:** Admin
- **Publish rules:** course must have ≥1 `Published` or `Draft` video; publishing a course does **not** auto-publish uploading/failed videos.
- **Errors:** `409` `NOTHING_TO_PUBLISH`

### 5.4 Videos / lessons

#### `GET /api/admin/courses/{courseId}/videos`

- **Purpose:** Lessons list in admin.
- **Auth:** Admin

#### `POST /api/videos/upload-url`

- **Purpose:** Mint a **write-only** SAS. Creates the `Videos` row as `Uploading` and an `UploadSessions` row.
- **Auth:** Admin
- **Request:** `{ "courseId", "fileName", "contentType", "sizeBytes", "contentSha256?" }`
- **Response 200:** `{ "videoId", "uploadId", "blobUrl", "sasToken", "expiresAtUtc", "blobName", "maxSizeBytes" }`  
  Client uploads to `blobUrl` (already includes SAS) with `x-ms-blob-type: BlockBlob`.
- **Errors:** `400` `INVALID_FILE_TYPE` / `FILE_TOO_LARGE`; `404` course; `409` `DUPLICATE_FILE` (same SHA-256 on a non-deleted video in that course); `429`

#### `POST /api/videos/{id}/complete-upload`

- **Purpose:** After the browser PUT succeeds, confirm the blob exists and flip status `Uploading` → `Draft`.
- **Auth:** Admin
- **Request:** `{ "uploadId" }`
- **Response 200:** video metadata
- **Errors:** `404`; `409` `BLOB_MISSING` / `SIZE_MISMATCH`; `409` `UPLOAD_EXPIRED`

#### `POST /api/videos`

- **Purpose:** Save lesson metadata (title, duration, description, free preview, hook/yarn). Called after complete-upload or on edit.
- **Auth:** Admin
- **Request:** `{ "videoId", "title", "description", "durationSeconds", "isFreePreview", "hasPatternPdf", "hookNote", "yarnNote", "sortOrder?" }`
- **Response 200:** video
- **Errors:** `400`; `404`; `409` if still `Uploading`

#### `PUT /api/videos/{id}`

- **Purpose:** Edit lesson fields. Does not replace the blob (use a new upload-url + complete for replacement).
- **Auth:** Admin

#### `DELETE /api/videos/{id}`

- **Purpose:** Soft-delete, then queue blob delete. Remaining lessons renumber (prototype behaviour).
- **Auth:** Admin
- **Response 204**
- **Errors:** `404`; `409` if `Uploading`

#### `POST /api/videos/{id}/publish`  
#### `POST /api/videos/{id}/unpublish`

- **Purpose:** Lesson-level publish. Only `Draft` videos can publish. Unpublished videos disappear from the customer API.
- **Auth:** Admin
- **Errors:** `409` `NOT_DRAFT` / `UPLOAD_INCOMPLETE`

#### `GET /api/videos/{id}/stream-url`

- **Purpose:** Short-lived **read** SAS for the player. Matches admin “Signed, expiring stream URLs · 15 MIN”.
- **Auth:** None if `isFreePreview` and course+video published; otherwise **Customer**
- **Response 200:** `{ "url", "expiresAtUtc", "contentType", "watermarkLabel" }`  
  `watermarkLabel` is the customer display name or masked phone (client overlay in P0).
- **Errors:** `401`; `403` `LOGIN_REQUIRED`; `404` if unpublished

P0 playback rule (explicit simplification): any authenticated customer may stream any **published** non-preview lesson. Paid entitlements from the prototype are P1.

### 5.5 Health

#### `GET /api/health`

- **Auth:** None  
- **Response 200:** `{ "status": "ok" }` — used by App Service / deploy checks.

---

## 6. Azure architecture (MVP)

One resource group, one region (recommend **Central India** or **South India** — customers and Vivi are India-based).

| Resource | Name sketch | Used for |
| --- | --- | --- |
| Resource Group | `rg-vivi-prod` | All MVP resources |
| App Service Plan | `plan-vivi` (Linux B1) | Hosts the API; enough for one developer + early traffic |
| App Service | `app-vivi-api` | ASP.NET Core API |
| Static Web Apps **or** second App Service | `stapp-vivi-admin` | Admin SPA. Static Web Apps is cheaper and enough. |
| Azure SQL Server + Database | `sql-vivi` / `sqldb-vivi` (Basic or S0, 32 GB) | All tables above |
| Storage Account | `stvivi{unique}` (LRS, Hot) | Blobs. **Disable public blob access** (`AllowBlobPublicAccess=false`) |
| Blob container `videos` | private | Lesson files |
| Blob container `images` | private | Course heroes / thumbnails (SAS or API proxy) |
| Blob container `uploads-temp` | private | Unused if we write straight to `videos/` with session rows; keep only if we later stage |
| Application Insights | `appi-vivi` | Request traces, exceptions, dependency calls to SQL/Blob |
| Key Vault | `kv-vivi` *(create, wire later)* | Storage key, SQL admin password, JWT signing key. **P0 may use App Service application settings** with Key Vault references when the vault exists. Do not put secrets in git. |

**Not for P0:** Azure Media Services / CDN / Front Door / API Management / AKS / Service Bus / Redis / Azure AD B2C.

**Deployment:** GitHub Actions or local `az webapp deploy`. Admin: Static Web Apps GitHub integration or `swa deploy`.

**Config style:** `IOptions<BlobOptions>` etc., values from environment variables (`Blob__AccountUrl`, `Jwt__SigningKey`, `ConnectionStrings__Vivi`). Same shape works with Key Vault references later (`@Microsoft.KeyVault(SecretUri=…)`).

---

## 7. Video upload architecture

Exact P0 sequence:

1. **Admin selects a video** in the lesson panel (file picker, not a typed filename like the prototype). Client checks extension, MIME, and size locally.
2. **Dashboard calls** `POST /api/videos/upload-url` with `courseId`, `fileName`, `contentType`, `sizeBytes`.
3. **API authorizes** Admin JWT.
4. **API validates** type/size, optionally SHA-256 duplicate, creates `Videos` (`Uploading`) + `UploadSessions`, generates a **write-only, 30-minute** SAS for that exact blob name.
5. **Dashboard uploads directly** to Blob (`PUT` Block Blob, or chunked blocks for files > 100 MB). UI shows percent from `xhr.upload.onprogress`.
6. **Upload completes.** Client calls `POST /api/videos/{id}/complete-upload`. API `ExistsAsync` + reads properties; size must match; status → `Draft`; session → `Completed`.
7. **Metadata is saved** via `POST /api/videos` (title, mm:ss, description, free preview).
8. **Video is Draft.** It does not appear on the mobile catalogue.
9. **Admin publishes** the video (`POST /api/videos/{id}/publish`) and, if needed, the course.
10. **App retrieves** `GET /api/courses` / `GET /api/courses/{id}` (published only).
11. **App plays** after `GET /api/videos/{id}/stream-url` (15-minute read SAS). Free preview: no login. Other lessons: customer JWT.

### Failure modes

| Case | Behaviour |
| --- | --- |
| **Failed upload** (network, 403 SAS expired, 413) | Video stays `Uploading`/`Failed`. Admin sees Retry. Retry requests a **new** SAS for the same `blobName` (or a new name if the old session expired). Old session marked `Failed`. |
| **Interrupted / tab closed** | Session remains `Pending`. A hosted sweeper (every hour) marks sessions older than 24h as `Abandoned`, sets video `Failed`, deletes the incomplete blob if present. |
| **Duplicate upload** | If `contentSha256` matches another non-deleted video in the same course → `409 DUPLICATE_FILE`. Admin can still upload if they omit the hash (prototype does not hash; keep this as a warning, not a hard block, if hash is absent). |
| **Deleted video** | Soft-delete row, unpublish, delete blob, renumber `SortOrder`. Stream-url 404s immediately. |
| **Publish while still uploading** | `409 UPLOAD_INCOMPLETE`. |
| **Course deleted** | Soft-delete course + videos; blob purge via same sweeper. |
| **SAS expired mid-file** | Client aborts, requests a new upload-url (new session). For large files, P0 uses **block upload** so completed blocks can be committed after a refreshed SAS to the same blob (Azure block IDs). If refresh is too messy in week 1, cap “reliable progress” to single-PUT under 256 MB and block-upload above that as a follow-on the same week. |

**Progress:** do not fake it. Use the browser’s upload progress against Blob, not against the API.

**Transcoding:** the admin prototype text says “Uploaded video is transcoded”. **P0 serves the uploaded MP4 as-is.** Adaptive bitrate / AMS is P2.

---

## 8. Security

| Topic | P0 decision |
| --- | --- |
| **Authentication** | Admin: email + password → JWT (8h). Customer: phone OTP → JWT (30d, matches 30-day mental model; can shorten). Signing key from config, 256-bit+. |
| **Authorization** | `[Authorize(Roles = "Admin")]` on all write/SAS endpoints. Stream-url checks preview **or** customer role. |
| **Admin roles** | One role: `Admin` (“Owner · full access” in the prototype). No editor/viewer split in P0. |
| **SAS expiration** | Upload write SAS: **30 minutes**. Playback read SAS: **15 minutes** (design). Upload SAS permissions: `Create` + `Write` only, **no Read/List/Delete**. Playback: `Read` only. |
| **Blob access** | Containers private. No `$web` public videos. No storage account key in admin or mobile bundles. |
| **API validation** | FluentValidation or data annotations on every body. Reject unknown fields that change security posture. |
| **File type** | Allow `video/mp4`, `video/quicktime`, `video/webm`. Extension must match. Reject `mkv`/`exe`/double extensions. |
| **File size** | Default max **2 GB** (`Blob__MaxUploadBytes`). Enforced on upload-url **and** on complete-upload via blob properties. |
| **CORS** | Storage CORS: only the admin origin, methods `PUT, OPTIONS`, headers `Content-Type, x-ms-blob-type, x-ms-blob-content-type`. API CORS: admin origin + Expo web origin if used. |
| **Secrets** | Never in frontend. Never in `appsettings.json` committed. User secrets locally; App Settings / Key Vault in Azure. |
| **SQL security** | Parameterized EF only. SQL user with `db_datareader/db_datawriter` (not `db_owner`) for the app. Firewall: Azure services + developer IP. |
| **Rate limiting** | `5 / 15 min` per IP on admin login and OTP request; `20 / hour` on upload-url per admin user. |
| **OTP** | Hash stored codes; 5-minute expiry; 5 attempts. Production SMS is a blocker (see §13). |
| **Watermark / no download** | Client overlay of name (prototype already animates this). Disable player download UI. Not DRM. Design is honest: “No system can fully stop screen recording.” |
| **HTTPS** | App Service TLS 1.2+. HSTS on API. |

---

## 9. MVP scope

### P0 — must work on 15 September

Absolute vertical slice. If it is not needed for “admin uploads a lesson, customer plays it”, it is not P0.

**Backend + Azure**

- Resource group, App Service, SQL, Storage, Insights
- Admin JWT login (seed one admin)
- Mobile OTP login (real SMS **or** documented test code)
- Courses CRUD + publish/unpublish
- Categories read (+ admin write if time)
- SAS upload, complete-upload, draft metadata, publish/unpublish, delete
- Published catalogue + stream-url
- Health endpoint, basic logging, CORS, size/type checks, upload sweeper

**Admin dashboard** (subset of “Courses & videos” + a new Login)

- Login (email/password)
- Courses table: name, type, price, video count, status, Edit / Videos / Delete
- New course + edit panel (fields from the prototype)
- Lessons list, add/edit/delete, reorder
- Real file picker + progress bar + retry
- Publish / unpublish course and lesson
- Signed-out state

**Mobile app** (subset of Learn & Loop + player + account)

- Splash / home teaser that deep-links to Learn (optional thin Home)
- Learn: Courses / Viral tabs from `Categories`
- Course detail: about, lesson list, free preview mark
- Phone OTP sheet (reuse prototype copy)
- Player: play/pause, scrub, duration, lesson list, moving name overlay
- My VIVI: signed-in name/phone + log out
- Tab bar: **Learn** and **My VIVI** only (Home/Shop/Live hidden or stubbed)

**Explicit P0 non-goals:** shop, cart, PIN shipping, payments, entitlements enforcement, live booking, production Kanban, tickets, audit log, PDF attach, six audio tracks, transcoding, App Store / Play Store **release review** (internal/TestFlight/APK is success).

### P1 — important, simplify or slip

- Shop browse (static catalogue, no checkout)
- Entitlements + 30-day expiry + renewal at 50%
- Payment gateway (UPI / card) — **external account required**
- WhatsApp / SMS receipts
- Admin Dashboard KPIs (read-only numbers)
- Admin Customers list
- Pattern PDF upload (same SAS pattern, `pdfs` container)
- Lesson reorder persisted
- Store listing assets + TestFlight / Internal testing track
- Admin login screen visual polish to match Modernist
- Course hero image upload

### P2 — post-launch (designed, not built)

- Full shop checkout, PIN shipping table, production pipeline (NEW → DELIVERED), dispatch overrides
- Live batches, capacity, personal 1:1, calendar
- Payments ledger, audit log
- Favourites, tickets, delete-account 30-day hold
- Azure Media Services / CDN / forensic watermark
- Multi-language audio tracks
- Extra admin roles
- App Store + Play production listing
- Key Vault as sole secret store, Front Door, custom domain + email

---

## 10. 15-day development plan

One developer, end-to-end first, polish last. Dates are **Monday 31 August 2026 → Tuesday 15 September 2026**.

| Day | Date | Focus | Done when |
| --- | --- | --- | --- |
| 0 | Mon 31 Aug | This plan; confirm Azure + scope questions | `PROJECT_PLAN.md` agreed |
| 1 | Tue 1 Sep | Azure RG, SQL, Storage (private containers), App Service, Insights; `Vivi.Api` empty + health + EF + seed admin/categories | `GET /api/health` on Azure |
| 2 | Wed 2 Sep | JWT admin login; OTP request/verify (test code if no SMS); Swagger | Can get tokens from HTTP |
| 3 | Thu 3 Sep | Courses CRUD + publish; Videos metadata; upload-url + complete-upload + sweeper | Can PUT a sample MP4 from curl/Postman with SAS |
| 4 | Fri 4 Sep | Stream-url; published vs draft filtering; validation + rate limits | Unpublished video 404s on mobile endpoints |
| 5 | Sat 5 Sep | Admin Vite app: tokens, login, auth store, courses list | Admin logs in against the deployed API |
| 6 | Sun 6 Sep | Admin: new/edit course, lessons, **real SAS upload + progress + retry** | One draft lesson in SQL + blob |
| 7 | Mon 7 Sep | Admin: publish/unpublish/delete; empty/error states | Happy-path admin complete |
| 8 | Tue 8 Sep | Expo app: Learn tabs, course list/detail from API | Device/simulator shows published courses |
| 9 | Wed 9 Sep | OTP login; player + stream-url + watermark overlay | Phone plays a published lesson |
| 10 | Thu 10 Sep | E2E hardening: failed upload, expired SAS, kill-tab, duplicate, delete | Written test notes for each failure case |
| 11 | Fri 11 Sep | CORS, Insights events, seed 1 real course (Basic lesson 1), config cleanup | No secrets in repo |
| 12 | Sat 12 Sep | Bug bash on the three surfaces; fix only blockers | P0 checklist green |
| 13 | Sun 13 Sep | Production deploy freeze; backup SQL; runbook (how to upload, how to reset admin) | URLs written down |
| 14 | Mon 14 Sep | Vivi UAT: upload a real class, watch on a phone | Sign-off or small fixes |
| 15 | Tue 15 Sep | Buffer / launch. Do **not** start Shop or Live this day | P0 live |

If a day slips, **cut P1-looking admin chrome first**, never the SAS → blob → publish → play path.

---

## 11. Development dependencies

Work that **blocks** later work:

```
Azure subscription + region chosen
    └── Resource Group + SQL + Storage + App Service
            └── API project + connection strings + migrations
                    ├── Admin JWT  ──────────────┐
                    ├── OTP (or test code)       ├── Admin SPA (needs CORS + tokens)
                    └── SAS upload/complete      │
                            └── Stream-url       └── Expo app (needs published data)
                                    └── Player
```

- **Cannot** build a real upload UI before `upload-url` + CORS on the storage account exist.
- **Cannot** build a real player before stream-url + one published blob exist.
- **Cannot** do production SMS until a provider account exists (parallel; not on the critical path if test OTP is accepted).
- Admin SPA and Expo can be **scaffolded** in parallel with days 1–2 (empty screens), but they stay mocked until day 3–4 APIs exist.
- Design pack is **not** a blocker; it is already complete.

---

## 12. Risks (what can miss 15 September)

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| **Scope explosion** | The prototypes are a full commerce + education company. Building all of it is ~2–4 months. | Freeze P0 as this document. New screens go to P1. |
| **Azure access delay** | No subscription / credit card / tenant permissions on day 1. | Use local SQL + Azurite on day 1 if cloud lags; do not wait idle. |
| **Large-file upload** | Multi-GB MP4s, phone hotspots, SAS expiry. | 2 GB cap; 30-min SAS; block upload; sweeper; retry. Test with a 200 MB file by day 10. |
| **Store review** | Apple/Google review often takes days and rejects first submissions. | P0 success = Expo build on a device / TestFlight internal. Store listing is P1. |
| **OTP / SMS** | India DLT templates, sender IDs, and vendor signup take time. | Ship with a **fixed test OTP** behind a config flag; swap MSG91/ACS later. |
| **Payments / entitlements** | Gateway KYC is slower than two weeks. | P0: login = can watch published lessons. |
| **Watermark / transcoding** | AMS is a product by itself. | Client overlay only. |
| **Single developer illness / blocked days** | 16 calendar days, no bench. | Days 13–15 are buffer. Cut admin polish before cutting playback. |
| **CORS / mixed-content** | First-time Blob SAS from a browser is a common 2-day trap. | Day 3: prove one browser PUT before writing more UI. |
| **Video format** | Safari/iOS hates some encodings. | Require H.264 + AAC `.mp4` in the admin helper text. |
| **Prototype ≠ login** | Admin has no login screen; inventing a bad one wastes time. | Simplest email/password page; style it with existing tokens. |

---

## 13. Questions / blockers before implementation

These need a human answer. Until they are settled, implementation should not start.

1. **Confirm P0 cut.** Is it acceptable that Shop, Live, Payments, Production, and paid entitlements are **not** in the 15 September build, even though they are fully designed?
2. **Azure.** Is there an active Azure subscription, preferred region, and permission to create the resources in §6?
3. **Admin identity.** Email for the seed owner account? (Prototype name: *Vivi Priya*.) Password will be set via secret, not committed.
4. **Customer OTP.** Real SMS by 15 Sep (which vendor?) or **test code** (e.g. `123456`) for launch?
5. **Playback rights.** Confirm P0 rule: any logged-in customer can play all **published** lessons (no ₹299 entitlement check yet).
6. **Mobile distribution.** Expo internal build / APK / TestFlight only, or is a store listing mandatory on 15 Sep?
7. **Max video size** and **allowed formats**. Proposed: 2 GB, `mp4` / `mov` / `webm`, recommend H.264.
8. **Custom domain** for API and admin (`api.vivicrochet.in`, `admin.vivicrochet.in`) — needed for launch or Azure default hostnames OK?
9. **Existing videos.** Are there real lesson files to seed, or only the design’s placeholder titles?

---

## Appendix A — Design inventory (do not re-invent)

### A.1 Mobile screens (from `screenLabel`)

Home, Shop, Product, Cart, Checkout, Payment, Confirmation, Order tracking, Learn & Loop, Class detail, Terms & conditions, Video player, Renewal, Live sessions, My VIVI, Edit profile, Settings, Delete account, Help & support, Legal (T&C / Privacy), Raise a ticket, About VIVI. Plus a **phone-OTP modal** (not a standalone route).

**Tab bar:** Home · Shop · Learn · Live · My VIVI.

**Auth:** phone OTP (10 digits, 6-box code, ≥4 to submit in the prototype) **only when needed** (checkout, course pay, live book, account). Google button is present in the OTP sheet as a prototype extra — **do not implement Google login in P0**. Phone number is the login and is not editable on the profile.

### A.2 Mobile user flows (designed)

- Browse shop → product → add to cart → PIN shipping → OTP → UPI/card/netbanking → order `#1004` → track NEW…DELIVERED
- Learn → course → free preview → T&C → pay ₹299 → entitlement 30 days → player → renew at 50%
- Live → weekday calendar → morning/evening/1:1 → T&C → pay → WhatsApp link later
- My VIVI → profile / settings / tickets / legal / about / logout / delete account (30-day reactivation)

### A.3 Video-related behaviour (designed)

- Courses: Basic (7), Intermediate (10), Advanced (10), Full bundle (27), Viral projects (Rose Bag 6, etc.)
- Lesson fields: title, duration `mm:ss`, description, free preview (first lesson), optional pattern PDF, hook/yarn notes
- Player: play/pause, progress, language chip (6 languages), mark done, lesson list states (completed / playing / not started)
- Protection copy: login required, entitlement re-check, 15-min signed URLs, moving watermark, download disabled, storage URLs never exposed
- Nothing downloadable; stream licence, not file sale

### A.4 Admin sections (sidebar)

Dashboard · Production · **Courses & videos** · Customers · Live classes · Payments · Audit log. User: *Vivi Priya · Owner · full access*. Global search is a **non-functional placeholder**.

### A.5 Admin course / video forms (implement these fields)

**Course:** name, type (`Course` / `Viral project` / `Bundle`), level, about, price ₹, strike-through ₹, access days, renewal discount %, audio languages (Tamil, English, Hindi, Malayalam, Telugu, Kannada), status Draft/Published, delete with warning.

**Video:** title, duration mm:ss, **video file**, description, free preview toggle, attach pattern PDF toggle, delete with renumber warning.

**Add-videos wizard:** existing course vs new course → pick course → lesson form.

### A.6 Admin production (P1/P2 only)

Stages: `NEW` → `IN QUEUE` → `MAKING` → `READY` → `DISPATCHED` → `DELIVERED`. Kanban / list / thumbnails. Dispatch override + reason → audit.

### A.7 Prototype data to reuse as seed copy (not as a database dump)

Basic 7 lesson titles, Rose Bag 6 titles, product names/prices, PIN table (`641001` Coimbatore ₹60, etc.) — useful later for shop.

---

## Appendix B — Recommended technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| API | **ASP.NET Core, .NET 10 LTS**, EF Core, Azure SQL | Requested; one process; familiar JWT + Blob SDK |
| Admin | **Vite + React + TypeScript** | Prototype is already React-shaped; fastest to match Modernist HTML |
| Mobile | **Expo SDK (React Native) + TypeScript + Expo Router + `expo-video`** | One language with the admin; iOS+Android; no native IDE tax on day 1 |
| Storage | Azure Blob + user-delegation or account SAS minted **only on the server** | Requested; no video through the API |
| Auth | JWT (admin password, customer OTP) | Requested; matches both clients |
| Hosting | App Service + Static Web Apps | Requested; no K8s |
| Observability | Application Insights SDK | Requested; “ready” = wired `AddApplicationInsightsTelemetry` |

Boring on purpose.

---

## Appendix C — P0 acceptance checklist

- [ ] Admin can log in without a storage key in the browser bundle
- [ ] Admin can create a course as Draft
- [ ] Admin can upload an MP4 with a visible progress bar; file never hits `/api` as a body
- [ ] Failed / closed-tab upload can be retried
- [ ] Completed upload is Draft until Publish
- [ ] Unpublished lessons are invisible to the app catalogue
- [ ] Published free-preview plays without login
- [ ] Published non-preview plays only with a customer JWT
- [ ] Stream URL dies after ~15 minutes and the app can request a new one
- [ ] Soft-deleted lesson 404s and the blob is removed
- [ ] API + admin + Insights live on Azure
- [ ] At least one real (or representative) lesson plays on a physical phone
