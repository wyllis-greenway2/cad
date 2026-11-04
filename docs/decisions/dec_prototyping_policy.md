---
id: dec_prototyping_policy
kind: decision
status: accepted
origin: human
human_input: in_011
date: 2026-11-04
---
# Prototype freely, gate production code

Rough, fast, throwaway prototyping needs no prior decision and can be discarded and retried. It lives
under `prototypes/` and is never imported by production code. Production code needs an accepted entry
behind it. Prototype results are what settle open questions such as the kernel choice (`dec_kernel_hybrid`).

## Rationale
The human is comfortable prototyping quickly and tossing what does not work (`in_011`). Open questions
about the kernel, grid and references need evidence from working code, not more discussion. The AI kept a
gate on production code, which is a softer version of what the human suggested (tossing the rule
entirely); the human can remove it.
