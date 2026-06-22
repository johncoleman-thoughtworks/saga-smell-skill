# saga-smell

A Claude Code skill that detects saga smells — sequences of two or more
observable effects (DB writes, message publishes, HTTP calls, notifications,
ledger mutations, cache writes, etc.) that constitute one logical business
operation but lack compensation, idempotent retry, or rollback paths.

Grounded in Garcia-Molina & Salem (1987), Helland (2007, 2012), Gray & Reuter
(1992), and Hohpe & Woolf (2003).

---

## What it detects

Eight detection rules covering the full surface area of multi-effect failure:

| Rule | Name | Severity |
|------|------|----------|
| R1 | Multi-effect function with no compensation block | CRITICAL / HIGH |
| R2 | Non-idempotent effect with no idempotency key | HIGH |
| R3 | Message published before DB commit | CRITICAL |
| R4 | Notification before all durable effects commit | HIGH |
| R5 | Financial/ledger effect without explicit compensation | CRITICAL |
| R6 | No pivot defined in a multi-step saga | HIGH |
| R7 | Cross-service saga with no saga log or correlation ID | HIGH |
| R8 | Distributed cache write as sole system of record | HIGH / MEDIUM |

---

## Installation

### Option A — project skill (recommended for teams)

Adds the skill to a single repository. Committed to version control so all
team members and CI have it automatically.

```bash
# From your project root
mkdir -p .claude/skills
cp -r /path/to/saga-smell/skills/saga-smell .claude/skills/

# Or clone directly into your project
git clone https://github.com/<you>/saga-smell /tmp/saga-smell
cp -r /tmp/saga-smell/skills/saga-smell .claude/skills/
```

The skill is now available to everyone working in this repository.

### Option B — user skill (available in all your projects)

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/saga-smell/skills/saga-smell ~/.claude/skills/
```

### Option C — install script (both options via flag)

```bash
curl -fsSL https://raw.githubusercontent.com/<you>/saga-smell/main/install.sh | bash
# Or project-scoped:
curl -fsSL https://raw.githubusercontent.com/<you>/saga-smell/main/install.sh | bash -s -- --project
```

### Option D — slash command only (no skill infrastructure needed)

If you want the `/saga-smell` command without the full skill setup:

```bash
mkdir -p .claude/commands
cp /path/to/saga-smell/.claude/commands/saga-smell.md .claude/commands/
```

---

## Usage

### In Claude Code

```
# Analyse a specific file
/saga-smell src/services/orderService.ts

# Analyse a function by name
/saga-smell the processPayment function in checkout.ts

# Analyse the current diff
/saga-smell the current diff

# Triggered automatically when you ask:
"review this for saga smells"
"check the compensation logic in this handler"
"distributed transaction review of paymentService"
```

### In CI (Anthropic API)

Prepend the skill content to your system prompt, then pass the diff as the
user message:

```bash
SKILL=$(cat skills/saga-smell/SKILL.md)
RULES=$(cat skills/saga-smell/references/detection-rules.md)
DIFF=$(git diff origin/main)

curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 4096,
    "system": "'"$SKILL\n\n$RULES"'",
    "messages": [{"role": "user", "content": "'"$DIFF"'"}]
  }'
```

A GitHub Actions example is in `.github/workflows/saga-smell.yml`.

### As an MCP tool

Use the `description` from `skills/saga-smell/SKILL.md` frontmatter as your
tool description. Input schema:

```json
{
  "code":     "string — the code or diff to analyse",
  "language": "string — e.g. TypeScript, Rust, Python",
  "context":  "string (optional) — service name, bounded context, or architectural notes"
}
```

---

## Repository layout

```
saga-smell/
├── skills/
│   └── saga-smell/
│       ├── SKILL.md                  # Claude Code skill entry point
│       └── references/
│           └── detection-rules.md    # Full rules, loaded dynamically
├── .claude/
│   └── commands/
│       └── saga-smell.md             # Slash command wrapper
├── .github/
│   └── workflows/
│       └── saga-smell.yml            # CI integration example
├── install.sh                        # One-line installer
├── README.md
└── LICENSE
```

---

## Contributing

Pull requests welcome for:

- New detection rules (open an issue first to discuss scope)
- Language-specific code signatures (Rust, Go, Python, Kotlin examples)
- Framework-specific guidance (Temporal, Restate, Axon, MassTransit)
- CI integration examples beyond GitHub Actions

Rules must cite a scholarly or primary source in the reference section.
See `skills/saga-smell/references/detection-rules.md` for the format.

---

## References

- Garcia-Molina, H. & Salem, K. (1987). "Sagas." *ACM SIGMOD Record* 16(3).
  https://dl.acm.org/doi/10.1145/38713.38742

- Helland, P. (2007). "Life beyond Distributed Transactions." *CIDR 2007*.
  https://ics.uci.edu/~cs223/papers/cidr07p15.pdf

- Helland, P. (2012). "Idempotence is not a medical condition." *CACM* 55(5).
  https://queue.acm.org/detail.cfm?id=2187821

- Gray, J. & Reuter, A. (1992). *Transaction Processing: Concepts and Techniques.*
  Morgan Kaufmann.

- Hohpe, G. & Woolf, B. (2003). *Enterprise Integration Patterns.* Addison-Wesley.
  https://www.enterpriseintegrationpatterns.com

- Daraghmi, E. et al. (2022). "Enhancing Saga Pattern..." *Applied Sciences* 12(12).
  https://doi.org/10.3390/app12126242

---

## License

MIT
