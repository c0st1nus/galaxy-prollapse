# Refined Implementation Plan: New Feature Set

## 1. Scope
This plan covers these features:
- camera before/after uploads for cleaner tasks
- AI-powered work quality rating from photos
- geofencing for start/complete actions
- adaptive checklists by room type + cleaning standard
- offline queue for task actions and checklist updates
- background sync with idempotency and retry logic
- analytics for supervisors and admins (quality, geofence, sync health)

The plan is aligned to current code and schema in:
- `backend/src/database/schema.ts`
- `backend/src/routes/cleaner.ts`
- `backend/src/routes/supervisor.ts`
- `backend/src/routes/admin.ts`
- `web/src/routes/app/[role]/+page.svelte`
- `web/src/lib/api.ts`

## 1.1 Feature Definitions (What We Are Building)
### Feature A: Before/After Photo Evidence
Purpose:
- capture visual proof of cleaning work at task start and completion

Cleaner flow:
1. open assigned task
2. capture/upload `photo_before` when starting
3. capture/upload `photo_after` when completing

Expected result:
- each task can store before/after evidence photos
- photos continue using MinIO-backed URLs from current backend

### Feature B: AI Work Quality Rating
Purpose:
- generate automated first-pass quality feedback from before/after photos

Inputs:
- `photo_before`, `photo_after`
- room type (`office|bathroom|corridor`)
- object cleaning standard (`appa_*` or `issa_cims`)

Outputs:
- `ai_score` (1-5)
- `ai_feedback`
- `issues[]`, confidence, and raw model metadata in `ai_raw`
- `ai_status` (`not_requested|pending|succeeded|failed`)

Business role:
- AI is advisory; supervisor inspection remains authoritative

### Feature C: Geofencing for Task Start/Complete
Purpose:
- prevent off-site task start/complete abuse

Rule:
- if object coordinates are configured, allow start/complete only within `geofence_radius_meters`
- if object coordinates are not configured yet, do not block action

Audit:
- store check-in and check-out coordinates on each task
- log violations for supervisor/admin analytics

### Feature D: Adaptive Checklists by Room + Standard
Purpose:
- auto-generate the right checklist for each task context

How:
- checklist templates keyed by `room_type + cleaning_standard`
- task checklist generated per task and tracked independently
- cleaner updates item status/notes during work
- supervisor reviews checklist with inspection

### Feature E: Offline Queue + Background Sync
Purpose:
- allow cleaners to keep working with poor/no connectivity

Offline queue behavior:
- queue task events locally on device (start, checklist updates, complete)
- queue entries include `client_operation_id` (uuid), task id, event type, payload, created time
- preserve operation order by task: start -> checklist updates -> complete

Background sync behavior:
- trigger sync on app resume, connectivity regain, manual sync tap, and periodic timer
- replay queued operations to backend with idempotency keys
- exponential backoff on transient failures
- keep failed operations with actionable error reason

### Feature F: Supervisor/Admin Analytics
Purpose:
- provide operational visibility for quality and sync reliability

Supervisor analytics:
- AI vs inspection score gap
- geofence violation rate by cleaner/object
- checklist completion rates and overdue inspections

Admin analytics:
- sync success rate, retry rate, oldest pending operation age
- AI model usage mix (`nano/mini/5.2`) and estimated token cost
- per-object and per-company quality trends over time

## 1.2 MVP Outcomes
By end of implementation:
- cleaners can perform full task flow online or offline
- queued offline actions sync safely without duplication
- supervisors/admins can monitor sync health and quality trends
- existing inspection flow (`checklists` table) stays intact

## 2. OpenAI Model Decision (Latest Docs, Feb 15, 2026)
### Source-validated notes
- Responses API is recommended for new projects:  
  https://developers.openai.com/api/docs/guides/migrate-to-responses/
- `gpt-5-nano` is the fastest/cheapest GPT-5 variant and suited for simple classification-style workloads:  
  https://developers.openai.com/api/docs/models/gpt-5-nano
- `gpt-5-mini` is the next cost-efficient quality tier:  
  https://developers.openai.com/api/docs/models/gpt-5-mini
- pricing confirms `gpt-5-nano` is lowest cost in GPT-5 family, then `gpt-5-mini`, then `gpt-5.2`:  
  https://developers.openai.com/api/docs/pricing
- `gpt-5.2-pro` is not appropriate for this synchronous operational flow:  
  https://developers.openai.com/api/docs/models/gpt-5.2-pro

### Final model policy
- default: `gpt-5-nano`
- escalation: `gpt-5-mini`
- manual dispute override: `gpt-5.2` (admin-triggered only)
- never use for this flow: `gpt-5.2-pro`

## 3. API Integration Plan (OpenAI + Idempotency)
### 3.1 Backend dependency and env
- add dependency: `openai`
- add env:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL_PRIMARY=gpt-5-nano`
  - `OPENAI_MODEL_ESCALATION=gpt-5-mini`
  - `OPENAI_MODEL_MANUAL_OVERRIDE=gpt-5.2`
  - `OPENAI_MIN_CONFIDENCE=0.65`
  - `OPENAI_TIMEOUT_MS=15000`

### 3.2 AI service
- new service: `backend/src/services/ai-rating.ts`
- use Responses API with strict JSON output schema:
  - `score`, `feedback`, `issues`, `confidence`
- low reasoning effort/none to minimize cost and latency

### 3.3 Idempotent processing requirement
- all state-changing cleaner operations accept `client_operation_id`
- backend deduplicates by `client_operation_id` and stores outcome
- duplicate replays return success with `applied=false` (already processed)

## 4. Backend Route Plan
All additions preserve current route prefixes and role boundaries.

### 4.1 Extend existing cleaner routes
- `PATCH /tasks/:id/start`
  - keep `photo_before`
  - add `latitude`, `longitude`, `client_operation_id`
  - geofence validation + idempotent handling
- `PATCH /tasks/:id/complete`
  - keep `photo_after`
  - add `latitude`, `longitude`, `client_operation_id`
  - geofence validation + enqueue AI rating + idempotent handling

### 4.2 New cleaner routes
- `GET /tasks/:id/checklist`
- `PATCH /tasks/:id/checklist`
  - accepts checklist mutations plus `client_operation_id`
- `GET /tasks/:id/ai-rating`

### 4.3 New sync routes
- `POST /sync/operations/batch` (cleaner)
  - replay queued operations in one request
  - per-operation status: `applied|duplicate|rejected|retryable_error`
- `GET /sync/status` (cleaner)
  - server-side view of last processed operation and pending issues

### 4.4 Supervisor/admin quality routes
- `GET /inspections/:task_id/ai-rating`
- `POST /inspections/:task_id/ai-rate` (manual rerun)

### 4.5 Admin config routes
- `PATCH /admin/objects/:id/location`
- `PATCH /admin/objects/:id/cleaning-standard`
- `GET /admin/checklist-templates`
- `POST /admin/checklist-templates`
- `PATCH /admin/checklist-templates/:id`

### 4.6 Analytics routes
- supervisor/admin:
  - `GET /inspections/analytics/quality`
  - `GET /inspections/analytics/geofence`
  - `GET /inspections/analytics/sync`
- admin:
  - `GET /admin/analytics/quality`
  - `GET /admin/analytics/sync`
  - `GET /admin/analytics/ai-cost`

## 5. Frontend Route Plan (CSR + Capacitor-safe)
Current UI is centralized in `web/src/routes/app/[role]/+page.svelte`.

### Option A (minimum disruption, first release)
- keep current role routes:
  - `/app/admin`
  - `/app/supervisor`
  - `/app/cleaner`
  - `/app/client`
- add sections/components:
  - cleaner: offline queue status, sync control, conflict/error panel
  - supervisor: quality/geofence/sync analytics cards
  - admin: sync reliability + AI cost analytics + trend charts

### Option B (after stabilization)
- `/app/cleaner/tasks`
- `/app/cleaner/sync`
- `/app/supervisor/analytics`
- `/app/admin/analytics/quality`
- `/app/admin/analytics/sync`
- `/app/admin/analytics/ai-cost`

## 6. Planned Data Schema (Conflict-Safe)
No destructive changes to existing tables.

### 6.1 Alter existing tables
#### `objects`
- `latitude numeric(10,8)` nullable
- `longitude numeric(11,8)` nullable
- `geofence_radius_meters integer not null default 100`
- `cleaning_standard text not null default 'appa_2'`

#### `tasks`
- `checkin_latitude numeric(10,8)` nullable
- `checkin_longitude numeric(11,8)` nullable
- `checkout_latitude numeric(10,8)` nullable
- `checkout_longitude numeric(11,8)` nullable
- `ai_status text not null default 'not_requested'`
- `ai_model text` nullable
- `ai_score integer` nullable
- `ai_feedback text` nullable
- `ai_raw jsonb` nullable
- `ai_rated_at timestamp` nullable

### 6.2 New tables
#### `checklist_templates`
- `id serial pk`
- `room_type text not null`
- `cleaning_standard text not null`
- `version integer not null default 1`
- `items jsonb not null`
- `created_at timestamp default now()`
- `updated_at timestamp default now()`
- unique `(room_type, cleaning_standard, version)`

#### `task_checklists`
- `id serial pk`
- `task_id integer not null unique references tasks(id) on delete cascade`
- `template_id integer references checklist_templates(id)`
- `items jsonb not null`
- `completion_percent integer not null default 0`
- `generated_at timestamp default now()`
- `updated_at timestamp default now()`

#### `sync_operations`
- `id serial pk`
- `client_operation_id text not null unique`
- `cleaner_id integer not null references users(id) on delete cascade`
- `task_id integer not null references tasks(id) on delete cascade`
- `operation_type text not null`
- `payload_hash text`
- `status text not null` (`applied|duplicate|rejected|retryable_error`)
- `error_code text`
- `error_message text`
- `created_at timestamp default now()`
- `processed_at timestamp`

#### `task_events`
- `id serial pk`
- `task_id integer not null references tasks(id) on delete cascade`
- `actor_id integer references users(id) on delete set null`
- `event_type text not null`
- `event_time timestamp not null default now()`
- `metadata jsonb`

#### `geofence_violations`
- `id serial pk`
- `task_id integer not null references tasks(id) on delete cascade`
- `cleaner_id integer not null references users(id) on delete cascade`
- `phase text not null` (`start|complete`)
- `distance_meters numeric(10,2) not null`
- `allowed_radius_meters integer not null`
- `latitude numeric(10,8)`
- `longitude numeric(11,8)`
- `created_at timestamp default now()`

### 6.3 Compatibility notes
- keep existing `checklists` table unchanged (unique `task_id` inspection record)
- existing APIs remain valid; new features are additive

## 7. Background Sync Design
### 7.1 Local queue model (frontend)
- queue storage: IndexedDB (web) + Capacitor persistent storage metadata
- each queued item:
  - `client_operation_id`
  - `task_id`
  - `operation_type`
  - `payload`
  - attachment references (photo path/file ref)
  - `attempt_count`, `next_retry_at`, `last_error`
  - `status` (`pending|syncing|failed|done`)

### 7.2 Sync triggers
- app startup/resume
- network reconnect event
- periodic timer while app is active
- manual "Sync now" action

### 7.3 Replay and conflict handling
- process operations FIFO per task
- send batched operations to `/sync/operations/batch`
- use backend idempotency (`client_operation_id`)
- if server returns domain conflict (for example complete before start):
  - mark item `failed`
  - present remediation action in cleaner UI

### 7.4 Retry policy
- retryable errors only (timeouts/5xx/network)
- exponential backoff with max attempts
- preserve terminal failures for manual resolution

## 8. Analytics Design (Supervisor/Admin)
### 8.1 Core metrics
- quality:
  - avg AI score by object/cleaner/date
  - AI vs supervisor score delta
  - disputed task rate
- geofence:
  - violation count/rate by cleaner/object
  - median over-distance by phase
- sync:
  - sync success rate
  - duplicate replay rate
  - retry rate
  - oldest pending operation age
  - failed operation backlog
- cost:
  - model usage count by model
  - estimated token and cost totals by period

### 8.2 Data source
- derive analytics from `tasks`, `checklists`, `sync_operations`, `task_events`, `geofence_violations`
- use pre-aggregated SQL views/materialized views if query load grows

## 9. Development Sequence
1. Add schema migrations and Drizzle schema updates.
2. Implement idempotency store and batch sync route.
3. Add geofencing + violation logging.
4. Add adaptive checklist templates and task checklist lifecycle.
5. Implement AI rating service (`nano` default, `mini` escalation, `5.2` manual override).
6. Extend cleaner/supervisor/admin API routes.
7. Implement frontend offline queue and background sync manager.
8. Add supervisor/admin analytics endpoints and dashboard sections.
9. Run end-to-end smoke tests for online and offline flows.

## 10. Validation Checklist
- cleaner can start/complete tasks offline and see queued status
- queued operations sync automatically when connection returns
- replay is idempotent (no duplicate task transitions)
- photo upload recovery works after reconnect
- geofence violations are blocked and logged
- AI rating is generated with model escalation rules
- supervisor/admin analytics reflect real sync and quality activity
- no regressions in current auth and inspection flows

## 11. Out-of-Scope (This Iteration)
- push-based background sync while app is fully terminated (OS-managed workers)
- predictive staffing/forecasting models
- external BI warehouse integration
