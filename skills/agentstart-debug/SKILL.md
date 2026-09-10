---
name: agentstart-debug
description: >-
  Debug with runtime evidence instead of guesswork. Use when a bug,
  regression, crash, flaky behavior, or "it worked before" report needs a root
  cause: form ranked falsifiable hypotheses, instrument the code with
  lightweight NDJSON logs, have the issue reproduced, confirm or reject each
  hypothesis against the captured evidence, and only fix once the logs prove
  the cause. Also use when a previous fix attempt didn't work or when the
  failure can't be reproduced from reading the code alone.
---

# Debug Mode

Find the root cause of a bug with runtime evidence, then fix it. Reading code produces guesses;
only captured runtime behavior can confirm them. Never patch on speculation — a fix that isn't
backed by evidence usually papers over a symptom and the bug returns.

The loop: **hypothesize → instrument → reproduce → analyze → (repeat until proven) → fix → verify
→ clean up.**

## 1. Understand the failure

Before touching code, pin down the observable facts:

- What exactly happens, and what was expected instead? Get the verbatim error, wrong value, or
  broken behavior — not a paraphrase.
- When did it start? What changed around then (commit, dependency bump, config, environment)?
- Is it deterministic or intermittent? Which platform, host, or input triggers it?
- How is it reproduced? If you can trigger it yourself (a command, a request, a script), prefer
  that; otherwise the user will reproduce while your instrumentation records.

If the report is too vague to falsify anything, ask for the missing observation first — one
precise question beats a speculative patch.

## 2. Form ranked hypotheses

Write down 2–5 competing hypotheses about the root cause. Each one must be:

- **Specific** — names the code path, state, or interaction at fault ("the cache returns a stale
  entry after host switch because the key omits the host id"), not "something with caching".
- **Falsifiable** — you can name the log line that would confirm or reject it.
- **Ranked** — order by likelihood given the evidence so far; instrument the top ones first.

Keep the list in your working notes with an id per hypothesis (`H1`, `H2`, …). Every log event
you add references the hypothesis it tests.

## 3. Instrument with NDJSON logs

Add lightweight, unmistakably-temporary logging at the decision points that discriminate between
hypotheses. Rules:

- **One JSON object per line** (NDJSON), appended to a file under `.agentstart/debug/` at the
  repository root — e.g. `.agentstart/debug/stale-cache.ndjson` — creating the directory if needed.
  `.agentstart/` is AgentStart-reserved workspace state and must never be committed. Build the path with the
  language's path-join facility rather than string concatenation with a hardcoded separator.
- **Tag every line** with a fixed marker so lines are greppable and removal is mechanical:

```json
{"tag":"AGENTSTART_DEBUG","h":"H2","at":"cache.get","key":"...","hostId":"...","hit":true,"ts":1712345678901}
```

- Log **inputs, decisions, and state transitions** — the values that distinguish hypotheses —
  not "entered function". Include identifiers (ids, keys, lengths, enum states), not entire
  payloads; never log secrets, tokens, or file contents.
- **Do not change behavior.** Instrumentation must be pure observation: no early returns, no
  added awaits that reorder races (when timing is suspect, prefer counters and timestamps over
  heavy logging), no swallowed errors.
- Instrument the top-ranked hypotheses in one pass so a single reproduction can settle several
  at once.

## 4. Reproduce and capture

- If you can reproduce it yourself, do it and capture the output.
- Otherwise, tell the user exactly what to do ("click X, then Y, then send me the contents of
  the log"), and wait for the artifacts. Continue only when the evidence is available.
- For intermittent bugs, ask for the failing run *and* a passing run — the diff between the two
  traces is often the answer.

## 5. Analyze against the hypotheses

Read the captured NDJSON and give a verdict per hypothesis: **confirmed**, **rejected**, or
**inconclusive** — citing the specific log lines. Then:

- All rejected or inconclusive → refine: demote rejected hypotheses, add sharper events for the
  survivors or form new hypotheses from what the trace revealed, and loop back to step 3.
- One confirmed → state the root cause in one sentence, naming file and mechanism. If you cannot
  write that sentence, you don't have it yet — keep looping.

Change one variable per iteration. If you edit code and instrumentation at the same time, you no
longer know which change explained the new trace.

## 6. Fix, verify, clean up

- Make the **smallest fix that removes the proven cause**. No drive-by refactors — they blur the
  verification.
- Re-run the same reproduction with instrumentation still in place. The verdict flips only when
  the previously-failing trace now shows correct behavior on the exact lines that confirmed the
  bug.
- Then **remove every instrumentation line** (grep for the marker tag) and delete the session's
  log files under `.agentstart/debug/`.
  Committed code must contain zero debug logging from this session.
- Report honestly: root cause, the evidence that proved it, the fix, and how verification was
  performed. If the fix is unverified (e.g. the user hasn't reproduced yet), say so plainly.

## Boundaries

- Never claim a root cause without a log line that proves it.
- Never fix and instrument in the same iteration; never test two hypotheses with one ambiguous
  event.
- Never leave the marker tag, temp files, or debug flags in the final change.
- Never log secrets or user content; identifiers and shapes are enough.
- If three iterations produce no confirmed hypothesis, step back and re-derive hypotheses from
  the trace instead of adding more logging to the old ones.
