# Spec: m2-agent-credential-rotation

> Wave 1.17. Acceptance scenarios for atomic Ed25519 keypair rotation.

## Scenario: WHEN an Owner POSTs to /agent-credentials/:id/rotate with a new public key, THEN the row's public_key is swapped atomically

```
GIVEN  An active agent_credential row with id=X, agentName='hermes-prod',
       publicKey='OLD_BASE64', revokedAt=null
       AND An authenticated user with role=OWNER for the same organization
WHEN   The Owner POSTs to /agent-credentials/X/rotate with body
       {"publicKey": "NEW_BASE64"}
THEN   The endpoint returns HTTP 200 with WriteResponseDto<AgentCredentialResponse>
       AND The response body's data.id == X (unchanged)
       AND The response body's data.agentName == 'hermes-prod' (unchanged)
       AND The response body's data.createdAt is unchanged
       AND The response body's data.revokedAt == null (unchanged)
       AND The response body does NOT echo publicKey
       AND The DB row's public_key column == 'NEW_BASE64'
       AND The DB row's id is unchanged.
```

## Scenario: WHEN rotation succeeds, THEN exactly one AGENT_ACTION_FORENSIC audit row is emitted

```
GIVEN  Rotation succeeds per the previous scenario
WHEN   AuditLogSubscriber persists the BeforeAfterAuditInterceptor emission
THEN   audit_log carries exactly one new row with:
         event_type = 'AGENT_ACTION_FORENSIC'
         aggregate_type = 'agent_credential'
         aggregate_id = X
         actor_kind = 'agent'  (the request flowed through agent middleware)
                         OR 'user' if the Owner called via direct REST without
                         X-Via-Agent (current behaviour: no X-Via-Agent → no
                         audit row from the interceptor; documented)
       AND The row carries payload_before.publicKey = 'OLD_BASE64'
       AND The row carries payload_after.publicKey = 'NEW_BASE64'
       AND The row's reason carries the capability descriptor or null
            depending on the agent header presence.
```

## Scenario: WHEN rotation targets a revoked credential, THEN the request fails with 409

```
GIVEN  An agent_credential row with id=X, revokedAt=2026-01-01T00:00:00Z
WHEN   An Owner POSTs to /agent-credentials/X/rotate with body
       {"publicKey": "NEW_BASE64"}
THEN   The endpoint returns HTTP 409 Conflict
       AND The response body carries {code: 'AGENT_CREDENTIAL_REVOKED'}
       AND The DB row's public_key remains the pre-call value
       AND The DB row's revokedAt remains the pre-call value
       AND No audit row is emitted (the interceptor short-circuits on
            handler exception per the existing 3a behaviour).
```

## Scenario: WHEN rotation targets an unknown id, THEN the request fails with 404

```
GIVEN  No agent_credential row exists for id=Y in the calling org
WHEN   An Owner POSTs to /agent-credentials/Y/rotate
THEN   The endpoint returns HTTP 404 Not Found
       AND The response body carries {code: 'AGENT_CREDENTIAL_NOT_FOUND'}.
```

## Scenario: WHEN rotation crosses org boundaries, THEN it returns 404 (not 403, to avoid id existence leak)

```
GIVEN  Org A has agent_credential id=X
       AND An Owner of Org B authenticates and POSTs to /agent-credentials/X/rotate
WHEN   The service's getById queries with organizationId=B
THEN   The query returns no row
       AND The endpoint returns HTTP 404 'AGENT_CREDENTIAL_NOT_FOUND'
       AND The Owner of Org B cannot infer that id=X exists in some other org.
```

## Scenario: WHEN rotation is called by a non-Owner, THEN the Roles guard rejects with 403

```
GIVEN  An authenticated user with role=MANAGER OR STAFF
WHEN   They POST to /agent-credentials/X/rotate
THEN   The endpoint returns HTTP 403 Forbidden
       AND No service code runs
       AND No audit row is emitted.
```

## Scenario: WHEN the agent re-signs a request after rotation, THEN the new public key verifies and the old key does not

```
GIVEN  Rotation has succeeded for agent X
WHEN   The agent posts a signed request using the new private key + X-Agent-Id=X
THEN   AgentSignatureMiddleware verifies the signature against the new public key
       AND The request flows through the auth pipeline normally
       AND req.agentContext.signatureVerified == true.

WHEN   A request signed with the OLD private key arrives with X-Agent-Id=X
       (e.g. an in-flight pre-rotation request)
THEN   AgentSignatureMiddleware verification fails
       AND When NEXANDRO_AGENT_SIGNATURE_REQUIRED=true for the org,
            the request is rejected with HTTP 401 'AGENT_SIGNATURE_INVALID'
       AND When the flag is off, the legacy unsigned 3a behaviour applies.
```

## Scenario: WHEN the rotation DTO is malformed, THEN class-validator returns 422

```
GIVEN  An Owner POSTs to /agent-credentials/X/rotate with body
       {"publicKey": ""}  (empty string violates MinLength)
WHEN   The DTO validator runs
THEN   The endpoint returns HTTP 422 Unprocessable Entity
       AND The response body lists the field-level error
       AND No service code runs
       AND The DB row is unchanged.
```

## Scenario: WHEN payload omits publicKey entirely, THEN class-validator rejects with 422

```
GIVEN  An Owner POSTs to /agent-credentials/X/rotate with body {} (no publicKey)
WHEN   The DTO validator runs
THEN   The endpoint returns HTTP 422 with the missing-field error.
```
