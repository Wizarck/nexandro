# m3.x-audit-log-idempotency-cache-injection

## Problem

`AuditLogService.idempotencyCache` resolves to `null` even when `AuditLogIdempotencyCache` IS registered as a provider. The LRU dedup branch in `record()` (audit-log.service.ts:88) is therefore unreachable — every emit reaches the persist path regardless of whether it's a duplicate of an envelope already seen within the 1 h TTL window. Two H2a/H2b INT tests document the bug today as `it.skip`:

- `audit-log-subscriber-idempotency.int.spec.ts` — "same envelope emitted twice → one row persists" (4-case file; 1 case skipped, the other 3 test scenarios where dedup MUST NOT fire).
- `audit-log-hash-chain-integrity.int.spec.ts` — `AC-CHAIN-7 — idempotent re-emit produces exactly one DB row`.

Production runs with the cache silently disabled. This is defence-in-depth per ADR-IDEMPOTENT-EMIT-DEDUP (the LRU is intentionally optional because the rate of true double-fire from EventEmitter2 retries is near zero), so today's outcome is "no observable bug — just no dedup". But the design contract IS that the cache runs when wired, and that should be testable + verifiable.

## Root cause

The constructor declares the dep as a union with `null`:

```ts
@Optional()
private readonly idempotencyCache: AuditLogIdempotencyCache | null = null,
```

TypeScript emits the `design:paramtypes` reflection metadata for that parameter as `Object`, not `AuditLogIdempotencyCache`. Union types (especially nullable unions) collapse to `Object` in emitted decorator metadata because TypeScript cannot represent unions at the runtime metadata layer.

NestJS DI flow:

1. Resolve `AuditLogService`. Read `design:paramtypes` → `[DataSource, Object]`.
2. For param 0, `@InjectDataSource()` overrides the reflection token → `DataSource` resolved. ✓
3. For param 1, no explicit `@Inject(...)` is supplied → fall back to `design:paramtypes` token = `Object`.
4. Look up provider with token `Object` → not registered. `@Optional()` says "OK, pass `undefined`".
5. TypeScript constructor invokes with `(dataSource, undefined)` → default `= null` kicks in → `idempotencyCache = null`.

The `AuditLogIdempotencyCache` provider IS resolvable when retrieved directly (`app.get(AuditLogIdempotencyCache)` works in the H2a harness). The bug is purely that the constructor parameter has no link to its token, so DI never queries `AuditLogIdempotencyCache` at all when constructing the service.

## Proposal

Add `@Inject(AuditLogIdempotencyCache)` to the parameter so the token is explicit:

```ts
constructor(
  @InjectDataSource() private readonly dataSource: DataSource,
  @Optional()
  @Inject(AuditLogIdempotencyCache)
  private readonly idempotencyCache: AuditLogIdempotencyCache | null = null,
) {}
```

With the explicit token, NestJS:

- When the provider IS registered → resolves it → cache injected ✓
- When NOT registered → `@Optional()` returns undefined → default `= null` ✓ (preserves the existing `audit-log.service.spec.ts` behaviour, which constructs the service with `{ provide: getDataSourceToken(), useValue: ... }` and no cache; the comment at audit-log.service.ts:62-64 documents why that backwards-compat matters).

Zero behavioural change for production today (the LRU was already optional). The fix turns the dedup branch back ON when the provider is wired (every production module + every INT harness wires it), and it makes the two H2a/H2b INT tests pass.

## Test additions

- Unit (audit-log.service.spec.ts):
  - DI smoke #1: construct `AuditLogService` with no cache provider → `service['idempotencyCache']` is `null`. Confirms legacy spec compat.
  - DI smoke #2: construct with the cache provider → `service['idempotencyCache']` is the resolved instance. Would have been silently null before the fix.
- Integration:
  - Un-skip `same envelope emitted twice → one row persists` in `audit-log-subscriber-idempotency.int.spec.ts`.
  - Un-skip `AC-CHAIN-7 — idempotent re-emit produces exactly one DB row` in `audit-log-hash-chain-integrity.int.spec.ts`.

## Invariants preserved

- **Legacy `audit-log.service.spec.ts`** (no cache provider) → `@Optional()` returns undefined → default `= null` → cache is null. ✓
- **Production AuditLogModule** (cache provided via useFactory) → explicit token resolves → cache injected. ✓
- **H2a INT harness** (cache provided via useFactory) → same as production. ✓
- **All read-side paths** (query/streamRows/wouldExceedCap) → unaffected; they never touch idempotencyCache.

## FR mapping

Closes the AC-INT-4 dedup coverage (the only AC in `audit-log-subscriber-idempotency.int.spec.ts` that was un-passable) + AC-CHAIN-7 (the only AC-CHAIN-* that remained skipped after PR #158 closed the sliding-window-seed bug).

## Out of scope

- The optional-by-default vs required-cache decision. Today's design (cache optional, default null, defence-in-depth) is preserved. A future slice may tighten if telemetry shows real double-fires that the offline D1 audit alone can't catch — `m3.x-audit-log-idempotency-required-mode` filed if that need arises.
- `m3.x-audit-log-subscriber-strict-mode` (separate followup from H2a) — still independently filed.
