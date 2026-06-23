---
name: saga-smell
description: >
  Detect saga smells — sequences of two or more observable effects (DB writes,
  message publishes, HTTP calls, notifications, ledger mutations, cache writes,
  etc.) that form one logical business operation but lack compensation,
  idempotent retry, or rollback paths. Use when reviewing code that performs
  I/O, processes payments, handles events, or coordinates across services.
  Trigger phrases: "review for saga smells", "check compensation", "saga
  review", "distributed transaction review", "check this for consistency issues".
version: 1.4.0
author: John Coleman
license: MIT
allowed-tools: Read, Grep, Glob
---

# Saga smell detector

You are performing a saga smell analysis. Follow the scanning protocol below
before applying any detection rules.

---

## Scanning protocol

Execute these steps in order. Do not begin writing findings until Step 5.

### Step 1 — Enumerate all source files

Use Glob to list every source file in scope. Collect extensions relevant to
the target codebase (`.java`, `.kt`, `.scala`, `.go`, `.ts`, `.js`, `.py`,
`.cs`, `.rb`, `.rs`). Record the complete file list and total count. If no
path was specified, scan the current working directory recursively.

```
glob('**/*.ts')   # replace with the extension(s) present in this codebase
```

Report: "Enumerated N files across M directories."

### Step 2 — Classify files — do not skip based on filename alone

Assign each file to one of these reading priorities based on its content, not
its name. You must read a file to confirm it belongs in the Skippable category.

**Priority 1 — Shared transport and cross-cutting infrastructure (read first)**
Files that implement messaging, event dispatch, async execution wrappers, or
interceptor/middleware chains that other code depends on. The identifying
characteristic is: *a defect here propagates silently to every caller.* Signs
when reading the file: publishes to a queue or topic, wraps calls in async
fire-and-forget, has a no-op stub path for disabled integrations, swallows
exceptions in a cross-cutting wrapper. Read these before any domain code —
their defects explain patterns you will find later.

**Priority 2 — Domain operations (read in module groups)**
Files that orchestrate business logic — coordinating multiple calls, driving
workflows, or implementing commands and event handlers. These are the primary
locus of saga smells because they chain effects together.

**Priority 3 — Skippable**
Files with no executable logic: pure type or interface definitions, data-only
structures with no methods, generated code, constant declarations. Confirm by
reading before skipping — do not decide by filename alone. A file with a
"plain data" name may contain a factory method or a lifecycle hook that crosses
a trust boundary.

### Step 3 — Read platform infrastructure first

Infrastructure smells are high-leverage: one fire-and-forget publisher or
one exception-swallowing aspect creates an invisible saga smell in every
service that uses it. Always read infrastructure files before domain code.

After reading each infrastructure file, ask: *does a defect here amplify
callers?* If yes, note this before moving to domain modules — it will explain
patterns you find later.

### Step 4 — Read domain files module by module

Within each module, start with files that appear to coordinate or orchestrate
multiple operations, then read supporting files. Read every file — do not skip
one because a previous file in the module "covered the pattern." The same
infrastructure defect can manifest differently across multiple callers in the
same module.

### Step 5 — Completeness checkpoint

Before writing any finding, output this block:

```
FILES ENUMERATED: N
FILES READ: N
FILES SKIPPED: N
  - path/to/file.ext — reason (must be "no method bodies" or "pure read interface")
INFRASTRUCTURE FILES READ:
  - path/to/MessagePublisher.ext
  - path/to/EventConsumer.ext
  ...
```

If any infrastructure file was skipped, go back and read it now.

---

## What is a saga smell?

A saga smell is a structural defect in a multi-effect operation where at least
one effect has no compensation, idempotent retry, or rollback path if a
subsequent step fails — leaving the system permanently inconsistent.

**Observable effect** — any action that crosses a trust boundary or mutates
state beyond the current process heap that the runtime cannot automatically
roll back. Full taxonomy and all eight detection rules follow.

---

# Saga smell — detection rules reference

## Observable effects taxonomy

Any of the following constitutes an observable effect for saga purposes:

- **Persistent storage writes** — SQL, NoSQL, Redis, DynamoDB, S3, Elasticsearch, time-series DB
- **Message publication** — Kafka, RabbitMQ, SQS/SNS, NATS, EventBridge, Azure Service Bus
- **Synchronous remote calls** — HTTP, gRPC, GraphQL mutations, SOAP, to any service across a network boundary
- **Distributed cache writes treated as authoritative** — Ignite, Hazelcast, Redis used as system of record
- **Shared mutable state in long-lived processes** — actor state, global variables, in-memory singletons
- **File system mutations on shared/network volumes** — create, delete, rename, append
- **Notifications** — SMTP, Twilio SMS, APNs/FCM push — irreversible; must always be last in sequence
- **Financial/ledger mutations** — payment captures, accounting entries, refunds; compensation is a new counter-entry, not a delete
- **Identity/access mutations** — user provisioning, IAM changes, permission grants
- **Audit log appends** — append-only records with compliance significance
- **Third-party webhooks/callbacks** — outbound HTTP triggering irreversible downstream effects
- **Infrastructure/provisioning mutations** — cloud API calls that create or destroy resources

## Necessary conditions for a saga smell (all four must hold)

1. Two or more observable effects belong to the same named operation or function
2. No distributed transaction, saga orchestrator, or 2PC wraps all effects
3. At least one effect is non-idempotent (re-execution produces a different outcome)
4. A failure between effects leaves durably committed state that violates domain invariants

## The pivot transaction

The pivot is the point of no return in a saga. Effects before the pivot can be
compensated (backward recovery). Effects after the pivot must be retried to
completion (forward recovery). A saga with no defined pivot is the most severe
case: no recovery strategy can be reasoned about.

---

## ACH evaluation protocol

Rule pattern matching alone produces false positives when compensation is
provided by a framework, a transactional outbox, idempotency-by-design, or a
higher-level coordinator not visible in the target scope. Apply this two-pass
evaluation before reporting any finding.

### Pass 1 — Fast path

If **none** of the competing-hypothesis signals in the evidence matrix below
appear in or near the candidate location, flag the finding directly at full
severity. No further analysis needed.

### Pass 2 — ACH evaluation

If **any** competing-hypothesis signal is present, evaluate the full hypothesis
set before reporting.

**Step 1 — State the hypotheses.** For every candidate, exactly one of the
following is true:

| ID | Hypothesis |
|---|---|
| H_smell | Pattern represents a genuine structural defect — no compensation, ordering, or idempotency is present |
| H_framework | A durable execution framework (Temporal, Restate, Golem, Conductor, AWS Step Functions) wraps all effects at a higher scope |
| H_outbox | An atomic DB + outbox write is in place; a relay/CDC process handles publication (R3 candidates only) |
| H_idempotent | All effects are designed to be safely retried without compensation |
| H_step | This function is a deliberate saga step; the caller or orchestrator coordinates compensation |
| H_2pc | An XA/2PC distributed transaction coordinator wraps all effects |

**Step 2 — Build the evidence matrix.** Scan the candidate and its immediate
call graph for each signal below. Mark each hypothesis + (supports) or −
(refutes). Double-mark (++) for strong signals.

| Evidence signal | H_smell | H_framework | H_outbox | H_idempotent | H_step | H_2pc |
|---|---|---|---|---|---|---|
| Framework import — Temporal, Restate, Golem, Conductor, Step Functions | − | ++ | | | | |
| `workflow.*`, `activity.*`, `ctx.run(*)` method calls | − | ++ | | | | |
| Outbox table write inside same DB transaction as the triggering write | − | | ++ | | | |
| CDC relay or outbox publisher referenced nearby | − | | + | | | |
| `idempotency_key` parameter passed to every effect | − | | | ++ | | |
| Deduplication guard (`if seen(key) return`) before every effect | − | | | ++ | | |
| All writes use upsert / insert-or-ignore semantics | | | | + | | |
| Parameter named `sagaId`, `correlationId`, `stepId` accepted by function | | | | | + | |
| Function or class name contains `step`, `activity`, `task`, `handler` | | | | | + | |
| `@SagaStep`, `@Compensate`, `@Transactional` annotation on function | − | | | | + | + |
| `XAResource`, `TransactionManager`, JTA/JTS import | − | | | | | ++ |
| No try/catch, no framework import, no correlation ID — bare effect sequence | ++ | − | − | − | − | − |
| Financial amount in play with no explicit refund/counter-entry path | ++ | | | | | |

**Step 3 — Score and conclude.**

1. The **winning hypothesis** is the one with the highest net support (plusses
   minus minuses) after scanning all signals.
2. If H_smell wins: flag at full severity. Set `ACH confidence: CONFIRMED`.
3. If a competing hypothesis wins: flag at one severity tier lower with
   `ACH confidence: UNCERTAIN`. Name the winning alternative and the evidence
   that supports it. State what additional evidence would confirm or refute.
4. If evidence is exactly tied: flag at current severity with
   `ACH confidence: POSSIBLE`. Note the ambiguity explicitly.

**Scope of the scan.** Scan the candidate function, its direct callers if
visible, and any imports in the same file. Do not trace arbitrarily deep call
graphs — flag H_step when compensation is plausibly present but not visible.

---

## R1 — Multi-effect function with no compensation block

**Pattern:** A function performs two or more observable effects with no
`try/catch`, no compensating call in the error path, and no saga framework.

**Signatures to flag:**
```
await db.save(entity)
await kafka.publish(event)        // no rollback of db.save on failure

await stripe.charge(amount)
await db.insert(orderRecord)      // no refund on failure

await http.post(serviceA, payload)
await http.post(serviceB, payload) // no compensating call to serviceA
```

**Severity:** CRITICAL if financial/ledger effect involved; HIGH otherwise.

**Correction:**
```
// Option A — explicit compensation
try {
  await effect1()
  try {
    await effect2()
  } catch (e) {
    await compensate_effect1()   // named compensation, not just a log
    throw e
  }
} catch (e) { ... }

// Option B — transactional outbox
// Write effect1 + outbox record atomically to DB.
// Relay process publishes from outbox (idempotent).
// Only when effect1 is a DB write and effect2 is a message publish.

// Option C — idempotent + saga log
// Assign idempotency key before any effect.
// Persist saga state after each step for resumable retry.
```

---

## R2 — Non-idempotent effect with no idempotency key

**Pattern:** A charge, email send, or insert without upsert semantics has no
idempotency key, deduplication token, or guard.

**Signatures to flag:**
```
stripe.charge({ amount, customer })           // no key
sendEmail({ to, subject, body })              // no dedup
db.insert(record)                             // not upsert
```

**Safe counterexamples:**
```
stripe.charge({ amount, customer, idempotency_key: operationId })
if (!await alreadySent(messageId)) { sendEmail(...) }
db.upsert(record, conflictColumn: 'idempotency_key')
```

**Severity:** HIGH.

**Correction:**
```
// Derive a stable key from inputs — never from a random source inside the function
const key = hash(userId, orderId, operationName)
await stripe.charge({ amount, idempotency_key: key })

// Or guard with deduplication
if (await dedup.seen(key)) return alreadyProcessedResult(key)
await effect()
await dedup.record(key)
```

---

## R3 — Message published before DB commit

**Pattern:** Message published to a queue/topic before the corresponding DB
write commits. A DB failure after publish leaves an orphaned event.

**Signatures to flag:**
```
await kafka.publish('order.created', payload)
await db.save(order)                          // publish happened first

await eventBus.emit('payment.captured', data)
await ledger.append(entry)                    // same problem
```

**Severity:** CRITICAL. Most common saga smell in event-driven systems.

**Correction:**
```
// Correct — commit first, publish second
await db.save(order)
await kafka.publish('order.created', payload)

// Stronger — transactional outbox:
// 1. Write order AND outbox record in one DB transaction
// 2. Relay tails outbox and publishes, marking records sent
// 3. Relay is idempotent — duplicate publishes are safe
```

---

## R4 — Notification effect before all durable effects commit

**Pattern:** Email, SMS, push, or outbound webhook fired before all other
effects in the saga have committed. Notifications are irreversible.

**Signatures to flag:**
```
await smtp.send(confirmationEmail)
await db.save(booking)            // confirmation sent for a booking that may not persist

await twilio.sendSMS(confirmationText)
await stripe.charge(amount)       // user told confirmed before charge succeeds
```

**Severity:** HIGH. Notifications must always be last.

**Correction:**
```
// Always last — after all durable effects commit
await db.save(booking)
await stripe.charge(amount)
await smtp.send(confirmationEmail)  // last

// If post-notification failure is a concern, add saga checkpoint:
await sagaLog.checkpoint('charged')
await smtp.send(...)
await sagaLog.checkpoint('notified')
// Recovery process can re-send idempotently (dedup by bookingId)
```

---

## R5 — Financial/ledger effect without explicit compensation step

**Pattern:** A charge, credit, or ledger entry has no compensation defined.
For double-entry systems, compensation is a new counter-entry, not a delete.

**Signatures to flag:**
```
await stripe.charge(amount)
// ... subsequent step fails — no stripe.refund() in error path

await ledger.append({ account, amount, type: 'credit' })
// ... subsequent step fails — no counter-entry in error path
```

**Severity:** CRITICAL. Financial inconsistency has regulatory dimensions.

**Correction:**
```
// Charge with explicit refund path
const charge = await stripe.charge(amount)
try {
  await db.save(order)
} catch (e) {
  await stripe.refund(charge.chargeId)  // explicit, named
  throw e
}

// Ledger — compensation is a new append, never a delete
const entry = await ledger.append({ account, amount, type: 'credit' })
try {
  await downstreamEffect()
} catch (e) {
  await ledger.append({
    account, amount, type: 'debit',
    compensates: entry.id              // link for audit trail
  })
  throw e
}
```

---

## R6 — No pivot defined in a multi-step saga

**Pattern:** Three or more effects with no structural boundary between
compensatable effects and committed-to-forward effects. Recovery strategy
cannot be reasoned about mechanically.

**Heuristic:** If you cannot answer "at what point in this function is it too
late to roll back?" — the pivot is undefined.

**Severity:** HIGH.

**Correction:**
```
async function processOrder(order) {
  // === BACKWARD-RECOVERABLE (can compensate) ===
  const reservation = await inventory.reserve(order.items)
  const charge = await stripe.charge(order.total)

  // === PIVOT — forward-only past this point ===
  await db.save({ ...order, status: 'confirmed', chargeId: charge.id })

  // === POST-PIVOT (must complete; retry until done) ===
  await kafka.publish('order.confirmed', order)
  await smtp.send(confirmationEmail(order))
}

// In a saga framework (Temporal, Restate, Golem):
// Pivot = point after which compensations are no longer registered
// and the workflow continues with retry-until-success semantics.
```

---

## R7 — Cross-service saga with no saga log or correlation ID

**Pattern:** Operation spans two or more services with no shared correlation ID
and no persisted saga state. A crash mid-flight leaves no recovery surface.

**Signatures to flag:**
```
// Service A:
await serviceB.createUser(userData)
await serviceC.sendWelcomeEmail(userData.email)
// No saga ID, no state persistence

// Consumer:
async function handleOrderCreated(event) {
  await db.save(order)
  await serviceC.http.post('/ship', order)
  // No correlation ID on serviceC call
}
```

**Severity:** HIGH.

**Correction:**
```
const sagaId = generateSagaId()   // stable key, derived from business key preferred

await sagaLog.begin(sagaId, 'order-fulfillment')
await serviceB.createUser({ ...userData, sagaId })
await sagaLog.checkpoint(sagaId, 'user-created')
await serviceC.sendWelcomeEmail({ email: userData.email, sagaId })
await sagaLog.checkpoint(sagaId, 'email-sent')
await sagaLog.complete(sagaId)

// Recovery: query sagaLog for in-flight sagas older than threshold → resume from checkpoint
```

---

## R8 — Distributed cache write as sole system of record

**Pattern:** A write to Redis, Ignite, or Hazelcast is the primary record of a
business state change with no durable DB backing. Cache eviction or restart
silently loses the state.

**Signatures to flag:**
```
await redis.set(`inventory:${sku}`, newCount)
// No corresponding DB write

await ignite.put('seatLock', { seatId, userId })
await stripe.charge(amount)
// If Ignite is unavailable on recovery, lock state is gone
```

**Severity:** HIGH if cache is sole record; MEDIUM if DB is source of truth
with reliable cache-invalidation.

**Correction:**
```
// Write to durable store first; cache is derivative
await db.update('inventory', { sku, count: newCount })
await redis.set(`inventory:${sku}`, newCount)

// Cache-aside pattern:
// Read:  cache miss → DB read → cache populate
// Write: DB write → cache invalidate (not update)
```

---

## Scholarly references

- Garcia-Molina & Salem (1987). "Sagas." *ACM SIGMOD Record* 16(3).
  https://dl.acm.org/doi/10.1145/38713.38742
  *Defines the saga, compensating transactions, and the pivot transaction.*

- Helland (2007). "Life beyond Distributed Transactions." *CIDR 2007*.
  https://ics.uci.edu/~cs223/papers/cidr07p15.pdf
  *Trust-boundary framing; ledger effects as append-only.*

- Helland (2012). "Idempotence is not a medical condition." *CACM* 55(5).
  https://queue.acm.org/detail.cfm?id=2187821
  *Idempotence as the core safety property for retry-based recovery.*

- Gray & Reuter (1992). *Transaction Processing: Concepts and Techniques.* Morgan Kaufmann.
  *Do-undo-redo protocol; real operations; compensation semantics.*

- Hohpe & Woolf (2003). *Enterprise Integration Patterns.* Addison-Wesley.
  Idempotent Receiver: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  Transactional Client: https://www.enterpriseintegrationpatterns.com/patterns/messaging/TransactionalClient.html

- Daraghmi et al. (2022). "Enhancing Saga Pattern..." *Applied Sciences* 12(12), 6242.
  https://doi.org/10.3390/app12126242
  *Peer-reviewed naming of the isolation gap as a structural defect.*

---

## Output format

For each finding:

```
SAGA-SMELL [SEVERITY]
Rule: R<N> — <rule name>
Location: <file>:<lines> in <function>
Effects:
  - Effect 1: <type> — <description>
  - Effect 2: <type> — <description>
Missing: <what compensation/idempotency/ordering element is absent>
Pivot defined: YES | NO | UNCLEAR
ACH confidence: CONFIRMED | UNCERTAIN | POSSIBLE
Competing hypotheses: <list only when confidence is UNCERTAIN or POSSIBLE, with the winning alternative and the evidence that supports it>
To confirm: <only when UNCERTAIN or POSSIBLE — what additional evidence would resolve the ambiguity>
Correction: <specific changes needed, referencing the correction template>
```

When confidence is UNCERTAIN, prefix the header line: `⚠ POSSIBLE SAGA-SMELL [SEVERITY]`
and reduce severity by one tier in the summary count.

After all findings:

```
SAGA SMELL SUMMARY
Total: N (CRITICAL: n, HIGH: n, MEDIUM: n, LOW: n)
Unprotected operations: <list>
Recommended actions: <ordered by severity>
```

## Severity scale

| Severity | Meaning | Action |
|---|---|---|
| CRITICAL | Financial, legal, or data-loss impact | Block merge |
| HIGH | Persistent inconsistency under realistic failures | Block merge |
| MEDIUM | Inconsistency possible but bounded or detectable | Fix before release |
| LOW | Compensation exists but is fragile | Next iteration |

## Scope

**Apply to:** Functions performing more than one I/O call; event consumers that
call another service after a DB write; payment, booking, registration, and
fulfilment flows; any function named `process*`, `handle*`, `fulfill*`,
`complete*`, `submit*`.

**Skip:** Pure reads with no side effects; single-effect functions; code fully
wrapped by a durable execution framework (Temporal, Restate, Golem) where
compensation is enforced by the runtime.
