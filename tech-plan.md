# e-Laya — Super App Integration Architecture

**Production integration plan** — Six Mini-Apps, rendered as WebViews, authenticated through the host.

e-Laya is designed as a module within the eGovPH Super App — not a standalone application. Each surface loads as a Mini-App inside the host's in-app browser, sharing the user's authenticated session and presenting a native feel through a lightweight PWA shell.

---

## Integration model: Mini-App / WebView

The eGovPH Super App hosts each e-Laya surface as an embedded WebView. The host controls authentication and navigation; each Mini-App renders a focused, role-specific interface.

```
┌─────────────────────────────────────────────────────────────┐
│  eGovPH Super App (Host)                                    │
│  manages user session, native nav bar, role-based routing   │
├─────────────────────────────────────────────────────────────┤
│  ⬇ WebView bridge (postMessage)                             │
├─────────────────────────────────────────────────────────────┤
│  Mini-App WebView surfaces                                  │
│  Kiosk · Family · Cases · Sessions · Verify · Custody       │
│  React/Next.js PWA bundles, host passes auth via postMessage│
├─────────────────────────────────────────────────────────────┤
│  ⬇ HTTPS (API proxy)                                        │
├─────────────────────────────────────────────────────────────┤
│  eGovPH APIs                                                │
│  SSO · eVerify · Face Liveness · eGov AI · eMessage         │
│  PSGC · eGovChain                                           │
├─────────────────────────────────────────────────────────────┤
│  ⬇ eGovDX                                                   │
├─────────────────────────────────────────────────────────────┤
│  Agency systems (BJMP, DSWD, PAO, Courts)                   │
│  Read from and write back, never replace                    │
└─────────────────────────────────────────────────────────────┘
```

### Layer description

| Layer | Responsibility |
|-------|---------------|
| **Super App** | eGovPH host — user session, native nav, role-based routing |
| **Mini-App** | Six independent WebView surfaces — each a React/Next.js PWA bundle |
| **eGovPH APIs** | Seven government services, all called through a server-side proxy |
| **Agency systems** | BJMP, DSWD, PAO, courts — existing systems integrated via eGovDX |

---

## Host-to-WebView authentication bridge

The user authenticates once in the Super App. The host passes the session to each Mini-App through a structured `postMessage` protocol — no second login, no embedded credentials in URLs.

### eGovPH Super App (Host)

User is authenticated via eGov SSO within the host. User taps "My Family" in the Super App.

```js
// Host sends session and role to the WebView
webView.postMessage({
  type: 'egov-session',
  token: 'eyJhbG...',
  role: 'guardian',
  surface: 'family',
  locale: 'fil'
}, '*');
```

### Mini-App WebView (e-Laya)

Mini-App receives the session and renders its surface. No login screen is shown; the user lands directly on their content.

```js
// Mini-App listens for the host message
window.addEventListener('message', (e) => {
  if (e.data.type === 'egov-session') {
    initSurface(e.data);
  }
});
```

> **Security note:** The token passed to the WebView is a short-lived, surface-scoped access token — not the user's primary SSO session token. The Mini-App uses it to authenticate API proxy calls and validate its role. Token lifetime is bounded to the WebView session duration.

---

## Frontend architecture

Each Mini-App is a lightweight Next.js PWA bundle. Surfaces share a common component library and design system but are built and deployed independently — no single-page app monolith.

### Shared layer

| Package | Purpose |
|---------|---------|
| **elaya-ui** | Shared React component library (cards, forms, banners, status chips) |
| **elaya-store** | Client-side state with localStorage persistence + cross-tab sync |
| **elaya-api** | Typed API client for the proxy layer with offline queue |
| **elaya-auth** | WebView bridge adapter for host session messages |

### Per-surface bundles

- Each surface is a separate Next.js route group or page
- Code-split at the surface boundary — no surface loads another's components
- PWA service worker enables offline operation with IndexedDB sync queue
- WCAG 2.1 AA compliance enforced at the component level

### Key capabilities

| Capability | Mechanism | Detail |
|------------|-----------|--------|
| **Authentication flow** | `postMessage` token bridge | Host passes `{ token, role, surface, locale }`. Mini-App validates against API proxy. No redirect login, no OAuth popups inside the WebView |
| **Offline resilience** | Service worker + IndexedDB | Caches surface shells and API responses. Writes queued in IndexedDB and flushed when connectivity returns. UI remains fully interactive offline |
| **Role-based routing** | SSO role gating | Super App determines which surface based on SSO role. Guardian sees Family; PAO lawyer sees Cases. Route decision at host level, not inside WebView |
| **Native feel** | eGovPH design tokens | elaya.css tokens match eGovPH visual language. 44x44px minimum touch targets (WCAG 2.1). Transparent WebView nav so Super App native bar surfaces above content |
| **Once-only data entry** | Shared API layer | Welfare check logged in Custody surfaces in Family. Identity determination in Verify propagates to Cases and Sessions. No re-entry |
| **Surface isolation** | Independent WebViews | Separate DOM, memory, network context per Mini-App. Crash in one cannot affect another. Idle Mini-Apps can be unloaded and reloaded without data loss |

---

## Production tech stack

Every layer is chosen to match the eGovPH engineering team's tooling and to satisfy government infrastructure requirements. No new framework is introduced into the ecosystem.

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend framework** | React / Next.js (PWA) | Matches Super App's likely stack; service workers for offline; TypeScript for API contract enforcement |
| **Alternative** | Flutter Web | If Super App is Flutter-based, embedding a Flutter Web Mini-App provides closest native feel |
| **Backend / API** | Next.js API Routes or Express on containers | Containerised Node.js on DICT eGovCloud; framework-agnostic API proxy layer already proven in MVP |
| **Database** | PostgreSQL (self-hosted on eGovCloud) | Relational schema centred on `persons`; Row-Level Security for RBAC; no vendor lock-in |
| **Authentication** | eGov SSO + host-session bridge | SSO for primary auth; Super App passes scoped tokens to WebViews; no second login |
| **Messaging** | eMessage (SMS) + WebSocket | SMS reaches families on basic phones; WebSocket for real-time cross-surface updates |
| **File storage** | S3-compatible (MinIO on eGovCloud) | Encrypted storage for document scans with access logging |
| **Hosting** | DICT eGovCloud | Government data on government infrastructure; DICT and Data Privacy Act compliant |

---

## eGovPH API integration

Seven government services integrated through a common API proxy. The proxy enforces credential isolation, response caching, and structured error handling — every call returns `{ ok: boolean, data?: ..., error?: ... }`.

| Service | Function | Security property |
|---------|----------|-------------------|
| **eGov SSO** | Authentication & role gating | SSO handled by host; WebView receives pre-authenticated, surface-scoped token. Partner JWT never reaches browser |
| **eVerify** | National ID verification | PhilSys Card Number never persisted — only salted SHA-256 hash crosses API boundary. Demographics display-only, discarded on navigation |
| **Face Liveness** | Anti-spoofing biometrics | 95.0 confidence threshold enforced server-side. Biometric check runs on government-hosted page, not inside Mini-App |
| **eGov AI** | Translation, OCR, speech, laws | Nine-language translation (UI pre-baked, dynamic via API). Speech synthesis, document extraction for age proof, laws lookup |
| **eMessage** | SMS notifications | E.164 normalised numbers with 60-second dedup window. Reaches families on basic phones with no data connection |
| **PSGC (eReport)** | Geographic hierarchy | Region → province → city → barangay resolution. Cached aggressively at proxy and service worker layers |
| **eGovChain** | Tamper-evident receipts | Canonical-JSON SHA-256 receipt hashes for attendance and welfare records. Ready for on-chain anchoring with writable node |

---

## Person-centric data model

The schema inverts the current approach: every existing agency system tracks its own process. e-Laya tracks the **person** across all of them — from intake through detention, programme, release, and after.

```
persons                         -- the hub. everything references this.
├── id                          PK
├── full_name, date_of_birth, sex
├── category                    CICL | PDL
├── facility_id                 FK → facilities
├── guardian_id                 FK → guardians
└── created_at

welfare_checks                  -- officer confirms: "I saw this person today"
├── id
├── person_id                   FK → persons
├── status_key, confirmed_at
├── confirmed_by, officer_sso_id
└── receipt_hash                SHA-256 for tamper evidence

determinations                  -- age & category at intake
├── id
├── person_id                   FK
├── category, determined_age
├── determined_at, determined_by
└── documents_used              JSON array of document types

attendance                      -- social worker logs programme participation
├── id
├── person_id                   FK
├── programme_id                FK
└── session_date, present, receipt_hash
```

> **Architectural principle:** BJMP, courts, PAO, and DSWD each track their own process in their own system. e-Laya is the first layer that tracks the **person** across all of them — from intake through detention, programme, release, and after. The `persons` table is the hub; every welfare check, determination, attendance record, and notification references it.

---

## Identity verification flow (Kalayaan)

The Verify Mini-App resolves who a person is — the critical gate before age determination under RA 9344, case assignment, and family notification.

```
 1         2              3              4              5              6
┌─────┐   ┌──────┐      ┌────────┐     ┌──────┐       ┌─────────┐     ┌───────────┐
│ QR  │ → │ QR   │  →   │Liveness│  →  │ QR   │   →   │  Age    │  →  │ Document  │
│scan │   │check │      │session│     │verify│       │computation│    │    OCR    │
└─────┘   └──────┘      └────────┘     └──────┘       └─────────┘     └───────────┘
```

| Step | Action | Detail |
|------|--------|--------|
| **1** | QR scan | Officer scans the National ID QR code using the device camera through the Mini-App |
| **2** | QR check | Proxy sends raw QR value to eVerify; demographics returned if valid National ID Signed QR |
| **3** | Liveness | Face liveness session created; person completes check on government-hosted page |
| **4** | QR verify | QR value bound to liveness session; eVerify confirms face matches the card |
| **5** | Age computation | Verified birthdate used to compute age at apprehension — CICL or PDL classification |
| **6** | Document OCR | If no ID, eGov AI extracts DOB from birth certificate, school record, or baptismal cert |

---

## Security & privacy architecture

**No PII, no biometric, no credential reaches the Mini-App client.** Enforced structurally, not by policy.

| Principle | Mechanism | Detail |
|-----------|-----------|--------|
| **API proxy isolation** | Server-side credentials | All government API secrets are environment variables on the server. Mini-App never holds API key, partner secret, or access token |
| **PCN never stored** | Salted SHA-256 hashing | PhilSys Card Number hashed with salt server-side; only hash crosses response boundary. Demographics display-only, discarded when WebView closed |
| **Server-side threshold** | 95.0 confidence check | Face liveness threshold enforced in proxy function. Compromised Mini-App cannot lower it. Biometric check runs on government-hosted page |
| **Scoped WebView tokens** | Short-lived access JWT | Token passed to WebView is surface-scoped, not the primary SSO session. Mini-App can only call authorised API routes. Lifetime bounded to WebView session |
| **Data proportionality** | Strict surface scoping | Kiosk shows case status without full identity. Family shows welfare without case file. No Mini-App carries another surface's code or data |
| **Audit trail** | Tamper-evident operations | Every welfare check, determination, and attendance record logs who, when, from which device, under which SSO session |

---

## Integration with existing agency systems

e-Laya does not replace any agency system. It is an additive person-tracking layer that reads from and writes back to existing systems through the eGov Data Exchange (eGovDX).

| Agency | Integration model |
|--------|------------------|
| **BJMP** | Reads facility rosters and commitment records. Writes welfare check data consumable through eGovDX |
| **DSWD** | Digital interface for attendance logging (currently paper-based). Pushes records back to DSWD case management systems |
| **PAO** | Prioritised, ranked caseload view from court hearing data + e-Laya person records. Lawyers record outcomes that flow to family surface |
| **Courts** | Reads hearing dates and case stages read-only through eCourt integration layer via eGovDX. Never writes to court records |

> **Once-only data entry principle:** A welfare check confirmed by a BJMP officer in the Custody Mini-App is visible to the guardian in the Family Mini-App **and** to the PAO lawyer in Cases — without anyone re-entering it. A social worker logging attendance in Sessions does not need to separately report it to the court. The system carries the record across surfaces through the shared API layer.

---

e-Laya · Team Ala-Eh · DICT eGovHackathon 2026 · *"Walang dapat mawala sa sistema."*
