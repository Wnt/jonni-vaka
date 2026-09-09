<!--
SPDX-FileCopyrightText: 2017-2026 City of Espoo

SPDX-License-Identifier: LGPL-2.1-or-later
-->

# Citizen API tokens

Scoped, revocable, non-interactive access to the citizen API, so that a
citizen can let a program act on their behalf without handing over their
eVaka credentials.

## Motivation

Citizens already build integrations against eVaka. Today the only way to do
that is to drive the citizen frontend with the citizen's own weak-login
credentials (email + password) or a scraped session cookie. That is bad on
every axis we care about:

- **Security.** The integration holds a credential that grants *everything*
  the citizen can do, including changing the password and registering a
  passkey. There is no expiry, no scope, and no way to revoke it short of
  changing the password.
- **Privacy / DPIA.** There is no record of which program accessed what.
  From the audit log, a scraper is indistinguishable from the citizen.
- **Operations.** Scraper traffic looks exactly like browser traffic. It
  repeats the whole login flow, fetches assets, and pollutes the same
  dashboards and alerts as real users, with no way to filter it out.

A scoped token fixes all three at once, and it does so by *removing*
capability rather than adding it: a token is strictly weaker than the
password the citizen already has. That is the core argument for a DPIA
review — this feature reduces the amount of authority in circulation.

## Non-goals (for the first version)

- **Not a full OAuth 2.1 authorization server.** No client registration, no
  authorization endpoint, no consent screen, no refresh rotation, no
  discovery metadata. That is a large amount of code and a large DPIA
  surface, and it is only needed when *third-party* applications want access
  to *other people's* data. The model here is GitHub's fine-grained personal
  access tokens: the citizen mints a token for their own use.
- **Not a new API surface.** No iCal endpoint, no read-only mirror of the
  citizen API, no separate versioned "public API". The token authenticates
  against the citizen API we already have and already maintain.
- **Not read-only by policy.** Scopes carry read/write separately, derived
  from the HTTP method. A read-only token is the default the UI offers, not
  a restriction baked into the design.

The design is deliberately forward-compatible with OAuth: an authorization
endpoint added later becomes just another way to create a row in the same
table, with the same scope vocabulary and the same enforcement point.

## Design

### 1. A token authenticates as a weak-authenticated citizen

A token maps to `AuthenticatedUser.Citizen(personId, CitizenAuthLevel.WEAK)`
— exactly what an email + password login produces. This is the single most
important simplification:

- Everything a weakly-authenticated citizen can do is reachable, as required.
- **The service needs no new authorization logic.** All existing access
  control (which children, which units, which documents) applies unchanged,
  because the identity is the same citizen it always was.
- A token can never grant more than the citizen has. Effective access is the
  intersection of *the citizen's own rights* and *the token's scopes* — the
  same intersection property that makes GitHub Apps safe.

### 2. Scopes are derived from endpoint paths, not maintained by hand

The scope of a request is a pure function of its method and path:

```
/citizen/<segment>/...  +  GET | HEAD          ->  <segment>:read
/citizen/<segment>/...  +  POST | PUT | PATCH | DELETE  ->  <segment>:write
```

So `GET /citizen/calendar-events` needs `calendar-events:read`, and
`POST /citizen/reservations` needs `reservations:write`. There is no mapping
table to keep in sync, and a new endpoint is automatically covered by the
scope its path already implies.

To keep that from being *silently* true — a new endpoint quietly joining an
already-granted scope is exactly what a DPIA reviewer should object to — the
full scope catalogue is **generated and checked in**, using the endpoint
scanner the codegen already runs (`evaka.codegen.api.scanEndpoints`). CI
fails if the checked-in catalogue does not match the code, so every change
to the exposed surface appears as a reviewable diff.

### 3. Some scopes are never grantable

Credential management must be outside the reach of any token, or a leaked
token becomes full account takeover:

- `/citizen/personal-data/weak-login-credentials` (password)
- `/citizen/passkeys/**` (passkey registration and removal)
- `/citizen/api-tokens/**` (a token must not mint or widen tokens)

These are an explicit denylist in the generator. Endpoints on the denylist
get no scope and are rejected for token-authenticated requests regardless of
what scopes were granted. The denylist is short, checked in, and reviewable
— that file is the answer to "what can an app never do?" in a DPIA meeting.

### 4. Enforcement lives in the api-gw, and only there

The api-gw is already the sole authenticator: the service trusts the
`X-User` header completely, gated on the JWT that proves the request came
from the gateway. Scope enforcement is one more decision at the point where
the gateway already decides "does this request go through", so it introduces
no new trust assumption.

The contract between api-gw and service is therefore almost unchanged:

| Header | Today | With a token |
| --- | --- | --- |
| `X-User` | `{"type":"citizen_weak","id":…}` | identical |
| `X-Evaka-Api-Token-Id` | absent | token id, for audit and logging only |

The service is unaware that tokens exist, except for the two places that
issue and validate them. Nothing in the service branches on "is this a
token". The extra header is never consulted for authorization — it exists so
that audit records and observability can tell a program apart from a person.

### 5. Request flow

```
Client                api-gw                                    service
  |                     |                                          |
  |-- GET /citizen/calendar-events -------->                       |
  |   Authorization: Bearer evaka_pat_…    |                       |
  |                     |                                          |
  |                     |-- POST /system/citizen-api-token-login -->|
  |                     |   { token }                              |  sha256 -> lookup,
  |                     |<-- { personId, tokenId, scopes } --------|  expiry + revocation
  |                     |                                          |  check, touch last_used_at
  |                     |                                          |
  |                     | scope required: calendar-events:read      |
  |                     | granted? -> yes                           |
  |                     |                                          |
  |                     |-- GET /citizen/calendar-events ---------->|
  |                     |   X-User: {"type":"citizen_weak","id":…}  |  normal access control,
  |                     |   X-Evaka-Api-Token-Id: …                 |  unchanged
  |<-- 200 -------------|<-----------------------------------------|
```

Validation results are cached in Valkey for a short TTL keyed by the token
hash, so a chatty client does not turn one request into two on every call.
Revocation deletes the cache entry, so it takes effect immediately.

### 6. CSRF and cookies

Token-authenticated requests carry no cookies, so they are not subject to
CSRF and skip the anti-CSRF header check. Conversely, a request that
presents a token is never allowed to also fall back to a session: the two
authentication modes are mutually exclusive per request. This removes a
class of confused-deputy bugs rather than adding one.

## Data model

One table:

```sql
CREATE TABLE citizen_api_token (
    id           uuid PRIMARY KEY DEFAULT ext.uuid_generate_v1mc(),
    created_at   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at   timestamp with time zone NOT NULL DEFAULT now(),
    person_id    uuid NOT NULL REFERENCES person (id) ON DELETE CASCADE,
    name         text NOT NULL,
    token_hash   bytea NOT NULL UNIQUE,
    scopes       text[] NOT NULL,
    expires_at   timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at   timestamp with time zone
);
```

- The raw token is shown once at creation and never stored. Lookup is by
  SHA-256 of the raw token — a fast hash is correct here because the token
  is high-entropy random, unlike a password.
- `expires_at` is mandatory. The UI offers a bounded set of lifetimes.
- `last_used_at` gives the citizen a "when did this app last read my data"
  view, which is the kind of thing a DPIA review asks for.

## Token format

```
evaka_pat_<43 chars base64url>     # 256 bits of randomness
```

The `evaka_pat_` prefix makes tokens greppable in logs and recognisable to
secret scanners, and lets the gateway reject malformed tokens without a
round-trip to the service.

## What gets added, and where

| Component | Addition |
| --- | --- |
| service, migration | one table |
| service, `SystemController` | `POST /system/citizen-api-token-login` |
| service, new controller | `/citizen/api-tokens` — list, create, revoke (**strong auth only**) |
| service, codegen | scope catalogue generator + denylist + CI check |
| api-gw | bearer-token middleware + scope check, ~1 file |
| api-gw, generated | `citizen-api-scopes.ts` (checked in, CI-verified) |
| citizen-frontend | token management view under personal data |

## Rollout

The feature is behind a feature toggle so each municipality decides when to
enable it, and can do so after its own DPIA review rather than on our
schedule.

## Open questions

1. **Per-child scoping.** GitHub's second axis is repository selection; ours
   would be child selection. It is genuinely useful for a family that wants
   to share one child's calendar. It is also the one part that does not fall
   out of the path structure for free, since the child id is sometimes a
   path variable, sometimes a query parameter, and sometimes implicit. Left
   out of the first version; the token row can gain a `child_ids` column
   later without changing the scope vocabulary.
2. **Scope granularity.** `calendar-event`, `calendar-events` and
   `calendar-event-times` are three separate path segments for one concept,
   so they become three scopes. Grouping them would mean a hand-maintained
   mapping — exactly the maintenance we are trying to avoid. The proposal is
   to keep scopes mechanical and do the grouping in the UI with translated
   labels.
3. **Rate limiting.** Per-token limits are not in the first version. The
   existing weak-login rate limiter is the model to follow.
