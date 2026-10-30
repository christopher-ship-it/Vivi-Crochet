# VIVI – Backend Performance, Monitoring & Scalability Audit

Audit date: 2026-10-30. Method: static read of the repo (backend, mobile, Azure docs, CI). Nothing was load-tested or run against Azure, so impact is reasoned from code, not measured. Paths are relative to `backend/` unless noted.

## 0. What is actually configured (vs. the brief)

| Component | Brief says | Repo reality |
|---|---|---|
| Database | PostgreSQL | **Azure SQL / SQL Server** (`UseSqlServer`, `Program.cs:93`; `AZURE_DEPLOYMENT.md` provisions `sql server`, tier S0). No Npgsql anywhere. |
| Redis | verify | **Not present.** No package, no `IDistributedCache`, no `IMemoryCache`. Only HTTP `Cache-Control` headers on share/blob endpoints. |
| Blob storage | Azure Blob | Yes. SAS is signed locally with the account key (no network call per URL) – fine. |
| Razorpay | yes | Yes, typed `HttpClient`, 30 s timeout (`Program.cs:153`). |
| Hosting | Azure | App Service **B1, single instance** (per `AZURE_DEPLOYMENT.md`; verify in portal). |
| App Insights | to add | **Already wired** (classic SDK `Microsoft.ApplicationInsights.AspNetCore 2.23.0`, `Program.cs:30`); silently disabled when no connection string. |
| OpenTelemetry | to add | Not present. |
| Mobile crash/perf tooling | evaluate | **No Sentry, no Firebase Crashlytics.** Custom telemetry posts to `/api/app-telemetry/issues` (`mobile/src/telemetry/telemetry.ts`). `google-services.json` exists only for push. |

Decision needed from you: the stack is SQL Server, not PostgreSQL. Everything below is written for SQL Server.

## 1. Backend findings (ranked)

### Critical – correctness / money

1. **Amount check fails open** – `VIVI.Infrastructure/Commerce/PaymentFulfillmentService.cs:106-107`. `FetchPaymentAsync` returns `null` on any non-2xx or missing keys (`RazorpayPaymentGateway.cs:69,78`); caller does `if (remote is not null)` so the order/amount/currency checks are skipped. The HMAC signature still holds, but a Razorpay outage or 4xx turns off amount verification. Fix: in `VerifyAndFulfillAsync` treat `null` as retryable failure (503), as the webhook path already does (`:147`).
2. **Mobile retries non-idempotent POSTs** – `mobile/src/api/client.ts:184-202` retries on TIMEOUT / NETWORK_ERROR / HTTP 500 for every method. `POST /api/orders` (`mobile/src/api/orders.ts:140`) has no idempotency key and the backend has none (`OrderCheckoutService`). A slow response → timeout (60 s, `client.ts:97`) → second order and second Razorpay order. Fix: retry only GET, or add an `Idempotency-Key` to order creation.

### High – latency / load on the hot path

3. **`GET /api/live/weeks` does writes and full scans on every anonymous call** – `Controllers/LiveController.cs:44-50`. Each call runs `EnsureSeasonAsync` (2× `CountAsync`, `NormalizeSeatCapacitiesAsync`, `EnsureExtraSlotsAsync` = ~6 queries, `LiveCalendarService.cs:249,742,270`), `ReleaseExpiredReservationsAsync` (query + writes, `LiveBookingService.cs:49`), then loads **every LiveWeek ever created** with Slots and filters in memory (`:50-60`). Same pattern at `LiveController.cs:81-82`. Fix: move season/extras/expiry maintenance to a timer job (the app already has background services); query only the two selectable weeks in SQL.
4. **Shop list is unbounded and over-included** – `Controllers/ProductsController.cs:38-110`. Anonymous, no paging; `Include(Images)+Include(Course)+Include(Variants)` in one query (cartesian row multiplication, `:50-53`); sorts twice (SQL then in memory, `:80-88`); search uses `Contains` on Description and a correlated `Variants.Any`. Fix: split query / projection to DTO, short-TTL cache (see §5), paging.
5. **Course list loads every video row** – `Controllers/CoursesController.cs:58,93`: `Include(Videos)` plus `BundleItems→IncludedCourse→Videos`, only to produce counts/durations for a list (`includeLessons:false`). Project counts in SQL; cache.
6. **N+1 in product detail** – `ProductsController.cs:590` (one `LoadAsync` per essential link) and `:695,702` (one per variant/sibling for Images). Replace with `Include`/`AsSplitQuery`.
7. **Payment work holds a Serializable transaction across Razorpay HTTP calls** – `PaymentFulfillmentService.cs:67` (verify; fetch at `:106`) and `:144/147` (webhook). Range locks on Orders/Payments/Inventory stay held for a network round trip (up to the 30 s timeout), serialising concurrent payments. Fix: call Razorpay first, open the transaction only for the DB writes.
8. **No SQL transient-fault handling, no pooling config** – `Program.cs:80-93`: plain `AddDbContext` + `UseSqlServer`, no `EnableRetryOnFailure`, no `CommandTimeout`, no `AddDbContextPool`. Azure SQL throws transient errors routinely; each becomes a 500 (and the mobile client then retries, see #2). Note: with retry enabled, the manual `BeginTransactionAsync` calls must be wrapped in `CreateExecutionStrategy().ExecuteAsync`.

### Medium

9. **Background jobs: N+1 and multi-instance duplication**
   - `Push/CustomerPushService.cs:176-178`: weekly digest queries tokens once per customer; `LastWeeklyPushAt` is written after sending (`:204`).
   - `Email/ExpiryReminderService.cs:58`: re-queries an enrollment already tracked, plus a notification lookup and a `SaveChanges` per row.
   - `Program.cs:133-135` registers all three hosted services on every instance with no lock. Scaling out to 2 instances → duplicate weekly pushes. Use `sp_getapplock` (already used in `DeliverySequenceService.cs`) or run jobs on one instance / `InternalJobsController` + Azure scheduler.
10. **In-process locks don't span instances** – `LiveBookingService.cs:27,154` (seat gate), `LaunchOfferService.cs:32` (`ConcurrentDictionary<…, SemaphoreSlim>`). The Serializable transaction is the real guard; the semaphores give nothing once you run >1 instance. Keep, but don't rely on them.
11. **Sync-over-async** – `Data/ViviDbContext.cs:26` (`GetAwaiter().GetResult()` inside `SaveChanges`). Only hit by sync callers; also each new customer costs an extra query for the unused-code check. Low frequency, but a thread-pool starvation hazard under load.
12. **Silent truncation, no paging on admin lists** – `AdminOrdersController.cs:53` (`Take(200)`, includes Items→Product, Payments, Customer), `AdminCustomersController.cs:64` (`Take(500)`; search uses `ToLower().Contains` and `Replace("-","")` – unindexable), `OrdersController.cs:94` (customer order history unbounded). Admins can't see older rows today.
13. **Startup does DDL on every boot** – `Program.cs` bootstrappers (`ExecuteSqlRawAsync` `CREATE TABLE IF NOT EXISTS`, …) run on each start/restart/scale-out; concurrent instances can race on DDL. Move to EF migrations (`AutoMigrate=false` in production already).
14. **Per-request customer resolution** – every `/api/me/*` and `/api/orders` call does 2 queries (`CustomerResolver.cs:21-30`). Fine now; cache user→customer id once you have a cache.
15. **Health check is liveness only** – `HealthController.cs` returns `ok` without touching DB/Blob. App Service will keep routing to an instance whose DB connection is dead. Add a readiness check (`SELECT 1`).

### Indexes
`ViviDbContext.cs` is well indexed (FKs, Orders.CustomerId/Status, Payments.ProviderOrderId, Enrollments, Push tokens). No clearly missing index found. The slow queries above are shape problems, not index problems, except the `Contains`/`ToLower()` searches (#4, #12) which no b-tree index fixes.

### Not found
No memory leaks or CPU-heavy request paths spotted. FFmpeg transcode runs in a background service (`Jobs/VideoTranscodeBackgroundService.cs`) – on a B1 plan it competes with the API for CPU; consider a separate worker when upload volume grows. Blob SAS generation is local.

## 2. Monitoring – current state and gaps

Already there: App Insights classic SDK (requests, dependencies incl. SQL & HTTP, exceptions), `ILogger`, custom crash reporting in the app, admin "App Health" page.

Gaps vs. your list:
- No OpenTelemetry; classic AI SDK is in maintenance mode. Recommended path: `Azure.Monitor.OpenTelemetry.AspNetCore` (one call, `UseAzureMonitor()`), plus `OpenTelemetry.Instrumentation.SqlClient` and `.Http`. Gives requests, SQL/HTTP dependency timing, traces, and P50/95/99 in Application Insights without custom code.
- No correlation ID: only ASP.NET `TraceIdentifier`; not returned to the client, not in the error body (`Middleware/ExceptionHandlingMiddleware.cs`). Mobile can't quote an ID when something fails.
- No DB pool metrics or Redis metrics (no Redis exists). Pool use: expose via `SqlClient` EventCounters / `dotnet-counters` → Azure Monitor metrics.
- No background-job failure signal beyond log lines (`LogError` in each service) – add an alert on those.
- Memory/CPU: App Service platform metrics only; no process metrics exported.
- Production log level is `Information` for app code; EF command logging is `Warning` (good, avoids leaking SQL parameters).

### Sensitive-data logging (reviewed)
- Good: OTP service logs phone suffix only (`TwoFactorOtpService.cs:39`); EF parameter logging is off.
- **Logs full email addresses** – `Controllers/AuthController.cs:335,349` (PII).
- **Logs raw Razorpay response bodies** – `RazorpayPaymentGateway.cs:52,115`. Razorpay error bodies hold order/payment identifiers; not credentials, but truncate/redact.
- `ExpoPushService.cs:73` logs push response payloads at Warning.
- App Insights will capture full SQL text and URLs; keep `EnableSensitiveDataLogging` off and add a telemetry initializer/processor to scrub query strings if tokens ever travel in URLs (none found).

## 3. Mobile monitoring

Current: global JS error handler + error boundary → `reportIssue` (max 5/kind/session), pending-crash replay on next launch, video buffering reports (`LessonPlayer.tsx:206`), tap heatmap. Missing: native crashes (JS handler doesn't see them), startup/screen timings, network-failure and timeout reporting, checkout/payment-verification failure events, release/OS breakdown dashboards beyond what `AppIssue` stores, source-mapped stack traces.

### Sentry vs Firebase Crashlytics (for this app)

| | Sentry (`@sentry/react-native`) | Firebase Crashlytics (`@react-native-firebase/crashlytics`) |
|---|---|---|
| Expo support | Official Expo config plugin; works with EAS Update & source maps | Needs `@react-native-firebase/*` + dev client; supported, more native setup |
| JS + native crashes | Yes | Yes |
| Performance | Tracing, app-start, slow/frozen frames, network spans | Separate Firebase Performance Monitoring package |
| Breadcrumbs / API failures | Auto fetch breadcrumbs, custom events | Manual logs only |
| Release health / OTA (`expo-updates`) | Yes, per release/dist | Limited for OTA |
| Backend correlation | `sentry-trace` header can join to server traces | None |
| Cost | Free tier; paid by volume | Free |

Recommendation: **Sentry** – the app ships OTA updates (`eas-update-*.yml`), needs checkout/payment breadcrumbs and source maps, and wants one tool for crashes + performance. Keep the existing `/api/app-telemetry` heatmap/tap pipeline (Sentry doesn't replace it). Both need a new native build (EAS), not just OTA. Sentry's free tier is event-capped; set `tracesSampleRate` ~0.1 and scrub `Authorization`/phone/OTP in `beforeSend`.

## 4. Scale readiness

- Single B1 instance and Azure SQL S0 (10 DTU, per doc) are the first ceilings; the shop/course/live GETs in §1 (#3-5) will burn DTUs before any CPU limit. Check DTU % and App Service CPU in the portal before changing tiers.
- Before adding a second instance: fix #9, #10, #13.
- Cache: no Redis is needed yet. Start with `IMemoryCache` (30–60 s TTL, invalidate on admin writes) on products list, courses list, categories, live weeks, app version. Introduce Azure Cache for Redis only when running >1 instance and you need shared invalidation / rate-limit state (rate limiter is also per-instance, `Program.cs:~230`).

## 5. Suggested order of work

1. Fix #1 and #2 (money/duplicate orders) – small diffs.
2. Fix #3 (live weeks), then #4/#5 (+ memory cache) – biggest load reduction.
3. SQL retry + execution strategy (#8), real readiness check (#15).
4. Monitoring: `UseAzureMonitor()` + SqlClient/Http instrumentation, correlation-ID middleware (response header + error body), redact items in §2, alerts (5xx rate, P95 > threshold, job failures, DTU > 80 %).
5. Sentry in the mobile app + checkout/payment/course/video events.
6. Job locking (#9), then scale out.

## 6. Not verified

No Azure portal access (actual SKUs, App Insights connection string present, DTU/CPU history), no load test, no query plans, mobile not run on device. Impact numbers are therefore unmeasured.
