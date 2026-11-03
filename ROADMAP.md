# PQRS Services Roadmap

This roadmap describes proposed work, not shipped features. Estimates are rough engineering hours for one developer, including focused tests and review; they exclude external approvals, vendor lead times, and unknown migration issues. Work is ordered by dependencies and resident or administrator value. Scope and estimates should be revisited before implementation.

## Current baseline

The application already implements resident requests, invitations and community memberships, reports, notifications, subscription access, and optional reservation and resident-payment modules. Reservations already support common areas, operating hours, duration limits, weekly limits, blocked weekdays and time windows, availability, approval or automatic approval, cancellation, and a database constraint against overlapping active reservations. Dashboards already calculate first-contact and closure times and group requests by status and category. Improvements below extend these capabilities rather than replace them.

The interface is primarily Spanish and the existing reservation timezone is `America/Bogota`; billing uses COP and Wompi. The application is not currently presented as localized for the United States.

## Phase 1: Safe foundations and community access

### 1. Premium features and community access — 24–36 hours

- **Problem:** Communities need to understand which tools they can use, while feature access must remain consistent across the application.
- **Scope:** Define current-plan versus Premium features; extend the existing `TenantFeatureEntitlement` and subscription access checks as needed. Show each `ADMIN` a community-specific list of enabled, setup, suspended, and disabled features. Enforce access in navigation, pages, APIs, and services.
- **Roles:** `SUPER_ADMIN` controls entitlements; `ADMIN` sees availability; `CONSEJO` and `RESIDENTE` use authorized enabled features.
- **Done when:** Tests cover each entitlement state and subscription state, direct API access and manipulated community IDs are rejected, and the administrator sees consistent explanations after reload.
- **Dependencies and decisions:** Decide the plan boundaries, provisioning authority, and interaction with trial, grace, suspension, and cancellation. Premium pricing and billing changes are undecided.

### 2. Reliable test environment and release checks — 12–18 hours

- **Problem:** Changes to shared access and data need reproducible integration verification.
- **Scope:** Restore an isolated PostgreSQL test environment, apply reviewed migrations, run the full suite, and exercise demo reset against a second control community. Review dependency alerts and verify relevant fixes.
- **Roles:** Maintainer and developer; no end-user feature.
- **Done when:** Test guards reject production targets, the suite runs with recorded results, demo reset leaves the control community and its users intact, and applicable dependency alerts have a fix or documented disposition.
- **Dependencies and decisions:** Dedicated test database and credentials; choose a suitable upgrade path for major dependencies.

## Phase 2: Everyday management

### 3. Community announcements — 32–48 hours

- **Problem:** Administrators need one community-scoped place to communicate relevant updates.
- **Scope:** Add drafts, publication, archiving, and authorized edits or withdrawal. Target the entire community or authorized role groups. Reuse in-app and email delivery facilities where appropriate; consider scheduled publication only after selecting a reliable scheduler. Audit the publisher and material changes.
- **Roles:** `ADMIN` drafts and publishes; `RESIDENTE` and `CONSEJO` receive announcements addressed to them; `SUPER_ADMIN` administers access without gaining unnecessary content access.
- **Done when:** Drafts are invisible to recipients, targeting and tenant isolation are enforced on the server, publish/edit/withdraw actions leave an audit trail, and notification failures are visible and retryable. If tracking is approved, **accepted** means the provider or app accepted a notification, not that it reached a mailbox or was read; any delivery state must be based on a documented provider delivery event. **Read** requires an explicit authenticated in-app action and must never rely on email tracking pixels. Tests cover these distinctions and recipient privacy.
- **Dependencies and decisions:** Phase 1 entitlements; decide who may edit published content, recipient groups, retention, notification preferences, scheduling, and whether aggregate read tracking is justified.

### 4. Reservation enhancements — 24–36 hours

- **Problem:** Existing booking rules and decisions can be easier to understand and follow.
- **Scope:** Improve availability presentation, request and approval feedback, cancellation history, and configurable reminders; evaluate additional rules without duplicating existing hours, weekly limits, or blocks. Add aggregate occupancy reporting in Phase 4.
- **Roles:** `ADMIN` configures and reviews; `RESIDENTE` books and cancels their own reservations; `CONSEJO` supervises as permitted.
- **Done when:** Concurrent overlapping pending or approved bookings remain rejected by the database; blocks and rules are enforced server-side; users cannot act across communities or on another resident's booking; cancellation and reminder outcomes are visible and tested, including failed delivery and timezone boundaries.
- **Dependencies and decisions:** Phase 1 entitlement checks; choose reminder timing and delivery channels, cancellation policy, and whether new booking rules are needed. U.S. timezone support depends on Phase 5.

### 5. Administrative workflow refinements — 18–28 hours

- **Problem:** Request handling spans lists, detail, status, and reports; this is a potential source of repeated navigation, not a validated user-research finding.
- **Scope:** Review the existing workflows and add focused work queues and filters for awaiting first contact, in-progress requests, and overdue items where data supports them. Improve empty/error states and provide authorized exports or reminders only where useful.
- **Roles:** `ADMIN` acts; `CONSEJO` receives permitted read-only views.
- **Done when:** Filters match backend records for the selected community, restricted roles cannot invoke management actions, loading/error/empty states are clear, and a documented task-based comparison measures steps and time before and after with representative test data.
- **Dependencies and decisions:** Agree on an overdue definition and whether reminders need scheduling; validate priorities with actual administrators before treating them as proven needs.

## Phase 3: Community directory and marketplace

### 6. Provider and contact directory — 24–36 hours

- **Problem:** Community staff need a controlled place for operational vendor contacts.
- **Scope:** Add community-scoped name, category, necessary contact methods, and limited operational notes; support create, edit, correction, and withdrawal. Keep entries private to authorized community roles and use fictional data in examples, fixtures, and screenshots.
- **Roles:** `ADMIN` maintains records; visibility for `CONSEJO` and `RESIDENTE` is an explicit policy decision; `SUPER_ADMIN` does not gain automatic access to contact details.
- **Done when:** API and UI tests enforce role and community access, correction and deletion or retention policy is implemented, and records and exports contain only fields necessary for the approved purpose.
- **Dependencies and decisions:** Phase 1; decide lawful basis or consent where applicable, visibility, data retention, deletion, and handling of provider corrections with qualified advice.

### 7. Resident marketplace — 40–60 hours

- **Problem:** Residents may want a community-only way to offer items to neighbors.
- **Scope:** Add categories, search, owner-managed drafts, published, paused, sold/withdrawn, and optional expired states; add administrative moderation and abuse reports. Design authenticated, community-scoped contact without exposing personal details publicly by default.
- **Roles:** `RESIDENTE` manages their own listings and reports abuse; `ADMIN` moderates; `CONSEJO` access is undecided.
- **Done when:** Only authorized community members can view listings or initiate approved contact, owners cannot edit others' listings, reports and takedowns are auditable, unsafe content can be removed, and expiry and cross-community access are tested. The product does not process resident-to-resident payments or guarantee transactions.
- **Dependencies and decisions:** Phase 1; decide whether contact uses in-app messaging or consent-based disclosure, allowed content, moderation staffing, retention, expiration, abuse handling, and whether any future payment functionality is separately approved.

## Phase 4: Actionable aggregate metrics

### 8. Metrics definitions and reports — 24–36 hours

- **Problem:** Administrators need comparable measures of workload and community-service use without individual profiling.
- **Scope:** Extend existing request metrics and add announcement adoption and common-area occupancy only after their source data is available. Display period, timezone, filters, denominators, and missing-data handling; support authorized aggregate exports.
- **Roles:** `ADMIN` and authorized `CONSEJO` members; no resident-level profiling or personal information in aggregate reports.
- **Definitions:** For a selected community and reporting period, first-contact time is the mean elapsed time from request receipt to first contact for requests first contacted in the period; closure time is the mean elapsed time from receipt to closure for requests closed in the period. Exclude records missing either endpoint and display the sample count. Workload is the count by category and current status at a stated snapshot time; a historical period needs a separately defined event-based measure. Announcement adoption is unique eligible recipients who explicitly mark an announcement read divided by unique eligible recipients at publication, shown only if read tracking is approved; do not equate email delivery with reading. Occupancy is approved reserved minutes within the selected period divided by available minutes after configured hours and blocks, by common area, excluding cancelled bookings. Clip intervals at period boundaries and specify the timezone.
- **Done when:** Fixture-based tests verify formulas, zero denominators, filters, period boundaries, privacy thresholds and exports; totals reconcile to source records and small groups are suppressed according to an approved threshold.
- **Dependencies and decisions:** Initiatives 3 and 4 for announcement and reservation metrics, respectively; decide reporting timezone, retention, small-group threshold, read tracking, and historical workload semantics.

## Phase 5: U.S. readiness and operational verification

### 9. English localization and U.S. requirements — 30–50 hours

- **Problem:** A U.S. audience needs terminology, dates, timezones, payment options, and policies suitable for its own operating context.
- **Scope:** Inventory Spanish UI, email, exports, and validation messages; implement and test English localization. Design community-specific IANA timezones including daylight-saving transitions, locale-aware formatting, and a reviewed migration from the current Bogota assumption. Assess U.S. payment providers, currency, accessibility, privacy, and local legal requirements before choosing implementation.
- **Roles:** All roles; maintainers and legal advisers review market-specific decisions.
- **Done when:** English workflows and notifications are tested end-to-end, timezone boundary and daylight-saving cases pass, existing Colombian communities retain correct behavior, and each U.S.-specific payment and legal dependency has a documented decision and verification plan. Payment processing is not represented as U.S.-ready until independently implemented and verified.
- **Dependencies and decisions:** Determine target states and community types, translations, timezone migration policy, payment provider and supported currency, accessibility baseline, and applicable legal review.

### 10. Production operations — 16–24 hours

- **Problem:** A configured build alone does not establish reliable operation or recoverability.
- **Scope:** Verify Wompi sandbox approval, rejection, duplicate webhook, renewal and reconciliation; configure monitoring and alerts; document backups and rehearse restoration in a separate environment; verify deployment variables, Storage, email, and cron.
- **Roles:** Maintainer and `SUPER_ADMIN` for operational review.
- **Done when:** The sandbox scenarios have recorded results, alerts reach their intended recipient, a restore is verified without touching production data, and each integration is checked in its intended environment.
- **Dependencies and decisions:** Separate test environments and provider accounts; select monitoring and backup providers and retention targets.

## Estimate and privacy

The initiatives above total **244–372 hours** (24–36 + 12–18 + 32–48 + 24–36 + 18–28 + 24–36 + 40–60 + 24–36 + 30–50 + 16–24). This is an uncertain planning range, not a time commitment or a claim of work completed. Estimates include the following non-overlapping work:

| Initiative | Design and decisions | Implementation | Focused tests and review |
| --- | ---: | ---: | ---: |
| 1. Premium access | 6–8 h | 12–20 h | 6–8 h |
| 2. Test environment and dependencies | 2–3 h | 6–9 h | 4–6 h |
| 3. Announcements | 6–8 h | 18–28 h | 8–12 h |
| 4. Reservation enhancements | 4–6 h | 14–22 h | 6–8 h |
| 5. Administrative refinements | 4–6 h | 10–16 h | 4–6 h |
| 6. Contact directory | 4–6 h | 14–22 h | 6–8 h |
| 7. Resident marketplace | 8–12 h | 22–34 h | 10–14 h |
| 8. Aggregate metrics | 6–8 h | 12–20 h | 6–8 h |
| 9. U.S. localization and requirements | 6–10 h | 18–30 h | 6–10 h |
| 10. Production operations | 4–6 h | 8–12 h | 4–6 h |

Initiative 2 covers shared test infrastructure and dependency review; each feature's own tests are counted only in its row. Initiative 4 covers reservation workflows, while initiative 8 alone covers occupancy reporting. Initiative 3 implements announcement delivery, while initiative 8 alone covers aggregate adoption metrics. Initiative 5 covers request work queues, while initiative 8 covers aggregate reporting. Initiative 10 covers deployment checks and recovery, not the shared test setup in initiative 2. Reassess the ranges when scope decisions are made; external approvals, vendor wait time, and U.S. payment implementation are excluded.

Announcements, marketplace listings, contact directories, reservations, and their notifications may process names, email addresses, user-generated content, contact information, and other personal data when implemented. Design each feature with community isolation, role-based authorization, data minimization, retention, correction, and privacy controls. Use fictional examples and test data. Current demo data, the software's capabilities, and any real production data are separate questions; this roadmap makes no claim about program eligibility or the contents of external systems.
