# Profiling the app (`in_248` to `in_253`)

Scripts used to find what is slow or grows, kept so they can be run again. They drive the real app in a headless browser, so they need Playwright with Chromium (not a dependency of the project:
`npm i -D playwright` somewhere outside `app/`, or use an environment that has it) and the app running: `cd app && npx vite --port 5199`.

| script | what it does |
| --- | --- |
| `hunt.cjs <fixture>` | orbit, pan, zoom, hover, a body selected, and every operation open (Move to Copy), each with the frame times and the three functions the time went in. |
| `hunt3.cjs <fixture> [unextrude]` | real mouse drags: a sketch corner (with `unextrude`, the extrusion is taken out so the sketch shows), or the arrow of a face. |
| `browsermem.cjs <fixture> [ms]` | sixty edits of the first extrusion's depth, and the whole browser's memory after every ten. |
| `cpuprofile_summary.py [dir]` | the self and inclusive times in a `node --cpu-prof` profile (run a test or script with `node --cpu-prof --cpu-prof-dir=. x.test.ts`). |

Fixtures are in `app/test/fixtures` (`FIXTURES=` to use another folder, `URL=` for another address). The numbers each run gave, and what was done about them, are in handoffs 224 to 231.

Method that worked: reproduce in the browser with a model that is slow, read the self time of the profile, fix the top function, and check the result is the same (hash the derived faces, or the kernel's faces, edges and volume, before and after).
