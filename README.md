# e-Laya

**A case, rehabilitation and rights access module for eGovPH.**
Team Ala-Eh · DICT eGovHackathon 2026

> Every system we have moves a *case* to a verdict. None of them follows a *person*.
> Entry into that system is automatic. Exit is somebody remembering.

e-Laya is one idea applied six times: **keep a person visible at the moment the current system stops looking** — for persons deprived of liberty, children in conflict with the law, their families, their counsel, and the workers who rehabilitate them.

## Open it

| Surface | For | What it does |
|---|---|---|
| `/kiosk.html` | People inside, and just released | Nine Philippine languages from the first tap. Find and join a rehabilitation programme in five taps, zero typing. |
| `/app.html` | Families and guardians | See how your person is today — and when that was last confirmed — without travelling. |
| `/cases.html` | PAO lawyers | 300 clients ranked by what needs you today, not alphabetically. |
| `/sessions.html` | Social workers | Log 15 attendees in ~12 seconds. Catch the child who cannot finish on the schedule they were given. |
| `/verify.html` | DSWD · BJMP · BuCor | **Kalayaan** — identity resolution for people the system cannot name. |
| `/custody.html` | Facility officers | One tap per person confirms welfare, and reaches the family immediately. |

`/index.html` is the overview · `/pitch.html` is the presentation.

## Architecture

```
public/          static surfaces — no build step
api/             serverless proxy — every government secret terminates here
  _lib.js        token caching, canonical JSON, SHA-256, eGovPay digest
  sso.js         eGov SSO — identity, role gate, lawful basis
  everify.js     eVerify — National ID read (1:1 verification only)
  liveness.js    Face Liveness — 95.0 threshold enforced server-side
  sms.js         eMessage — E.164 normalised, 60s dedupe
  ai.js          eGov AI — translate, speech, laws, document extraction (memoised)
  psgc.js        eReport — region → barangay hierarchy
  chain.js       eGovChain — read-only network state
  pay.js         eGovPay
```

No credential ever reaches the browser. Every surface falls back to seeded data when the API is unreachable, so each one opens and works standalone.

## What we do not claim

No eCourt, BJMP, BuCor, DSWD or PAO interface exists in the hackathon sandbox — those integrations are **proposed, not built**. Every screen here runs on a source that exists today: a document in someone's hand, an ID they present, or records the module itself creates.

The eGovChain node is read-only (`txpool` capacity 0), so nothing is claimed to be anchored on-chain — attendance integrity is a canonical-JSON SHA-256 receipt computed on-device.

We do not claim to reduce recidivism. A national rate requires a release cohort, a person-level identifier, a fixed follow-up window and a chosen event. The Philippines has none of the four. We claim only that it becomes answerable.
