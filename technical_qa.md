# e-Laya — Technical Interview Q&A Preparation

**Prepared for:** Team Ala-Eh · DICT eGovHackathon 2026 Interview  
**Date:** 30 July 2026  
**Scope:** Technical questions a panel of government IT officials, DICT officers, or fellow developers might ask about the e-Laya MVP and its path to production.

> **Framing reminder:** e-Laya is a *proposed design* — an MVP that demonstrates how the system would work. The codebase proves the concept is feasible using real eGovPH APIs. It is not a production-ready system. Every answer below is written with that honesty in mind.

---

## Table of Contents

1. [General Architecture & Design Decisions](#1-general-architecture--design-decisions)
2. [eGovPH API Integration (The Core Differentiator)](#2-egovph-api-integration-the-core-differentiator)
3. [Security, Privacy & Data Protection](#3-security-privacy--data-protection)
4. [Scalability & Production Readiness](#4-scalability--production-readiness)
5. [User Experience & Accessibility](#5-user-experience--accessibility)
6. [Legal & Regulatory Alignment](#6-legal--regulatory-alignment)
7. [Database & Infrastructure (Production Vision)](#7-database--infrastructure-production-vision)
8. [Integration with Existing Government Systems](#8-integration-with-existing-government-systems)
9. [Testing, Reliability & Error Handling](#9-testing-reliability--error-handling)
10. [Team, Process & Future Roadmap](#10-team-process--future-roadmap)

---

## 1. General Architecture & Design Decisions

### Q1.1: "Walk us through the architecture of e-Laya. How is it structured?"

**Answer:**

e-Laya follows a **surface-based architecture** — six independent user interfaces, each designed for a specific stakeholder (inmates, families, lawyers, social workers, identity officers, and facility officers). All six surfaces share a common serverless API proxy layer.

```
┌────────────────────────────────────────────────────┐
│                    CLIENT LAYER                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ ┌────────┐ │
│  │Kiosk │ │Family│ │Cases │ │Sessions│ │Custody │ │
│  │(PDL) │ │(App) │ │(PAO) │ │(LSWDO) │ │(BJMP)  │ │
│  └──┬───┘ └──┬───┘ └──┬───┘ └───┬────┘ └───┬────┘ │
│     │        │        │         │           │      │
│  ┌──┴────────┴────────┴─────────┴───────────┴──┐   │
│  │        /verify (Identity Resolution)         │   │
│  └──────────────────┬──────────────────────────┘   │
└─────────────────────┼──────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │   SERVERLESS API PROXY   │
         │  (Vercel Edge Functions) │
         │   No credential ever     │
         │   reaches the browser    │
         └────────────┬────────────┘
                      │
    ┌─────────┬───────┼───────┬──────────┬────────┐
    │         │       │       │          │        │
 eGov SSO  eVerify  eGov AI  eLiveness  eMessage eGovChain
```

**Key design decision:** We chose separate surfaces instead of a single-page app because the users are fundamentally different. A kiosk bolted to a jail wall should not have a navigation link to "switch to the PAO caseload" — that would be a security and UX lie. Each surface is a *different product for a different person*, unified by a shared backend and shared data model.

---

### Q1.2: "Why static HTML pages instead of a modern framework like React or Flutter?"

**Answer:**

Three reasons, all deliberate:

1. **Zero-dependency resilience.** The kiosk and the family app must work in environments with unreliable connectivity. Static HTML loads from cache, works offline with seeded data, and never fails because a CDN is down or a JS bundle didn't load.

2. **Speed of proof.** In a 48-hour hackathon, six fully functional surfaces with real API integrations mattered more than architectural elegance. Every hour spent on build tooling is an hour not spent proving the concept works.

3. **Honest scope.** For production, we would absolutely evaluate a framework — likely a **Progressive Web App (PWA)** architecture using React/Next.js or Flutter Web, depending on what integrates best with the existing eGovPH Super App. The MVP proves the *what*; the framework choice is part of the *how* that comes next.

> **Important caveat:** We have already started exploring a Next.js migration in our codebase. The API proxy layer has been fully ported to Next.js Route Handlers in TypeScript. The frontend migration is the next phase.

---

### Q1.3: "Why did you choose Vercel for hosting? Wouldn't a government cloud be more appropriate?"

**Answer:**

Vercel was a *hackathon convenience*, not an architectural commitment. It gave us:
- Instant deploys from Git push
- Serverless functions with zero config
- HTTPS out of the box
- A 30-second deploy-to-live cycle

For production, e-Laya would need to be deployed on **government-approved infrastructure** — likely the DICT's own cloud or a eGovCloud-compliant provider. The architecture is deliberately portable: the API proxy layer is standard Node.js serverless functions that run anywhere (AWS Lambda, Azure Functions, GCP Cloud Run, or on-prem containers). No vendor lock-in.

---

### Q1.4: "Why six separate surfaces instead of one unified app?"

**Answer:**

Because the users are not the same person, and their security contexts are completely different:

| Surface | User | Device | Security Context |
|---------|------|--------|-----------------|
| **Kiosk** | Person in custody | Shared terminal, bolted to a wall | No login — identity comes from National ID scan |
| **Family App** | Guardian/relative | Personal phone, possibly feature phone | eGov SSO login |
| **Cases** | PAO lawyer | Office workstation | Role-gated, high-privilege |
| **Sessions** | Social worker | Tablet in a session room | Role-gated |
| **Verify** | DSWD / BJMP intake officer | Office device | Role-gated, handles PII |
| **Custody** | Facility officer | Facility device | Role-gated, handles daily welfare |

A single app with a role switcher would mean every user carries code for every other role on their device — a larger attack surface, a larger download, and a confusing experience. Each surface should know only what that person is permitted to see.

In production, these could be separate modules within the eGovPH Super App, loaded on demand based on the user's SSO role.

---

## 2. eGovPH API Integration (The Core Differentiator)

### Q2.1: "Which eGovPH APIs did you actually integrate, and how?"

**Answer:**

We integrated **seven** of the nine hackathon APIs, all verified working against the sandbox:

| API | What we use it for | Surface(s) | Verified? |
|-----|-------------------|------------|-----------|
| **eGov SSO** | Citizen authentication (mobile → OTP → MPIN) | All (login) | ✅ Exchange code → partner JWT → profile |
| **eVerify** | National ID QR scan and demographics lookup | Kiosk, Verify | ✅ QR check, QR verify, demographics query |
| **Face Liveness** | Anti-spoofing during identity verification | Verify | ✅ Session create → hosted check → result with 95.0 threshold |
| **eGov AI** | Translation (9 languages), document extraction (age proof), speech synthesis, laws lookup | Kiosk, Verify | ✅ All four sub-endpoints working |
| **eMessage** | SMS notifications to families on welfare status changes | Family, Custody | ✅ Fire-and-forget SMS with E.164 normalization |
| **PSGC** | Region → Province → City → Barangay hierarchy for address resolution | Kiosk | ✅ Full hierarchy returned |
| **eGovChain** | Read-only blockchain state for verifiable record integrity | Sessions (receipt anchoring) | ✅ Block height, chain ID, peer count — but write capacity is 0 |

**Not integrated:** eGovPay is implemented in the proxy but not yet wired to a surface (the use case is statutory fees, which don't apply to our domain). eReport token is cached but unused in the current MVP.

---

### Q2.2: "How does the eVerify / National ID integration work in your system?"

**Answer:**

This is the heart of the `/verify` surface — what we call **Kalayaan** (identity resolution). The flow:

1. **QR Scan.** The intake officer scans the person's National ID QR code using the device camera.
2. **QR Check** (`POST /api/everify`, action: `qr-check`). Our proxy sends the raw QR value to eVerify. The API returns demographics (name, birthdate, sex, photo) if it's a "National ID Signed" QR. If it's a PCN-only or Digital ID QR, we degrade honestly — we tell the officer what type of QR it was and that a name couldn't be resolved from it.
3. **Liveness Session** (`POST /api/liveness`, action: `session`). A face liveness session is created. The officer hands the phone to the person, who completes the liveness check on a hosted page.
4. **QR Verify** (`POST /api/everify`, action: `qr-verify`). The QR value is bound to the liveness session. eVerify confirms (or denies) that the face matches the person on the card.
5. **Age Computation.** The verified birthdate is used to compute age at time of apprehension — the critical determination under RA 9344 of whether someone is a CICL (child) or PDL (adult).

**Privacy rule (non-negotiable):** The PhilSys number (PCN) never leaves the server. We hash it with a salt (`sha256('fpic-2026|' + PCN)`) for any internal reference, and the full demographics are shown once and discarded — never persisted in a database. This is by design, not by omission.

---

### Q2.3: "You mentioned nine languages on the kiosk. How does the translation work?"

**Answer:**

The kiosk supports **nine Philippine languages**: Filipino, English, Cebuano, Ilocano, Hiligaynon, Waray, Kapampangan, Pangasinan, and Bikol.

The translation is a **two-layer system**:

1. **Static UI strings are pre-baked.** All button labels, instructions, and navigation text are translated at build time and embedded directly in the HTML. This means the kiosk works in all nine languages even with no internet connection and zero API credits.

2. **Dynamic content uses eGov AI.** Programme names, notes, and real-time messages are translated on demand through `POST /api/ai` (action: `translate`). Every translation is **memoised on a content hash** — the same text translated twice costs only one API credit, ever. This is critical because we had a hard budget of 200 credits for the entire hackathon.

**Why this matters:** A person inside a facility is unlikely to speak English or even Filipino as their first language. RA 9344 requires that a child's rights be explained in a language they understand. A kiosk that only speaks English is useless to the people who need it most.

---

### Q2.4: "The eGovChain node is read-only. How do you use blockchain in your system?"

**Answer:**

**Honestly:** We read from it, we do not write to it, and we don't claim otherwise.

The hackathon blockchain node's transaction pool has `maxSize: 0`. We verified this ourselves — `txpool_besuStatistics` returns `{"maxSize": 0}`. Any `eth_sendRawTransaction` returns error -32002 ("Transaction pool not enabled"). We even confirmed that a well-formed transaction with proper gas pricing reaches the accounting stage before being dropped (-32004 "Upfront cost exceeds account balance"), proving our transactions *were* valid.

**What we do use it for:**
- Our `/sessions` attendance log computes a **canonical-JSON SHA-256 receipt** for each session record. This receipt is generated on-device and could be anchored to a writable chain in production.
- We expose live chain state (block height, chain ID, peer count) to demonstrate integration readiness.

**What we'd do in production:**
- With a writable node, attendance receipts and welfare confirmations could be anchored as tamper-evident records — a judge could independently verify that a specific welfare check happened at a specific time.
- This aligns with eGovChain's stated purpose: transparency and integrity of government transactions.

---

### Q2.5: "How do you handle the eGov AI credit budget?"

**Answer:**

We had **200 credits** for the entire hackathon — translation, speech, document extraction, and law lookup combined. Running out mid-demo would have been catastrophic.

Our approach:
1. **Content-hash memoisation.** Every API call is keyed by `sha256(JSON.stringify(requestBody))`. The same request never costs a second credit. This is implemented as an in-memory `Map` in the serverless function — warm instances reuse the cache.
2. **Static-first translation.** All nine language packs for the UI are baked into the HTML, not fetched from the API. Only dynamic content (programme descriptions, personalized messages) hits the API.
3. **Document extraction caching.** When the same document photo is uploaded twice (common during rehearsals), we hash the raw bytes and return the cached result.

The result: a full demo rehearsal costs ~15 credits the first time, and zero credits every time after.

---

## 3. Security, Privacy & Data Protection

### Q3.1: "How do you handle sensitive data like National ID information?"

**Answer:**

**The cardinal rule: no credential, no PII, and no biometric ever reaches the browser.**

The architecture enforces this structurally, not just by policy:

1. **API proxy pattern.** All eGovPH API calls go through our serverless proxy (`/api/*`). API keys, partner secrets, and tokens are environment variables on the server — they literally cannot be extracted from the client code because they don't exist there.

2. **PhilSys data handling:**
   - The PCN (PhilSys Card Number) is **never stored**. It is hashed with a salt on the server and only the hash crosses the response boundary.
   - Demographics (name, birthdate, photo) are returned to the client for **display only** during the verification flow. They are not persisted in any database. When the user navigates away, the data is gone.
   - The government-issued photo is a pre-signed, short-lived URL — useless to store.

3. **eGov SSO secrets:**
   - `partner_code` and `partner_secret` live in `process.env` on the server.
   - The browser only ever handles the `exchange_code` (single-use, short-lived).
   - The partner JWT is used server-side to fetch the profile and never exposed to the client.

4. **Face Liveness:**
   - The confidence threshold (95.0) is enforced **server-side**. A malicious client cannot lower it.
   - The liveness check happens on a hosted page (the person opens a link), not in our code — so we never touch biometric data directly.

---

### Q3.2: "What about the Data Privacy Act (RA 10173)? How does e-Laya comply?"

**Answer:**

e-Laya is designed with the Data Privacy Act in mind from the architecture level:

1. **Proportionality.** Each surface collects only what it needs. The kiosk shows case status — it doesn't need (and doesn't request) a full identity profile. The family app shows welfare status — it doesn't need to see the case file.

2. **Lawful basis.** For PDLs and CICLs, processing is grounded in:
   - **Legal obligation** (RA 9344 requires age determination; BJMP mandate requires welfare tracking)
   - **Vital interests** (welfare monitoring protects the person's life and health)
   - **Public authority** (PAO has statutory counsel responsibilities)

3. **Data minimisation.** The MVP doesn't persist anything beyond what the session requires. In production, we'd implement:
   - Purpose-limited data retention schedules
   - Audit logging for all PII access
   - Consent records managed through the eGov SSO consent framework

4. **Data subject rights.** In production, the family app would include a mechanism for guardians to request data access, correction, or erasure — implemented through the eGovPH data exchange layer.

---

### Q3.3: "What happens if someone tries to tamper with the welfare check data?"

**Answer:**

In the MVP, welfare data lives in the client's `localStorage`, which is inherently tamper-prone. This is explicitly acknowledged — it's an MVP.

In production, the solution is layered:

1. **Server-side persistence.** Welfare checks would be written to a secured database through authenticated API calls, not stored on the client.
2. **Audit trail.** Every welfare check records: who confirmed it, when, from which device, and which officer's authenticated session. This creates a tamper-evident chain of accountability.
3. **Blockchain anchoring.** With a writable eGovChain node, a hash of each welfare record could be anchored on-chain. Even if the database were compromised, the on-chain hash would reveal the tampering.
4. **Role-based access.** Only authenticated officers (via eGov SSO, role-gated) can write welfare data. The system would reject unsigned or unauthenticated writes.

---

## 4. Scalability & Production Readiness

### Q4.1: "This is an MVP. What would it take to make this production-ready?"

**Answer:**

We see production readiness in four phases:

| Phase | Scope | Key Work |
|-------|-------|----------|
| **1. Foundation** | Tech stack decision, database design, auth hardening | Choose framework (likely React/Next.js or Flutter as PWA), design the relational schema, implement proper session management on top of eGov SSO |
| **2. Core Services** | Server-side persistence, role-based access control | Replace `localStorage` with a proper database (PostgreSQL via Supabase, or government-hosted), implement RBAC tied to SSO roles, build the API layer for CRUD operations |
| **3. Integration** | Connect to real agency systems | Work with BJMP, DSWD, PAO, and the courts to define data exchange protocols. Use eGovDX for interoperability. |
| **4. Compliance & Deployment** | Security audit, accessibility audit, government cloud deployment | DICT security assessment, NPC compliance review, deploy to government-approved infrastructure |

**Honest estimate:** Phase 1–2 is 3–4 months with a small team. Phase 3 depends entirely on agency cooperation and could take 6–12 months. Phase 4 is a gating requirement before any real data flows.

---

### Q4.2: "How would you handle the scale? BJMP has 500+ facilities and 200,000+ PDLs."

**Answer:**

The MVP's architecture actually scales well because the surfaces are stateless — they're just HTML that talks to APIs. The bottleneck in production would be the backend, which we'd address with:

1. **Horizontal scaling.** Serverless functions (whether on Vercel, AWS Lambda, or containers) scale automatically with demand. Each `/api/*` endpoint is independent and stateless.

2. **Database design.** We'd use a managed PostgreSQL instance (or whatever the DICT cloud provides) with:
   - Per-facility partitioning for welfare records
   - Read replicas for the family app (high read, low write)
   - Connection pooling (PgBouncer or equivalent) to handle concurrent connections from hundreds of facilities

3. **Caching strategy.**
   - PSGC data (region/barangay hierarchy) is slow-changing — cache aggressively.
   - eVerify tokens are already cached for 20 minutes in our code.
   - AI translations are memoised on content hash — a translation done once is free forever.

4. **Offline-first for facilities.** Facility terminals may lose connectivity. A PWA with service workers would queue welfare checks locally and sync when connectivity returns — exactly the pattern our MVP's `localStorage` approach proves works, but with a proper sync protocol.

---

### Q4.3: "What tech stack would you recommend for production?"

**Answer:**

This is explicitly an open question we haven't committed to — and intentionally so. The right answer depends on what the eGovPH engineering team uses and what integrates best with the Super App. Our current thinking:

| Layer | MVP | Production Candidates | Rationale |
|-------|-----|----------------------|-----------|
| **Frontend** | Vanilla HTML/JS | **React/Next.js** (PWA) or **Flutter Web** | PWA enables offline-first; Flutter if eGovPH Super App is Flutter-based |
| **Backend/API** | Vercel serverless (Node.js) | **Next.js API Routes** or **Express on containers** | Already partially ported to Next.js; containerised for government cloud |
| **Database** | None (localStorage) | **PostgreSQL** (via Supabase, Neon, or DICT-hosted) | Relational model fits case/person/programme data; strong ecosystem |
| **Auth** | eGov SSO (already integrated) | eGov SSO + **session management** (JWT + Redis) | SSO gives us identity; we add session duration, RBAC, and audit |
| **File Storage** | N/A | **S3-compatible** (MinIO on-prem or cloud) | Document scans (birth certificates) need secure, encrypted storage |
| **Messaging** | eMessage (already integrated) | eMessage + **WebSocket** for real-time | SMS for families; WebSocket for live cross-surface sync |
| **Hosting** | Vercel | **DICT eGovCloud** or approved provider | Compliance requirement — government data on government infrastructure |

The key principle: **we should match whatever the eGovPH team uses**, not introduce a new stack into the government ecosystem.

---

## 5. User Experience & Accessibility

### Q5.1: "The kiosk is for people in custody. How did you design for that context?"

**Answer:**

We made five deliberate design choices based on the reality of who uses a jail kiosk:

1. **Nine languages from the first tap.** The language selector is the first screen, not buried in settings. A Waray-speaking fisherman from Samar detained in Metro Manila should understand the system immediately.

2. **Zero typing.** The entire kiosk flow works with taps only. Many people in custody have limited literacy, and a shared terminal with a keyboard is a hygiene and security problem.

3. **Five taps to enrol in a programme.** We counted. Language → ID scan → programme list → select → confirm. No forms, no account creation, no passwords.

4. **Graceful degradation.** If the API is unreachable (common in facilities), the kiosk falls back to seeded data and still renders a complete, usable interface. The person sees *something* rather than a blank screen or a spinner.

5. **Read-aloud.** Via eGov AI speech synthesis, any screen content can be read aloud in the selected language — because some users cannot read at all.

---

### Q5.2: "How does the family app serve a family member who only has a feature phone?"

**Answer:**

The family app is designed to reach people through **SMS notifications via eMessage** — not just through the app itself.

- When an officer confirms welfare in `/custody`, the system queues an SMS: *"Miguel is doing OK. Confirmed today by the facility."*
- The SMS is sent to the guardian's registered phone number via the eMessage API.
- The message uses E.164 normalized numbers and includes a 60-second deduplication window to prevent double-sends.

For a mother in a province with no smartphone and no data plan, this single SMS — received on a ₱500 feature phone — replaces a 4-hour bus ride to the facility just to hear four words. That's the core value proposition.

---

### Q5.3: "How do you handle accessibility requirements?"

**Answer:**

For the MVP, we focused on:
- **Semantic HTML** — proper heading hierarchy, ARIA labels on interactive controls
- **Touch target sizing** — minimum 44×44px tap targets on mobile (WCAG 2.1 standard)
- **Visually hidden headings** — each surface has exactly one `<h1>` for screen readers
- **Language declaration** — `document.documentElement.lang` updates when the user selects a language on the kiosk
- **High contrast** — the design uses WCAG AA-compliant colour ratios

For production, we'd need a formal WCAG 2.1 AA audit and remediation — especially critical for the kiosk, where users may have visual or motor impairments.

---

## 6. Legal & Regulatory Alignment

### Q6.1: "How does e-Laya support RA 9344 (Juvenile Justice and Welfare Act)?"

**Answer:**

RA 9344 and its IRR impose specific obligations that are currently handled by paper processes. e-Laya digitises four of them:

1. **Age determination** (IRR Rule 35.b). When a child is apprehended, the officer must determine age using documents (birth certificate, baptismal certificate, school records). Our `/verify` surface uses **eGov AI document extraction** to read whatever paper the child produces and extract a date of birth — automating what is currently a manual, error-prone process.

2. **CICL categorisation.** Based on the determined age, the system categorises the person:
   - 15 and below → exempt from criminal liability, mandatory intervention
   - Above 15, below 18 → diversion or court proceedings depending on discernment
   - 18 and above → PDL (person deprived of liberty)
   
   Getting this wrong means a child is processed as an adult. Our system makes the age computation immediate, documented, and auditable.

3. **Programme tracking.** RA 9344 requires CICLs to undergo intervention programmes. Our `/sessions` surface tracks attendance, computes completion progress, and flags children who are falling behind — replacing the paper registers social workers currently use.

4. **National record system.** RA 9344 (Section 57) mandated a national record system for CICLs. **It was never built.** The JJWC has the JJMIS, but it's not integrated into the day-to-day workflow of social workers and lawyers. e-Laya could serve as that missing link.

---

### Q6.2: "How does this align with the eGovPH mission of 'One Digitized Government, One Nation'?"

**Answer:**

e-Laya directly supports three pillars of the DICT's mission:

1. **Interoperability.** We use eGovPH APIs as building blocks, not as decorative integrations. eVerify confirms identity, eGov AI reads documents, eMessage reaches families, SSO authenticates users — all through the official API catalogue. This is exactly how the eGov Data Exchange (eGovDX) envisions inter-agency service composition.

2. **Citizen-centric design.** The DICT vision says government services should revolve around the citizen, not the agency. e-Laya follows a *person*, not a *case*. A case moves through one agency (PAO → court → verdict). A person moves through many — BJMP, DSWD, PAO, courts, Bahay Pag-asa. e-Laya keeps the person visible across all of them.

3. **Trust.** Undersecretary Almirol said at the hackathon: "Trust is the new oil." A family that can see their relative is OK — without travelling — trusts the system more. An officer whose welfare check is recorded and receipted trusts that their work is seen. A lawyer whose caseload is ranked by urgency trusts that no client slips through. Trust comes from visibility, and visibility is what e-Laya provides.

---

### Q6.3: "How would e-Laya integrate into the eGovPH Super App?"

**Answer:**

We envision e-Laya as a **module within the Super App**, not a standalone app. The integration model:

1. **Authentication** — Already using eGov SSO. In the Super App, the user is already logged in. e-Laya surfaces would appear based on role: a guardian sees the family view, a PAO lawyer sees the caseload, an officer sees the welfare dashboard.

2. **Identity** — eVerify integration is already built. In the Super App, the National ID is already linked to the user's profile, simplifying the verification flow.

3. **Notifications** — Through eMessage (already integrated) and the Super App's native push notifications.

4. **Data Exchange** — Through eGovDX, e-Laya would exchange records with BJMP's existing systems, DSWD's case management, and the courts' docket system — following the "once-only data entry" principle.

5. **Payments** — eGovPay is already proxied (though not yet used in a surface). If there are statutory fees related to bail or programme enrolment, eGovPay handles them.

The goal: a guardian opens the eGovPH app, taps "My Family" → sees their detained relative's status. No separate download, no separate login, no separate account.

---

## 7. Database & Infrastructure (Production Vision)

### Q7.1: "You have no database right now. What would the data model look like in production?"

**Answer:**

The MVP uses seeded (hardcoded) data to demonstrate the UX. In production, we'd design a relational schema around the **person**, not the case:

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   persons    │──────<│  welfare_checks   │       │   programmes    │
│──────────────│       │──────────────────│       │─────────────────│
│ id (PK)      │       │ id               │       │ id              │
│ full_name    │       │ person_id (FK)   │       │ name            │
│ date_of_birth│       │ status_key       │       │ total_sessions  │
│ sex          │       │ confirmed_at     │       │ facility_id     │
│ category     │──┐    │ confirmed_by     │       └────────┬────────┘
│ facility_id  │  │    │ officer_sso_id   │                │
│ barangay     │  │    │ receipt_hash     │       ┌────────┴────────┐
│ guardian_id  │  │    └──────────────────┘       │   attendance    │
│ created_at   │  │                               │─────────────────│
└──────────────┘  │    ┌──────────────────┐       │ person_id (FK)  │
                  │    │  determinations  │       │ programme_id(FK)│
                  │    │──────────────────│       │ session_date    │
                  │    │ person_id (FK)   │       │ present (bool)  │
                  ├───<│ category (CICL/  │       │ receipt_hash    │
                  │    │          PDL)    │       └─────────────────┘
                  │    │ determined_age   │
                  │    │ determined_at    │       ┌─────────────────┐
                  │    │ determined_by    │       │  notifications  │
                  │    │ documents_used   │       │─────────────────│
                  │    └──────────────────┘       │ id              │
                  │                               │ person_id (FK)  │
                  │    ┌──────────────────┐       │ guardian_id(FK) │
                  └───<│     cases        │       │ body            │
                       │──────────────────│       │ channel (SMS/   │
                       │ person_id (FK)   │       │         push)   │
                       │ docket_number    │       │ sent_at         │
                       │ court_branch     │       │ delivery_status │
                       │ pao_lawyer_id    │       └─────────────────┘
                       │ offence          │
                       │ stage            │
                       │ next_hearing     │
                       └──────────────────┘
```

**Key design choice:** The `persons` table is the centre. Every other table references it. This is the architectural inversion we're proposing: every existing system (BJMP, courts, PAO) tracks *their* process. Nobody tracks the *person* across processes. e-Laya does.

---

### Q7.2: "What BaaS (Backend-as-a-Service) would you consider?"

**Answer:**

| Option | Pros | Cons | Fit |
|--------|------|------|-----|
| **Supabase** | Open-source PostgreSQL, real-time subscriptions, built-in auth, Row-Level Security | SaaS — data leaves PH unless self-hosted | ✅ Self-host on DICT cloud for compliance |
| **Firebase** | Fast prototyping, real-time DB, push notifications | NoSQL (Firestore) — relational model is a better fit; Google-hosted, data sovereignty concerns | ⚠️ Possible for non-sensitive features only |
| **Appwrite** | Open-source, self-hostable, good auth/storage | Smaller ecosystem, less battle-tested at government scale | ⚠️ Worth evaluating |
| **Custom (Express + PostgreSQL)** | Full control, no vendor risk, government-hostable | More development time, need to build auth/storage/real-time ourselves | ✅ Most compliant, most work |

**Our recommendation:** Supabase self-hosted on DICT infrastructure. It gives us PostgreSQL (the right data model), real-time subscriptions (for cross-surface sync), Row-Level Security (for RBAC), and it's open-source, so there's no vendor lock-in and no data sovereignty issue.

---

## 8. Integration with Existing Government Systems

### Q8.1: "BJMP already has systems. How would e-Laya integrate rather than replace them?"

**Answer:**

e-Laya does **not** replace any existing agency system. We're explicit about this in our README:

> *"No eCourt, BJMP, BuCor, DSWD or PAO interface exists in the hackathon sandbox — those integrations are proposed, not built."*

The integration model is **additive**:

1. **BJMP** already maintains daily headcount and commitment order records. e-Laya would *read* from BJMP's system (via eGovDX) to populate facility rosters, not replace the system that creates them.

2. **DSWD** manages case records for CICLs through local social workers. e-Laya would provide a digital interface for the attendance logging that social workers currently do on paper, and *push* that data back to DSWD's systems.

3. **PAO** lawyers currently track caseloads in spreadsheets or personal notes. e-Laya provides a ranked, prioritised view of the cases that need attention *today* — pulling hearing dates and case status from court records (when available via eGovDX).

4. **Courts** — e-Laya doesn't touch court systems. Hearing dates and case stages would be fetched read-only through the eCourt integration layer (when available).

The key insight: e-Laya is a **person-tracking layer** that sits *above* agency systems. It reads from them, shows the right information to the right person, and writes back only the data it creates (welfare checks, attendance records, identity determinations).

---

### Q8.2: "How would inter-agency data exchange work?"

**Answer:**

Through the **eGov Data Exchange (eGovDX)**, which is DICT's official interoperability platform. The "once-only data entry" principle means:

- A person's identity, once verified through eVerify, doesn't need to be re-entered at BJMP, DSWD, PAO, or the court.
- A welfare check confirmed by a BJMP officer is visible to the guardian in the family app *and* to the PAO lawyer in the caseload — without anyone re-entering it.
- A social worker logging attendance doesn't need to separately report it to the court — the system carries the record.

This is exactly the interoperability vision eGovDX was built for. e-Laya is a concrete use case that demonstrates why it matters.

---

## 9. Testing, Reliability & Error Handling

### Q9.1: "How do you handle API failures gracefully?"

**Answer:**

Every surface is designed to work **without any API at all**. This is a core architectural principle, not an afterthought:

1. **Seeded data fallback.** Each surface has a complete, realistic seed dataset embedded in its HTML. If the API is down, the surface renders the seed and remains fully interactive. This was verified — every surface opens and works from `file://` with no server whatsoever.

2. **Serverless proxy wrapping.** Every API proxy function is wrapped in a `handler()` function that catches all errors and returns a structured JSON error response. An upstream failure never renders as a blank screen.

3. **Timeout-aware requests.** The kiosk uses `AbortController` with timeouts for API probes. If eVerify, PSGC, or AI don't respond within the timeout, the surface silently falls back to local data. This is by design — during a demo on a facility's poor WiFi, the kiosk should never hang.

4. **Error isolation.** The proxy returns `{ ok: false, error: "..." }` with appropriate HTTP status codes. The client checks `ok` and degrades rather than crashing.

---

### Q9.2: "Did you do any testing?"

**Answer:**

For the hackathon MVP, testing was manual and scenario-driven — we verified each surface against real API responses in the sandbox. We have a Playwright test suite designed (documented in our implementation plan) covering:

- **Regression:** All 8 pages load with zero console errors
- **Accessibility:** One `<h1>` per surface, no nested interactive elements, minimum tap target sizes
- **Integration flows:** Welfare chain (custody → family), attendance chain (sessions → cases/kiosk), identity chain (verify → cases)
- **Degradation:** All surfaces render with `localStorage` disabled

For production, we'd implement:
- Unit tests for all API proxy functions
- Integration tests against the eGovPH sandbox
- End-to-end tests for critical flows (identity verification, welfare confirmation)
- Load testing for concurrent facility usage

---

## 10. Team, Process & Future Roadmap

### Q10.1: "If you were given funding and a mandate, what's your 6-month roadmap?"

**Answer:**

| Month | Milestone | Deliverable |
|-------|-----------|-------------|
| **1** | Tech stack finalisation + design system | Confirmed framework, database schema, design tokens, component library |
| **2** | Core platform | Authentication (eGov SSO + RBAC), database, person registry, welfare CRUD |
| **3** | Two chains working | Welfare chain (officer → family) and attendance chain (social worker → lawyer) end-to-end with real data |
| **4** | Identity resolution | `/verify` with real eVerify + Liveness + document extraction, writing to the person registry |
| **5** | Agency pilot | Deploy to one BJMP facility and one Bahay Pag-asa. Real officers, real data, real families. Collect feedback. |
| **6** | Security audit + compliance | NPC review, DICT security assessment, WCAG audit. Fix everything found. Prepare for broader rollout. |

---

### Q10.2: "What's the single biggest technical risk?"

**Answer:**

**Agency system integration.** The technology works — we've proven that with seven live API integrations. The risk is *institutional*: getting BJMP, DSWD, PAO, and the courts to agree on data exchange protocols, expose their systems through eGovDX, and trust a new layer with their data.

This is not a technology problem. It's a coordination problem. And it's exactly the kind of problem the DICT is positioned to solve through the E-Government Master Plan.

---

### Q10.3: "Why should the government invest in building this?"

**Answer:**

Three numbers:

1. **89% of people in Philippine jails have not been convicted.** They are waiting — and waiting is an information problem. A case isn't delayed because the system is corrupt. It's delayed because the hearing date wasn't communicated, the case file wasn't found, or the lawyer didn't know their client was eligible for release.

2. **92,084 people were released last year** through the work of BJMP paralegals. The system already works. What fails is *telling anyone in time*.

3. **2013** is when RA 9344 required a national record system for CICLs. It was never built.

e-Laya doesn't require new laws. It doesn't require new agencies. It requires connecting the systems that already exist, using the APIs that already exist, to keep visible the people the system has stopped looking at.

That's what the eGovPH Super App was built for. e-Laya is what it looks like when you apply it to the people who need it most.

---

## Quick-Reference Cheat Sheet

For rapid recall during the interview:

| If they ask about... | Key phrase to remember |
|----------------------|----------------------|
| Architecture | "Six surfaces, one API proxy, zero shared credentials" |
| Why static HTML | "Hackathon speed; production would be PWA/React, matching eGovPH stack" |
| National ID | "QR scan → eVerify → liveness check → age determination under RA 9344" |
| Privacy | "No PII persists. PCN is hashed. Threshold enforced server-side." |
| Blockchain | "Read-only. We don't claim writes. Receipts are SHA-256, ready for a writable node." |
| Database | "MVP has none by design. Production: PostgreSQL, person-centric schema." |
| Languages | "Nine. Static UI pre-baked. Dynamic content through eGov AI, memoised." |
| Credit budget | "200 credits, content-hash memo, static-first. Rehearsal costs zero." |
| BJMP integration | "Additive, not replacement. Read from their system, write only what we create." |
| Why this matters | "89% unconvicted. 92K released. 2013 mandate never built. Information problem." |
| Biggest risk | "Not technology — coordination across agencies. DICT's role to solve." |
| eGovPH alignment | "Person-centric, not case-centric. Uses 7 of 9 hackathon APIs. Module for the Super App." |