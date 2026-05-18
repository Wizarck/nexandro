---
slice: Sprint 4 W4 (J5) — WhatsApp ingest skeleton
status: skeleton-shipped; end-to-end deferred to operator action
parent: docs/sprint4-backlog.md
related:
  - docs/ux/j5.md
  - apps/api/src/whatsapp-ingest/
  - apps/api/src/migrations/0047_whatsapp_messages.ts
  - apps/api/.env.example (search WHATSAPP_*)
last-updated: 2026-05-18
---

# J5 WhatsApp ingest — assessment of what ships vs what needs external setup

## TL;DR (read this if nothing else)

**The WhatsApp recipe-creation flow described in `docs/ux/j5.md` does NOT
work end-to-end after this PR.** The PR ships a skeleton: webhook, signature
verification, persistence, parser stub, discoverability UI. To make a
message from Lourdes' phone actually create a recipe draft you need to
complete external Meta Business setup (described in §3 below) plus the
M2.x slice that wires the parsed output into the `recipes` BC with a
`pending_review` lifecycle state (described in §6 below).

This doc is the operator runbook + the scope-honesty trail.

---

## 1. What's shipped in this PR (working)

The components below are fully wired + tested + ready for code review.
**They do NOT depend on Meta Business setup** — they can be exercised
in unit tests against any signed payload.

| Piece | File | Tests |
|---|---|---|
| Webhook signature verification (HMAC-SHA256, timing-safe compare) | `apps/api/src/whatsapp-ingest/application/whatsapp-signature.ts` | 9 cases incl. tamper, malformed hex, missing header |
| Inbound webhook controller (POST `/api/webhooks/whatsapp`) | `apps/api/src/whatsapp-ingest/interface/whatsapp-webhook.controller.ts` | 7 cases incl. replay idempotency, missing default org, non-JSON body |
| Meta verification handshake (GET `/api/webhooks/whatsapp`) | `apps/api/src/whatsapp-ingest/interface/whatsapp-verify.controller.ts` | 5 cases incl. fail-closed on missing env |
| `whatsapp_messages` entity + migration (idempotency via UNIQUE `provider_message_id`) | `apps/api/src/whatsapp-ingest/domain/whatsapp-message.entity.ts`, `apps/api/src/migrations/0047_whatsapp_messages.ts` | entity factory + state machine covered indirectly via ingest tests |
| Repository (multi-tenant, scoped on `organizationId`) | `apps/api/src/whatsapp-ingest/infrastructure/whatsapp-message.repository.ts` | exercised via controller specs |
| Regex parser stub (Spanish + multilingual units g/kg/ml/cl/l/ud) | `apps/api/src/whatsapp-ingest/application/parse-recipe-from-text.service.ts` | 8 cases incl. j5.md happy path |
| Orchestration service (`pending → parsed | failed | ignored`) | `apps/api/src/whatsapp-ingest/application/whatsapp-ingest.service.ts` | 4 cases |
| `NestFactory.create({ rawBody: true })` so the webhook can read the byte-for-byte body Meta hashed | `apps/api/src/main.ts` | exercised via webhook controller spec |
| Discoverability banner on `/recipes` | `apps/web/src/screens/RecipeBuilderJ1Screen.tsx` | render covered by existing e2e |
| Settings → IA card with honest "no configurada" status + runbook link | `apps/web/src/screens/settings/OwnerAgentCredentialsSection.tsx` | 1 new test case asserting copy |
| Env var documentation (6 vars) | `apps/api/.env.example`, root `.env.example` | n/a |

---

## 2. What requires external setup (the operator does this — agent CANNOT)

Nothing in §1 lets a real WhatsApp message create a recipe. The operator
(you, the human running nexandro) must complete every step in §3 in Meta's
dashboard with a real Meta Business identity. None of this can be
automated from inside nexandro.

### The non-negotiable prerequisites

1. **Meta Business account** — a verified Meta Business identity (the
   same one you'd use for Facebook Pages / Instagram Business). Free.
   Requires legal entity name, address, contact email.
2. **WhatsApp Business API access** — request from
   [developers.facebook.com](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).
   For the Cloud API path (recommended), Meta auto-provisions sandbox
   access immediately for one test number; production requires "app
   review" which takes 1–5 business days.
3. **Phone number registration** — a phone number that does NOT have an
   existing WhatsApp installation. Meta sends an SMS or voice code to
   verify. Once registered to the Business API the number can no longer
   be used in the regular consumer WhatsApp app.
4. **Webhook URL whitelist** — HTTPS only, valid TLS cert. Meta verifies
   the URL with the handshake GET described in §3.2 below.
   `nexandro.palafitofood.com` qualifies (Cloudflare-fronted, valid
   cert).
5. **Webhook secret + verify token generation** — the operator picks
   both. The "App Secret" is fixed (Meta generates it when the app is
   created); the "Verify Token" is arbitrary opaque text.
6. **Access token** — Meta generates a temporary 24h token in the
   sandbox path. For production the operator generates a long-lived
   System User token (see §3.4).

---

## 3. Operator configuration runbook

Estimated wall-clock time: **2–4 hours** the first time. Most of the wait
is Meta's app review (5 minutes to file, 1–5 business days for approval).

### 3.1 Create the Meta Business app

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. *Create App* → *Business* → fill name + business contact email.
3. In the app dashboard, *Add Products* → *WhatsApp* → *Set Up*.
4. Note down the **App ID** (top of the page) and **App Secret**
   (Settings → Basic → "Show"). The App Secret IS the
   `WHATSAPP_WEBHOOK_SECRET` env var.

### 3.2 Configure the webhook

1. WhatsApp → *Configuration* in the sidebar.
2. *Edit* under "Callback URL" → enter
   `https://<your-host>/api/webhooks/whatsapp` (e.g.
   `https://nexandro.palafitofood.com/api/webhooks/whatsapp`).
3. *Verify Token* → enter any opaque string (e.g. `openssl rand -hex 32`
   output). Set the same string as `WHATSAPP_VERIFY_TOKEN` in the
   nexandro env BEFORE clicking *Verify and Save* — Meta will hit the
   GET endpoint immediately and abort if it doesn't get a 200 with the
   challenge echoed back.
4. Once verified, *Subscribe* the `messages` field. nexandro will start
   receiving inbound message webhooks.

### 3.3 Register a phone number

1. WhatsApp → *API Setup* in the sidebar.
2. *From* dropdown → *Manage phone numbers* → *Add phone number*.
3. Enter the number + display name. Meta sends an SMS or voice code.
4. Once verified, copy the **Phone number ID** (NOT the phone number
   itself) — this is `WHATSAPP_PHONE_NUMBER_ID`.

### 3.4 Generate a long-lived access token

The default access token Meta shows in *API Setup* expires in 24h. For
production:

1. Go to [business.facebook.com/settings/system-users](https://business.facebook.com/settings/system-users).
2. *Add* → name the system user "nexandro-prod" → *Admin* role.
3. *Add Assets* → assign the WhatsApp Business Account.
4. *Generate New Token* → select the app → permissions
   `whatsapp_business_management`, `whatsapp_business_messaging` →
   expiration *Never* → *Generate Token*.
5. Copy the token IMMEDIATELY (Meta does not show it again). Set as
   `WHATSAPP_ACCESS_TOKEN`.

### 3.5 Set env vars in the nexandro deploy

In your `.env` (or Docker compose / Kubernetes secret):

- `WHATSAPP_VERIFY_TOKEN=<the opaque string from §3.2>`
- `WHATSAPP_WEBHOOK_SECRET=<App Secret from §3.1>`
- `WHATSAPP_ACCESS_TOKEN=<long-lived token from §3.4>`
- `WHATSAPP_PHONE_NUMBER_ID=<from §3.3>`
- `WHATSAPP_BUSINESS_ACCOUNT_ID=<from API Setup; optional, only for management API>`
- `WHATSAPP_DEFAULT_ORGANIZATION_ID=<UUID of the nexandro org under which inbound messages get persisted>`

Restart the API container. The webhook is now live.

### 3.6 Smoke-test from a real device

1. Open WhatsApp on your phone (any account that's NOT the registered
   business number).
2. Send any text message to the business number.
3. On the API host, tail the logs — you should see a
   `whatsapp-webhook.persist` line within a few seconds.
4. Query Postgres: `SELECT id, from_number, status, body FROM
   whatsapp_messages ORDER BY received_at DESC LIMIT 1;`. You should
   see your message with `status='parsed'` (or `failed` for an
   unparseable body, or `ignored` if you sent an image).

If you see `status='ignored'` with `error_message LIKE '%non-text%'`,
the message arrived but was an image / voice / sticker — the parser
stub is text-only (§6 below).

---

## 4. Limitations of the Meta WhatsApp Cloud API itself

These are external constraints — they don't disappear once §3 is done.

### 4.1 Outbound message templates

Meta restricts the *first* business-to-user message to pre-approved
templates. Free-form replies are only allowed inside the **24h customer
service window** — i.e. within 24 hours of the customer's last inbound
message. Implications:

- The j5.md flow ("nexandro replies with a link to review the draft") is
  fine if Lourdes just sent a message — her inbound starts the 24h
  window. nexandro's reply lands within that window as a free-form text.
- The j5.md follow-up ("we ping her on Monday morning that her draft is
  pending review") requires an **approved template**. Template approval
  takes 1–5 business days per language per template. We will need at
  least one Spanish template "Tu borrador de receta `{{1}}` espera tu
  revisión: `{{2}}`".

Template submission is operator-side via Meta's dashboard. NOT in scope
of this slice.

### 4.2 24h messaging window restriction

Same surface as 4.1 but worth restating: nexandro cannot proactively
message a user who has not messaged us in the last 24 hours, except via
an approved template. The follow-up M2.x slice that builds the operator
"unread WhatsApp drafts" surface should either:

- Restrict notifications to in-app only (no WhatsApp ping), OR
- Define + ship a Meta-approved template for the ping.

### 4.3 Cost per conversation

Meta charges per "24h conversation window" not per message. Rough EU
prices as of mid-2026 (subject to Meta's rate sheet — verify in the
operator's Meta Business Suite billing dashboard):

| Country | Per user-initiated conversation | Per business-initiated conversation |
|---|---|---|
| Spain | ~€0.0353 | ~€0.0735 |
| Portugal | ~€0.0405 | ~€0.0945 |
| France | ~€0.0760 | ~€0.1407 |
| Germany | ~€0.0809 | ~€0.1572 |

For a typical kitchen with 1–3 recipe submissions per week, monthly cost
is ~€0.50–€1.50. NOT a deployment blocker but document it in the org's
onboarding so they're not surprised by the Meta invoice.

### 4.4 Quality rating + ban risk

Meta tracks "quality rating" per phone number. Receiving lots of "block"
or "report" signals lowers the rating; persistent low rating triggers
messaging throttles or bans. The j5.md flow is entirely
business-initiated-by-prompt (the customer sends first), so this is a
low risk. But: never use a registered WhatsApp Business number for any
unrelated outbound activity.

### 4.5 Cloud API vs On-Premises API

The skeleton targets the **Cloud API** (Meta-hosted). On-Premises is
legacy and Meta announced sunset for 2025. If the operator picks
On-Premises by mistake, the webhook shape is similar but the signature
header changes — the verification code in `whatsapp-signature.ts` would
need a fork. We chose Cloud API; do not deploy On-Premises.

---

## 5. Privacy notes (GDPR)

WhatsApp phone numbers are PII per Article 4(1) GDPR. The
`whatsapp_messages.from_number` column carries them in cleartext.
Operator obligations:

1. **Lawful basis**: declare *Consent* on the OFF onboarding ("by
   sending a WhatsApp message to this number you agree…") or
   *Legitimate Interest* with a clear DPIA. The privacy module (Sprint
   2 P4) already surfaces lawful-basis configuration per org — add a
   row for `whatsapp_inbound` when the operator enables the
   integration.

2. **Retention**: the migration carries no automatic deletion. The
   `whatsapp_messages` table should be swept by the privacy module's
   physical-deletion cron once it ships (follow-up:
   `m4-privacy-physical-deletion-cron`). For Sprint 4 W4, document the
   manual deletion query in the operator runbook:
   ```sql
   DELETE FROM whatsapp_messages
   WHERE received_at < now() - interval '60 days'
     AND organization_id = '<org-uuid>';
   ```

3. **Right to erasure (GDPR Art. 17)**: when a user invokes their
   erasure right, the privacy module's `PRIVACY_DELETE_SCHEDULED` flow
   should add `whatsapp_messages` to the table list. Today it does NOT
   — followup `m4-privacy-delete-whatsapp-messages` is required before
   the operator advertises the integration to end users.

4. **Cross-border transfer**: Meta processes WhatsApp messages on
   infrastructure that may include US-based regions. Operators serving
   EU users MUST disclose this in their privacy notice. (The Standard
   Contractual Clauses Meta publishes cover the transfer; the
   disclosure is still required.)

5. **DPA with Meta**: Meta's
   [WhatsApp Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms)
   include a DPA exhibit. Operator signs by accepting. Counter-sign by
   countersigning in the Meta Business Suite if a wet-ink version is
   required for the operator's audit.

---

## 6. What's intentionally NOT shipped (M2.x slice)

The skeleton stops at marking `whatsapp_messages.status = 'parsed'` and
stashing the parser output on `raw_payload.parserOutput`. The pieces
below close the loop into the recipes BC and were intentionally deferred
because each carries its own design decisions that need their own slice:

1. **Recipe `pending_review` lifecycle state** (j5.md §What M2 must keep
   open §1). Today `Recipe.isActive` is a boolean; the agent path needs
   a fourth state ("draft created by an agent on behalf of a human user,
   awaiting human review"). Migration + state machine update is its own
   slice.

2. **`created_via_channel` column on Recipe** (j5.md §2). Nullable
   string `web | whatsapp | telegram | cli | agent`. Required so the
   M2.x inbox can render the channel chip + so audit can reconstruct
   provenance.

3. **Phone → User mapping for routing** (j5.md §4). Today
   `WHATSAPP_DEFAULT_ORGANIZATION_ID` is a single sentinel org — every
   inbound message lands there. M2.x retrofits the User entity with a
   `phone E.164` column + the webhook controller looks up the sender's
   org via that column.

4. **Hermes / Claude vision-LLM parser**. j5.md calls for multimodal
   input (photo + text). The skeleton's regex stub is text-only and
   misses anything that doesn't follow the
   "`<name>, <qty><unit> <ingredient>, ...`" template. M2.x swaps the
   regex for a Hermes `compose-recipe-from-message` MCP capability with
   the regex as a graceful fallback when Hermes is unreachable / off.

5. **Outbound reply via Meta Graph API**. The skeleton does not POST
   anything back to Meta. The reply ("Tu borrador está aquí: …") needs
   to honour the 24h window + template constraints from §4 above.

6. **Operator UI surface for the WhatsApp inbox** (j5.md
   §components). The j5.md mock describes a sidesheet listing pending
   drafts with channel chip + provenance link. Today the only operator-
   visible artefact is the Settings → IA "no configurada" card.

7. **MCP capability `compose-recipe-from-message`** (j5.md §3 MCP
   single-contract rule). The agent path consumes the same recipes BC
   API as the UI — but a capability declaration is needed so the
   AgentCapabilityGuard can gate it like every other MCP write.

8. **Privacy retention sweep on `whatsapp_messages`** (§5.2 above).

The followup tracking issue is `m4-whatsapp-inbox-and-recipes-bc-wiring`
— file when an operator decides to actually wire the integration.

---

## 7. How to back out the skeleton

If the integration is not pursued, removing it is straightforward:

1. Revert the PR (`gh pr revert <pr-num>`) or rebase out the commits.
2. Drop the table: `migration:revert` against migration `0047`.
3. Remove the 6 env vars from production secrets.
4. Drop the Settings → IA card from
   `OwnerAgentCredentialsSection.tsx`. The discoverability banner on
   `/recipes` can stay or be removed at preference.

No external state (no Meta account changes) needs to be undone — the
operator-side Meta setup is independent of the skeleton's existence.

---

## 8. Cross-references

- Spec: `docs/ux/j5.md` (M2.x design intent).
- Sprint 4 backlog entry: `docs/sprint4-backlog.md` (see the W4 row).
- Privacy module: `apps/api/src/privacy/` (Sprint 2 P4 — DPO, retention
  policy, deletion flow).
- BYO LLM key (the M2.x Hermes parser will reuse this):
  `apps/api/src/llm-credentials/` (Sprint 4 W2-1b).
- Agent capability registry (the M2.x MCP capability will register
  here): `apps/api/src/shared/guards/agent-capability.guard.ts`.
