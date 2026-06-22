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
version: 1.1.0
author: qbyteconsulting
license: MIT
allowed-tools: Read, Grep, Glob
---

# Saga smell detector

You are performing a saga smell analysis. Read the detection rules and
reference material, then apply them to the target code.

## What is a saga smell?

A saga smell is a structural defect in a multi-effect operation where at least
one effect has no compensation, idempotent retry, or rollback path if a
subsequent step fails — leaving the system permanently inconsistent.

**Observable effect** — any action that crosses a trust boundary or mutates
state beyond the current process heap that the runtime cannot automatically
roll back. Full taxonomy and all eight detection rules are in the reference
file. Load it now:

!`cat "$SKILL_DIR/references/detection-rules.md"`

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
Correction: <specific changes needed, referencing the correction template>
Reference: <citation>
```

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
