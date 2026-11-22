---
id: q_kernel_patching
kind: question
status: open
origin: ai-unreviewed
human_input: in_1543, in_1544
date: 2026-11-22
depends_on:
  - inv_kernel_boundary: whatever is done about a kernel fault is done inside the one kernel file
---
# Do we patch the kernel (OpenCASCADE) when the stress run finds a fault in it?

**Recommendation (not decided): not for what has been found so far; work around it in `kernel.ts`, and patch only when no workaround exists.** We can build our own copy of OpenCASCADE (the old app already ships one with three more symbols, `docs/licenses.md`), but a patch means keeping a source fork, the build tools and a 25 MB file, under the LGPL-2.1 obligations.

- A refusal of the kernel's algorithms (a fillet that cannot be made at that size, a shell that is not a valid solid, a cut that fails) is a limit, not a fault: the engine checks the result and refuses in words, or does the work itself (the pointed rod end, the varying fillet).
- The memory leak (about 3 MB a build, an abort in the end) is handled by restarting the host; the stress run does the same, in chunks of fresh processes.
- A wrong solid that passes the validity check gets a check of our own first.
- A crash inside the kernel with no way to avoid the call: first another OpenCASCADE version, then a report upstream, then a patch.
- The planned kernel of our own is the lasting answer to these limits.

## Rationale

Kept open: it is the AI's recommendation and the human has asked, not decided. Nothing depends on it.
