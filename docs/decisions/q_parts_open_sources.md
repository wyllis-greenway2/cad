---
id: q_parts_open_sources
kind: question
status: open
origin: ai-unreviewed
human_input: in_688, in_689, in_690
date: 2026-11-17
depends_on:
  - dec_parts_library: which sources can fill the official library, and on what licence, decides how fast it grows
alternative_to:
---
# Which open sources can fill the library, and what a public layer needs

**Asked (`in_688`); the human said to accept it (`in_690`), but a question has no accepted state: it stays open until the points below are answered.** could open source libraries get a lot of parts quickly, and should users add to a public library so it grows itself?

**Not read from a source: from memory, to verify before use** (`docs/licenses.md` first; no GPL or AGPL for code we use):
- `cq_warehouse` and `bd_warehouse`: fasteners, bearings, threads, sprockets and chains as code; believed Apache-2.0; Python, so a rewrite in TypeScript, not an import.
- BOLTS: an open library of standard parts; licences differ by collection.
- FreeCAD's Fasteners workbench: believed LGPL; no code reuse under our rules; at most a hint at which sizes to cover.
- The KiCad 3D model library: believed CC-BY-SA 4.0 with an exception for use in designs; mostly electronics.
- Standards (ISO, DIN, ASME): dimensions are facts, the documents are copyrighted; each table needs a cited source, as for every official number.

**To decide:** (1) which of these the AI should read and check the licences of; (2) whether any is worth the effort over writing the fastener and bearing tables ourselves from cited sources; (3) when a public layer opens and what it needs: a licence on every entry, a verified or unverified mark, and user entries as data (family or interface entries) where possible, not arbitrary models.

## Rationale

Parts are the largest body of data the program would hold, and a wrong dimension on a fastener costs a failed part. The licence of each source decides whether we can use it at all, so it is checked before anything is built on it.
