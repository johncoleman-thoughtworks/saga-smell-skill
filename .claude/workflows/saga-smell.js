export const meta = {
  name: 'saga-smell',
  description: 'Exhaustive saga smell scan — fan-out by module with adversarial clean-file verification',
  whenToUse: 'Use for whole-codebase scans. For a single file or pasted code block, /saga-smell is faster.',
  phases: [
    { title: 'Enumerate', detail: 'Find all source files and group by module' },
    { title: 'Analyze', detail: 'One agent per module reads every file in the module' },
    { title: 'Verify', detail: 'Skeptic agent re-reads all infrastructure + clean files from any module that had findings' },
    { title: 'Synthesize', detail: 'Merge, deduplicate, and rank all confirmed findings' },
  ],
}

// args: optional path to scan (default '.')
const targetPath = (typeof args === 'string' && args.trim()) ? args.trim() : '.'

// ── Schemas ──────────────────────────────────────────────────────────────────

const MODULE_SCHEMA = {
  type: 'object',
  properties: {
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          isInfrastructure: { type: 'boolean' },
        },
        required: ['name', 'files', 'isInfrastructure'],
      },
    },
    totalFiles: { type: 'number' },
    skippedFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, reason: { type: 'string' } },
        required: ['file', 'reason'],
      },
    },
  },
  required: ['modules', 'totalFiles', 'skippedFiles'],
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    moduleName: { type: 'string' },
    filesRead: { type: 'array', items: { type: 'string' } },
    filesSkipped: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, reason: { type: 'string' } },
        required: ['file', 'reason'],
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          location: { type: 'string' },
          functionName: { type: 'string' },
          effects: { type: 'array', items: { type: 'string' } },
          missing: { type: 'string' },
          pivotDefined: { type: 'string', enum: ['YES', 'NO', 'UNCLEAR'] },
          achConfidence: { type: 'string', enum: ['CONFIRMED', 'UNCERTAIN', 'POSSIBLE'] },
          competingHypothesis: { type: 'string' },
          correction: { type: 'string' },
        },
        required: ['rule', 'severity', 'location', 'functionName', 'effects', 'missing', 'achConfidence'],
      },
    },
    cleanFiles: { type: 'array', items: { type: 'string' } },
    infrastructureDefects: { type: 'array', items: { type: 'string' } },
  },
  required: ['moduleName', 'filesRead', 'filesSkipped', 'findings', 'cleanFiles'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    challengedFindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          originalLocation: { type: 'string' },
          verdict: { type: 'string', enum: ['CONFIRMED', 'DOWNGRADE', 'DISMISS'] },
          reason: { type: 'string' },
          revisedSeverity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        },
        required: ['originalLocation', 'verdict', 'reason', 'revisedSeverity'],
      },
    },
    newFindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          location: { type: 'string' },
          functionName: { type: 'string' },
          effects: { type: 'array', items: { type: 'string' } },
          missing: { type: 'string' },
          achConfidence: { type: 'string', enum: ['CONFIRMED', 'UNCERTAIN', 'POSSIBLE'] },
          correction: { type: 'string' },
        },
        required: ['rule', 'severity', 'location', 'functionName', 'effects', 'missing', 'achConfidence'],
      },
    },
  },
  required: ['challengedFindings', 'newFindings'],
}

// ── Rules reference (condensed — agents apply the full ACH protocol) ──────────

const RULES_REF = `
SAGA SMELL DETECTION RULES
===========================

An observable effect is any action crossing a trust boundary that the runtime
cannot automatically roll back: DB writes, Kafka/RabbitMQ publishes, HTTP calls
to remote services, Redis/cache writes treated as source-of-truth, SMTP/SMS/push
notifications, financial ledger mutations, IAM/permission mutations, audit log
appends, third-party webhooks.

A saga smell exists when ALL four conditions hold:
1. Two or more observable effects in the same named operation
2. No distributed transaction, saga orchestrator, or 2PC wraps all effects
3. At least one effect is non-idempotent
4. A failure between effects leaves durably committed state violating domain invariants

Rules (flag when pattern matches + ACH evaluation confirms):
R1: Multi-effect function with no compensation block [HIGH / CRITICAL if financial]
R2: Non-idempotent effect with no idempotency key [HIGH]
R3: Message published before DB commit [CRITICAL — most common]
R4: Notification before all durable effects commit [HIGH]
R5: Financial/ledger effect with no compensation [CRITICAL]
R6: No pivot defined in a 3+ step saga [HIGH]
R7: Cross-service saga with no saga log or correlation ID [HIGH]
R8: Distributed cache write as sole system of record [HIGH if sole; MEDIUM if DB is source-of-truth]

ACH competing hypotheses to evaluate before flagging:
- H_framework: Temporal/Restate/Golem/Step Functions wraps all effects at higher scope
- H_outbox: Atomic DB + outbox write in place; relay handles publication
- H_idempotent: All effects designed for safe retry without compensation
- H_step: This is a deliberate saga step; caller/orchestrator coordinates compensation
- H_2pc: XA/2PC coordinator wraps all effects

If H_smell wins: flag CONFIRMED at full severity.
If a competing hypothesis wins: flag UNCERTAIN at one severity tier lower.
`

// ── Phase 1: Enumerate ────────────────────────────────────────────────────────

phase('Enumerate')

const fileMap = await agent(
  `You are enumerating source files for a saga smell scan.

Target path: ${targetPath}

Use the Glob and Read tools to:
1. Find ALL source files matching: **/*.java, **/*.kt, **/*.scala, **/*.go,
   **/*.ts, **/*.tsx, **/*.js, **/*.py, **/*.cs, **/*.rb, **/*.rs
   (use whichever extensions are present in the codebase)
2. Group files by module. A module is a top-level package directory or a
   meaningful subdirectory that represents a coherent functional area.
3. Mark isInfrastructure: true for any module whose files implement shared
   messaging transport, event dispatch, async wrappers, or cross-cutting
   interceptor/middleware chains — code where a defect would silently
   propagate to every caller. Base this on reading the file content, not
   just the filename.
4. For files that are clearly skippable (pure type or interface definitions,
   data-only structures with no methods, generated code, constant
   declarations), list them in skippedFiles with a reason. You MUST read
   a file before marking it skippable.
   You MUST read a file before marking it skippable — do not decide by name alone.

Return the complete structured result.`,
  { label: 'enumerate', phase: 'Enumerate', schema: MODULE_SCHEMA }
)

log(`Enumerated ${fileMap.totalFiles} files across ${fileMap.modules.length} modules (${fileMap.skippedFiles.length} pre-classified skippable)`)

const infraModules = fileMap.modules.filter(m => m.isInfrastructure)
const domainModules = fileMap.modules.filter(m => !m.isInfrastructure)

log(`Infrastructure modules: ${infraModules.map(m => m.name).join(', ') || 'none'}`)
log(`Domain modules: ${domainModules.map(m => m.name).join(', ') || 'none'}`)

// ── Phase 2: Analyze — infrastructure first, then domain in parallel ──────────

phase('Analyze')

const ANALYSIS_PROMPT = (mod) => `You are performing a saga smell analysis on the "${mod.name}" module.

${RULES_REF}

Files to analyze (READ EVERY ONE — do not skip based on filename):
${mod.files.map(f => `  - ${f}`).join('\n')}

For each file:
1. Read it fully.
2. Identify all functions/methods performing 2+ observable effects.
3. Apply the detection rules and ACH protocol to each candidate.
4. Classify the file as having findings OR as clean.

IMPORTANT — infrastructure files: if this module is marked infrastructure
(publishers, consumers, interceptors, middleware), check whether defects here
would amplify callers. Note any such infrastructure defects in infrastructureDefects[].

Return structured findings. For each finding include the exact file:line
location, the function name, the list of effects, what compensation/idempotency
is missing, your ACH confidence, and a concrete correction.`

// Run infrastructure modules first (sequentially to avoid race on shared state notes),
// then domain modules in parallel via pipeline.
const infraResults = []
for (const mod of infraModules) {
  const result = await agent(ANALYSIS_PROMPT(mod), {
    label: `analyze:${mod.name}`,
    phase: 'Analyze',
    schema: ANALYSIS_SCHEMA,
  })
  if (result) {
    infraResults.push(result)
    const count = result.findings.length
    log(`${mod.name} [infra]: ${count} finding${count !== 1 ? 's' : ''}`)
    if (result.infrastructureDefects && result.infrastructureDefects.length > 0) {
      log(`  ⚠ Infrastructure defects that amplify callers: ${result.infrastructureDefects.join('; ')}`)
    }
  }
}

const domainResults = await pipeline(
  domainModules,
  mod => agent(ANALYSIS_PROMPT(mod), {
    label: `analyze:${mod.name}`,
    phase: 'Analyze',
    schema: ANALYSIS_SCHEMA,
  }),
)

const allAnalysisResults = [...infraResults, ...domainResults.filter(Boolean)]

const totalRaw = allAnalysisResults.reduce((n, r) => n + r.findings.length, 0)
log(`Raw findings before verification: ${totalRaw}`)

// ── Phase 3: Adversarial verification ────────────────────────────────────────
// One skeptic agent per module that had findings + all infrastructure modules.

phase('Verify')

// Modules to verify: those with findings, plus all infra modules regardless
const modulesToVerify = allAnalysisResults.filter(
  r => r.findings.length > 0 || infraModules.some(m => m.name === r.moduleName)
)

const verifyResults = await pipeline(
  modulesToVerify,
  (moduleResult) => {
    const modDef = fileMap.modules.find(m => m.name === moduleResult.moduleName)
    const allFiles = modDef ? modDef.files : moduleResult.filesRead

    return agent(
      `You are an adversarial reviewer for the "${moduleResult.moduleName}" module saga smell analysis.

${RULES_REF}

The previous analysis agent reported these findings:
${JSON.stringify(moduleResult.findings, null, 2)}

It also classified these files as clean:
${moduleResult.cleanFiles.join('\n')}

Your job:
1. Read every file in this module (list below) independently.
2. For each reported finding: try to REFUTE it. Is there compensating logic
   the previous agent missed? Is a framework handling it? Is this actually
   a saga step with an orchestrator? Verdict: CONFIRMED / DOWNGRADE / DISMISS.
3. For each clean file: read it looking specifically for saga smells the
   previous agent may have missed. This is especially important for
   infrastructure files.

All files in this module (read every one):
${allFiles.map(f => `  - ${f}`).join('\n')}

Default to CONFIRMED unless you find concrete compensating evidence.
Return structured results.`,
      {
        label: `verify:${moduleResult.moduleName}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
      }
    )
  }
)

// ── Phase 4: Synthesize ───────────────────────────────────────────────────────

phase('Synthesize')

// Build a compact summary of all evidence for the synthesis agent
const evidenceSummary = allAnalysisResults.map(r => ({
  module: r.moduleName,
  filesRead: r.filesRead,
  findings: r.findings,
  cleanFiles: r.cleanFiles,
  infrastructureDefects: r.infrastructureDefects || [],
}))

const verificationSummary = verifyResults.filter(Boolean).map((v, i) => ({
  module: modulesToVerify[i].moduleName,
  challengedFindings: v.challengedFindings,
  newFindings: v.newFindings,
}))

const report = await agent(
  `You are synthesizing the final saga smell report for a whole-codebase scan.

${RULES_REF}

RAW ANALYSIS RESULTS (one entry per module):
${JSON.stringify(evidenceSummary, null, 2)}

ADVERSARIAL VERIFICATION RESULTS:
${JSON.stringify(verificationSummary, null, 2)}

Instructions:
1. Apply verification verdicts: CONFIRMED → keep at original severity,
   DOWNGRADE → reduce severity by one tier, DISMISS → remove.
2. Add new findings surfaced by the verification pass.
3. Deduplicate: if the same function appears in both analysis and verification
   findings, keep the higher-confidence version.
4. Group findings by Root Cause Pattern:
   Pattern A — DB commit + out-of-transaction publish (most common)
   Pattern B — Exception swallowed / adapter silently drops
   Pattern C — Remote call inside transaction / non-idempotent retry
   Pattern D — Missing transaction boundary / partial saves
   Pattern E — Other
5. Output the full report in the standard saga smell format.

Standard finding format:
  SAGA-SMELL [SEVERITY]
  Rule: R<N> — <rule name>
  Location: <file>:<lines> in <function>
  Effects:
    - Effect 1: <type> — <description>
    - Effect 2: <type> — <description>
  Missing: <what is absent>
  Pivot defined: YES | NO | UNCLEAR
  ACH confidence: CONFIRMED | UNCERTAIN | POSSIBLE
  Correction: <specific fix>

After all findings output:
  ROOT CAUSE PATTERNS
  [group findings by pattern, note which single systemic fix covers each group]

  SAGA SMELL SUMMARY
  Total: N (CRITICAL: n, HIGH: n, MEDIUM: n, LOW: n)
  Files scanned: N
  Files read: N
  Recommended actions: [ordered by severity and leverage]`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return report