# CAD Software Blueprint
## Complete Design Reference Document

---

## 1. Project Vision

A parametric solid modeler targeting the serious independent creator and functional 3D printing community. Stable, fast, approachable, fairly priced. Solves the real problems of FreeCAD without the complexity and cost of Fusion 360 or SolidWorks.

**The one sentence pitch:**
A CAD tool that works reliably, feels approachable, costs $5/month, and never holds features hostage.

**What it is not:**
- Not a mesh modeler or sculpting tool (that's Blender)
- Not an enterprise CAD system (that's SolidWorks)
- Not an AI-only generator (AI is a feature, not the product)
- Not a general NURBS surface modeler (that's Rhino)

---

## 2. Target User

**Primary:** Serious independent creators in the 3D printing community. People who own a Bambu Lab, Prusa, or Creality printer and want to design functional parts — not just download premade models.

**Their workflow:**
- Design enclosures, mounts, brackets, jigs, fixtures
- Work in millimeters with real world dimensions
- Need holes that fit specific bolts
- Care about wall thickness for printability
- Work at tolerances of 0.1mm to 0.5mm typically
- Export STL or 3MF for slicing and printing

**Their current frustrations:**
- FreeCAD crashes constantly and loses work
- Fusion 360 costs $680/year and Autodesk keeps raising prices
- Shapr3D costs $299/year and still lacks basic features like threads after years of requests
- Learning curve of professional tools is 400+ hours
- Free tiers restrict the one thing they actually need — clean STL export

**Secondary:** Indie hardware developers, small product companies, makers who sell what they make. Same frustrations, higher willingness to pay, need STEP export for manufacturing handoff.

**The underserved gap we target:**
Between "free but limited" and "professional but expensive." A missing middle tier around $5-10/month that is genuinely full featured for the functional printing use case.

---

## 3. Market Context

- Global CAD software market approximately $11-13 billion in 2025, growing 5-7% annually
- Bambu Lab's MakerWorld platform alone has 10 million monthly active users
- Entry-level 3D printer market grew 65% year-over-year in 2024
- Autodesk raised Fusion to $680/year generating significant community backlash
- Shapr3D at $299/year has a 3-5 day learning curve vs 400-1200 hours for Fusion
- No tool currently occupies the $5-10/month full-featured position for this community

---

## 4. Pricing Model

**Single tier. Everything included. $5/month or $49/year.**

No feature gating. No artificial restrictions. No hostage pricing.

Free trial — full featured, time limited (14 days).

Rationale:
- Below the psychological threshold where users scrutinize subscriptions
- Dramatically undercuts all competitors
- Makes the positioning statement clear: "we respect you"
- The 3D printing community will promote a fair tool aggressively
- Revenue through volume not extraction

Revenue math:
- 10,000 subscribers = $600,000/year — sustainable small team
- 50,000 subscribers = $3,000,000/year — real company
- 100,000 subscribers = $6,000,000/year — growing company

Both numbers are realistic given the size of the 3D printing community and the strength of the positioning against frustrated Fusion and FreeCAD users.

**Future consideration:** Team tier at $25/month for up to 5 seats. Keep individual pricing permanently at $5/month.

---

## 5. Core Philosophy

**Five principles that govern every design decision:**

**1. The operation graph is the source of truth.**
Geometry is derived output — like a rendered page from database data. The event sequence informs the geometry. Geometry never informs anything. This is the foundational philosophy.

**2. Separate what humans are good at from what computers are good at.**
Humans provide objectives through direct manipulation. Computers fulfill those objectives through math. The system resolves silently wherever possible. The human is interrupted only when genuinely necessary.

**3. Function over form, always.**
Build a robust engine first. Polish comes after correctness. A clean, stable, fast tool beats a beautiful broken one every time.

**4. Variable over hardcoded.**
Every behavioral parameter is configurable. Magic numbers never appear in code. The user can tune the experience. You can change defaults without rewriting logic.

**5. Never box yourself in.**
Clean separation of concerns. Open registries over hardcoded enums. Interfaces between layers. The ability to change any piece without rewriting adjacent pieces.

---

## 6. What This Tool Does — Feature Scope

### Day One Features
- Sketch on the three world planes (XY, XZ, YZ)
- Sketch on any flat face of an existing solid
- Drawing tools: line, rectangle, circle, arc, slot
- Constraints: horizontal, vertical, parallel, perpendicular, coincident, tangent, equal, symmetric
- Dimensions: length, radius, diameter, angle
- Extrude sketch into solid (add or cut)
- Revolve sketch around axis
- Boolean operations: union, subtract, intersect
- Fillet edges (single edge, analytical solution)
- Chamfer edges
- Shell solid (hollow it out)
- Linear pattern
- Circular pattern
- Mirror
- Full STL export (all quality levels, no restrictions)
- Full 3MF export
- STEP export
- STEP import (as reference geometry)
- STL import (as non-editable reference geometry)
- Native JSON file format
- Undo and redo (unlimited)
- Operation history panel
- Basic conflict visualization

### Phase Two Features (post-launch, informed by user feedback)
- Thread library (standard sizes)
- Assembly support (multi-part)
- Slicer preview integration
- AI text-to-model generation
- Variable radius fillets
- Loft between profiles
- Sweep along path
- Advanced import (mesh to solid conversion for simple primitives)

### Explicitly Deferred
- Simulation and FEA
- CAM and toolpath generation
- Rendering and visualization
- BIM and architectural tools
- Mesh sculpting
- Full NURBS organic surface modeling

---

## 7. The Geometry Model

### Grid-Aligned Control Points With Exact Math Between Them

**Control points** — vertices, curve endpoints, sketch points — snap to a grid.

Default grid: 0.01mm (finer than any consumer 3D printer can achieve)
Fine grid: 0.001mm (for precision mechanical work)
Coarse grid: 0.1mm (for exploration)

Grid resolution maps to the tolerance slider. Coarser work uses coarser grid. This is the user's precision declaration, not a fuzzy tolerance.

**Curves and surfaces between control points** are exact mathematical representations — not approximations. A cylinder is a perfect mathematical cylinder. A circle is a perfect mathematical circle. The grid only governs where control points live.

**Why this works for this user:**
- Consumer 3D printers cannot print below 0.05mm accurately
- Grid rounding at 0.01mm is completely imperceptible in final printed parts
- This user's work is overwhelmingly orthogonal — right angles, parallel faces, perpendicular holes
- The rotation problem that breaks grids rarely occurs in functional printing part design

**Coincidence detection** is exact integer comparison of grid coordinates. No floating point ambiguity. No "close enough" fuzzy comparison. Two control points are either at the same grid location or they are not. This eliminates an entire class of geometry errors.

**Example — a sphere:**
- Two control points: center (grid-aligned) and radius endpoint (grid-aligned)
- The surface is a perfect mathematical sphere derived from those two points
- No tessellation in the model representation — only for display

**Example — boolean subtract:**
- The intersection curve between two primitives is computed exactly
- The endpoints of that curve snap to the nearest grid point
- The curves themselves remain exact between those endpoints
- One discrete rounding event, never repeated

### Primitive Surface Fast Path

For this user's geometry — overwhelmingly primitives — fast path closed form solutions:

- Plane/plane intersection → exact line (trivial math)
- Plane/cylinder intersection → exact ellipse (closed form)
- Cylinder/cylinder intersection → computed analytically
- Plane/sphere intersection → exact circle (closed form)
- Plane/cone intersection → conic section (closed form)

These cover 95%+ of boolean operations in functional printing parts. No iterative numerical solving. Fast and exact.

OCCT used as fallback only for genuinely complex NURBS surface intersection. Wrapped behind a clean interface so the operation layer never knows which path was taken.

### Fillet Strategy

Single edge fillet between two flat faces → exact cylindrical surface (trivial, analytical)
Single edge fillet between flat and cylindrical face → analytical solution
Three-edge vertex junction → defer to phase two, fail gracefully with clear message

Covers the vast majority of fillet operations in this user's workflow.

---

## 8. The Operation Layer — Source of Truth

### Core Concept

The operation graph is the model. Geometry is what you get when you compile the graph. The graph is never discarded. Geometry is never saved — always recomputed from the graph.

This is identical in philosophy to source code and compiled binary. You save source code. You compile to binary on demand. You never save the binary as the primary artifact.

### Data Structure

A Directed Acyclic Graph (DAG) of operations.

Each operation node contains:
- Unique ID
- Operation type (registered in operation registry)
- Parameters (typed, validated against schema)
- Dependencies (IDs of operations this one depends on)
- Cache slot (compiled geometry result, invalidated when dependencies change)

```json
{
  "id": "op_003",
  "type": "extrude",
  "params": {
    "profileRef": "op_001",
    "distance": 25.0,
    "direction": "normal",
    "operation": "add"
  },
  "dependsOn": ["op_001"]
}
```

### Incremental Recompilation

When an operation changes, only operations that depend on it (directly or transitively) recompute. Independent branches of the graph are untouched and use cached geometry.

Like a build system (Make, Gradle) — only rebuild what changed.

For a typical 20-50 operation model this means most changes invalidate 3-5 operations. Rebuild is essentially instant.

### Operation Registry

Operations are not hardcoded. They register themselves.

```
registry.register('extrude', {
  schema: { profileRef: 'sketchRef', distance: 'number', direction: 'enum', operation: 'enum' },
  execute: (params, geometryCompiler) → solid,
  validate: (params) → validationResult,
  displayHints: (params) → hints
})
```

Adding a new operation type — threads, loft, sweep — means calling register. No existing code changes. The serializer, history panel, AI adapter, and undo system all work automatically with new types.

### Outcome Constraints

When a user completes an operation that creates a geometric relationship — two faces merge, an edge is filleted, a boolean contact occurs — that relationship is recorded as an outcome constraint on the operation.

If an upstream change invalidates that constraint, the conflict is surfaced visually in the viewport (amber highlight on affected geometry) rather than silently failing or interrupting with a dialog.

The user continues working. They address the conflict when ready.

### Topological Naming — Operation-Owned Deltas

Each operation records exactly what geometry it created, modified, and destroyed:
- **Born** — new geometry that didn't exist before this operation
- **Modified** — existing geometry that changed shape but is the same logical entity
- **Destroyed** — geometry that no longer exists after this operation

References to geometry (for fillets, subsequent operations, etc.) are references to operation deltas not raw geometry indices. "The top face produced by operation 3" not "Face#7."

Stable across rebuilds because operation IDs are stable. The topological naming problem that plagues FreeCAD does not exist in this architecture.

### Undo and Redo

The operation graph is append-only with a cursor. Undo moves the cursor back. Redo moves it forward. No special undo logic needed anywhere else — it falls out of the architecture.

---

## 9. The Geometry Compiler

Not a layer in the traditional sense — a compilation process that sits between the operation layer and display.

Triggered by: operation graph changes
Reads: the affected subgraph of the operation graph
Calls: math library pure functions
Writes: geometry cache
Emits: geometryChanged events consumed by UI

The geometry compiler knows about the operation layer. The operation layer does not know the geometry compiler exists. One-way dependency.

### Math Library

Pure functions. No state. No side effects. No knowledge of operations, UI, or files.

Takes geometry, returns geometry.

Modules:
- `primitives` — point, line, arc, circle, plane, cylinder, sphere
- `brep` — boundary representation data structures
- `intersection` — closed form primitive intersections + OCCT fallback
- `boolean` — union, subtract, intersect
- `fillet` — edge rounding analytical solutions
- `tessellator` — exact geometry to display triangles
- `constraintSolver` — 2D sketch constraint solving

### Tessellation

Converts exact geometry to triangles for GPU rendering.

- Only retessellates faces that changed geometry — incremental
- Lazy — only tessellates geometry currently visible in viewport
- View-dependent density — finer tessellation when zoomed in, coarser when zoomed out
- Starts from grid-aligned control points — adjacent face boundaries guaranteed to match, no cracks

---

## 10. The Constraint Solver

### Design Principles

**Nearest solution always.** Newton-Raphson iteration seeded from current geometry position. Naturally converges to nearest valid solution. Lines don't flip to the mirror position.

**Hierarchical priority.** Constraints added earlier have priority over constraints added later. New constraints that conflict with existing ones are identified as the conflict source. The user always knows what caused a conflict and what to fix.

**Type-limited redundancy.** One constraint per type per entity pair. Two tangent constraints on the same line-circle pair are blocked — system explains why. Different constraint types on the same entities are fine.

**Circular dependencies blocked.** Always a mistake in geometric constraint systems. Detected and rejected with clear explanation. No legitimate use case for geometric circular dependencies.

**Underconstrained geometry is snappy.** Underconstrained geometry sits where placed and feels solid. It only moves when deliberately dragged past a threshold. The threshold is configurable. This prevents accidental moves while preserving freedom.

### Conflict Resolution

Conflicts appear as visual highlights in the viewport — not dialogs. Conflicted geometry glows amber. The health indicator shows conflict count. The user taps conflicted geometry to see which two intent nodes conflict and choose which to keep. Work continues uninterrupted.

---

## 11. System Architecture

### The Five Layers

```
┌─────────────────────────────────────┐
│            UI Layer                 │
│  Renders, displays, zero logic      │
├─────────────────────────────────────┤
│        Interaction Layer            │
│  Gestures → operations, snapping    │
├─────────────────────────────────────┤
│        Geometry Compiler            │
│  Compiles operation graph → geometry│
│  (uses Math Library internally)     │
├─────────────────────────────────────┤
│         Operation Layer             │
│  SOURCE OF TRUTH — the event graph  │
├─────────────────────────────────────┤
│         Platform Layer              │
│  Files, GPU, OS, input events       │
└─────────────────────────────────────┘
```

Data flows downward through calls.
Events flow upward through the event bus.
No layer reaches across non-adjacent layers. Ever.

### Layer Responsibilities

**Platform Layer**
- File read/write
- GPU context and raw draw calls
- Window management
- Raw input events (mouse, keyboard, touch, stylus)
- Network requests
- Zero business logic

**Operation Layer**
- DAG data structure
- Dependency tracking
- Operation registry
- Cache management and invalidation
- Undo/redo history
- Serialization and deserialization
- Conflict detection
- Zero knowledge of UI or geometry internals

**Geometry Compiler**
- Reads operation graph subgraphs
- Calls math library to compute geometry
- Manages geometry cache
- Emits geometry changed events
- Zero knowledge of UI

**Interaction Layer**
- Snap point detection
- Inference line calculation  
- Hover and selection detection
- Tool state machines (line, circle, rectangle, extrude, fillet...)
- Translates completed gestures into operation commands
- AI adapter — translates AI output into same operation commands as human gestures
- Reads geometry cache for raycasting and snapping
- Never writes geometry directly

**UI Layer**
- 3D viewport rendering (consumes display triangles from geometry cache)
- Sketch overlay (constraint icons, dimension labels, inference lines)
- Operation history panel
- Toolbar and tool selection
- Conflict and health display
- Settings panels
- Zero business logic — purely presentational
- Subscribes to event bus, never polls

### The Event Bus

Connects operation layer to UI layer without coupling them.

Events emitted by operation layer:
- `geometryChanged(operationIds[])`
- `constraintStatusChanged(statusMap)`
- `operationAdded(operation)`
- `operationModified(operation)`
- `operationDeleted(operationId)`
- `conflictDetected(conflict)`
- `conflictResolved(conflictId)`
- `selectionChanged(selection)`

UI subscribes to relevant events and updates. Operation layer never knows UI exists.

### The Geometry Cache

A queryable read-only store of current geometry results. Maintained by the geometry compiler. Read by the interaction layer (for snapping, hover, raycasting) and the UI layer (for display).

Not a mutable data structure. The operation layer + geometry compiler own updates. Everything else reads.

### The Settings System

Global key-value store with typed accessors. Read by all layers. Owned by none.

```
settings.grid.resolution          → 0.01 (mm)
settings.snap.threshold           → 12 (screen pixels)
settings.snap.enabled             → true
settings.tolerance.default        → 0.01 (mm)
settings.theme.constrainedColor   → '#4A90E2'
settings.theme.unconstrainedColor → '#FF9500'
settings.theme.conflictColor      → '#FF3B30'
settings.ui.smoothTiltDuration    → 300 (ms)
settings.display.tessellationDensity → 'adaptive'
```

Settings changes emit events on the event bus. Layers subscribe to settings they care about.

**Nothing is hardcoded. Every behavioral value lives in settings.**

---

## 12. The Sketcher Experience

### Starting a Sketch

User taps a plane or flat face. The view smoothly tilts to face-on orientation (300ms animation, configurable). The sketch plane activates. The rest of the model fades slightly but remains visible for reference. The user can see through to underlying geometry.

Toggle available to sketch in 3D perspective instead. Face-on is the smart default.

### Drawing Tools

Minimal toolbar. Day one tools:
- **Line** — single line or polyline (click continues from last endpoint)
- **Rectangle** — two click corner to corner
- **Circle** — click center, drag radius
- **Arc** — three point
- **Slot** — extremely common for bolt clearance in this user's workflow

Tool activates on single tap. Escape cancels current operation. Clicking empty space ends current line.

### Snapping

Snap targets:
- Endpoints of existing lines and arcs
- Midpoints of existing lines
- Center points of circles and arcs
- Grid points at current resolution
- Horizontal and vertical inference from existing points
- Tangent and perpendicular to existing curves

Snap feel:
- Threshold is distance in screen space (not model space) — consistent feel at all zoom levels
- **Dialable sensitivity** — one slider in settings controls how close cursor must be before snap engages
- Visual feedback: small colored dot at snap point, faint inference line showing why it snapped
- Inference lines fade immediately after user moves on
- Modifier key (Shift or Alt) temporarily disables snapping — user can always place exactly where they want

Grid snapping is off by default. Grid is visual reference, not snap target.

### Inference Lines

Faint blue lines that appear automatically when cursor aligns with existing geometry:
- "You're horizontally aligned with this point"
- "You're at the same height as that edge"
- "This line would be perpendicular to that line"

Appear automatically without user asking. Fade immediately when no longer relevant. This is the interaction that makes a sketcher feel magical rather than mechanical.

### Constraint Visualization

Small clean icons directly on constrained geometry:
- Horizontal line → small H icon near midpoint
- Parallel lines → small // icons
- Coincident point → small filled dot
- Tangent → small tangent symbol

Icons are:
- Small and subtle — visible when looking, not distracting when not
- Fade when cursor is far away, sharpen when nearby
- Large enough tap targets to select and delete constraints

Color coding:
- **Fully constrained geometry** — white/light blue
- **Underconstrained geometry** — orange
- **Conflicted geometry** — red/amber

User learns the color system in minutes. Never needs to read anything to know sketch status.

### Closed Region Detection

When lines form a closed loop — automatically detected within snap tolerance — the region fills with a subtle semi-transparent highlight. The user can see immediately what is ready to extrude.

Detection is forgiving: lines that almost close but are within snap tolerance are treated as closed. The user drew a rectangle with one corner 0.005mm off — close it automatically.

Multiple closed regions in one sketch are all highlighted. Each can be extruded independently or together.

### The Extrude Interaction

**This is the most important interaction in the entire tool. It happens hundreds of times per session.**

1. User taps a highlighted closed region — it brightens
2. A pull handle appears — simple arrow perpendicular to sketch plane
3. User drags the handle — extrusion previews in real time as they drag
4. Release to set, OR type a value for precision
5. Dragging below the plane cuts instead of adds

Requirements:
- Zero extra steps
- Real-time preview while dragging
- Dimension input field appears automatically for typed precision
- Negative drag cuts intuitively

### Dimensions

Tap a line while in sketch mode → dimension appears immediately showing current length → type new value → line updates → sketch adjusts.

Two-entity dimension: tap one entity then another → dimension between them appears → type value.

Dimensions display in user's chosen units (mm default, inches available). Always clean numbers because of grid — 47.00mm not 46.99982mm.

---

## 13. The 3D Viewport

Clean and minimal. The model is always the visual focus.

Three world planes visible as subtle light grids. Fade as model is created. Never compete visually with the model.

Navigation:
- Orbit — one finger drag (touch) or left mouse drag
- Pan — two finger drag (touch) or middle mouse drag
- Zoom — pinch (touch) or scroll wheel
- Face-on view — double tap a face

Selection:
- Single tap — select face, edge, or vertex
- Tap + hold — context menu for operations on selected entity
- Box select — drag in empty space

Hover feedback:
- Face hover → subtle highlight, shows face normal direction
- Edge hover → edge highlights, shows which operations can be applied
- Vertex hover → vertex highlights

Operation handles appear on selected geometry:
- Extruded face → pull handle for direct manipulation
- Edge selected → fillet handle
- These are discovery mechanisms — the user doesn't need to know operation names

---

## 14. The Operation History Panel

Shows the operation graph as a simple ordered list with indentation for dependencies. Not a complex node graph view — a clean list.

Each operation shows:
- Operation type icon
- Key parameters (e.g. "Extrude 25mm", "Fillet R3mm")
- Status indicator — valid, warning, conflict

User can:
- Click any operation to select and highlight the affected geometry in viewport
- Double click to edit parameters inline
- Drag to reorder (within dependency constraints)
- Right click to delete

Conflicts show inline with amber indicator. Tapping the indicator shows which downstream operations are affected.

The history panel is the user's map of their model's logic. Keep it readable. No more than the essential information.

---

## 15. File Format

### Native Format — JSON Event Graph

The native file format stores the operation graph only. Geometry is never saved — always recomputed on load.

```json
{
  "version": "1.0",
  "metadata": {
    "created": "2025-01-15T10:30:00Z",
    "modified": "2025-01-15T14:22:00Z",
    "units": "mm",
    "gridResolution": 0.01
  },
  "settings": {
    "tolerance": 0.01,
    "grid": 0.01
  },
  "operations": [
    {
      "id": "op_001",
      "type": "sketch",
      "plane": "XY",
      "entities": [
        { "id": "e_001", "type": "line", "start": [0, 0], "end": [50, 0] },
        { "id": "e_002", "type": "line", "start": [50, 0], "end": [50, 30] },
        { "id": "e_003", "type": "line", "start": [50, 30], "end": [0, 30] },
        { "id": "e_004", "type": "line", "start": [0, 30], "end": [0, 0] }
      ],
      "constraints": [
        { "type": "horizontal", "entity": "e_001" },
        { "type": "horizontal", "entity": "e_003" },
        { "type": "vertical", "entity": "e_002" },
        { "type": "vertical", "entity": "e_004" },
        { "type": "dimension", "entity": "e_001", "value": 50 },
        { "type": "dimension", "entity": "e_002", "value": 30 }
      ]
    },
    {
      "id": "op_002",
      "type": "extrude",
      "dependsOn": ["op_001"],
      "params": {
        "profileRef": "op_001",
        "distance": 25.0,
        "direction": "normal",
        "operation": "add"
      }
    },
    {
      "id": "op_003",
      "type": "fillet",
      "dependsOn": ["op_002"],
      "params": {
        "edgeRef": { "operation": "op_002", "delta": "born", "index": 4 },
        "radius": 3.0
      }
    }
  ]
}
```

Properties:
- Human readable — inspectable and debuggable as text
- Git friendly — meaningful diffs between versions
- Version stamped — every file knows its format version
- Forward compatible — unknown fields are preserved, not discarded
- Compact — stores intent not geometry, files are small

### Import and Export

**STL export** — full quality, no restrictions, all tiers. The 3D printing community's primary need.

**3MF export** — full quality, no restrictions. Better than STL for modern slicers (supports color, materials, print settings).

**STEP export** — for manufacturing handoff and sharing with other CAD tools.

**STEP import** — imported as reference geometry. Non-editable. User can measure against it and design around it. Explicitly communicated to user that STEP import is reference only.

**STL import** — imported as non-editable reference geometry. Explicitly communicated. No mesh-to-solid conversion attempted.

**Native JSON** — full read/write. The primary save format.

---

## 16. AI Integration (Phase Two)

### Philosophy

The AI solves the blank canvas problem. The user describes what they want, the AI builds a parametric starting point in seconds, the user edits it precisely using the full CAD tool.

The AI is not the product. The CAD tool is the product. The AI is a feature that makes it more accessible.

### Architecture

The AI generates a structured sequence of operations in the operation registry format — exactly the same format as human-generated operations. The operation layer does not know or care whether operations came from a human gesture or AI generation.

```json
[
  { "type": "sketch", "plane": "XY", "entities": [...], "constraints": [...] },
  { "type": "extrude", "params": { "distance": 40, "direction": "normal" } },
  { "type": "sketch", "plane": "face:op_001:top", "entities": [...] },
  { "type": "extrude", "params": { "distance": 10, "operation": "cut" } }
]
```

This drops directly into the operation graph as fully editable history. No special AI data structures. No locked AI-generated sections.

### What the AI can generate (day one)

Operations the AI is permitted to generate are constrained to the operation registry. It cannot hallucinate operation types that don't exist. Validation against schema runs before any AI operation executes.

Operations: sketch, extrude, revolve, boolean, fillet, chamfer, shell, pattern, mirror.

The AI also validates basic printability constraints — minimum wall thickness, maximum overhang angle — against configurable rules before finalizing output.

### What the AI cannot reliably do

Complex engineering judgment — structural adequacy, load calculations, material selection. The AI produces geometrically valid models. Whether they're well-designed for their purpose is the user's responsibility.

This is communicated honestly to users. The AI makes a starting point. The human makes it right.

---

## 17. Development Philosophy

### Build Order

**Phase 1 (months 1-6):** Operation graph data structure. Basic sketch, extrude, boolean. Minimal UI. Get something on screen. Prove the architecture.

**Phase 2 (months 6-12):** Dependency graph for incremental rebuild. Grid system. Constraint solver. Snapping and inference lines. The sketcher experience. Now it feels like a real tool.

**Phase 3 (months 12-18):** Analytical fillets. Shell, pattern, mirror, chamfer. STEP import/export. File format stability. Get real users. Listen.

**Phase 4 (months 18-24):** Polish from user feedback. Performance. Conflict visualization. Health dashboard. Community engagement. Pricing launch.

**Phase 5 (months 24+):** AI generation. Assembly support. Thread library. Slicer preview. Based on what users actually ask for.

### Three Non-Negotiable Rules

**1. No imports across non-adjacent layers.**
The UI module never imports from the geometry module. The operation layer never imports from the UI. If you want to, you're missing an interface method. Add the method, don't violate the boundary.

**2. No business logic in the UI layer.**
If you write an if statement in a UI component that involves geometry or operation concepts, that logic belongs in the interaction or operation layer. The UI displays. It does not decide.

**3. The geometry math library has no side effects.**
Every geometry function takes inputs and returns outputs. No global state. No mutation. No logging. No events. Pure functions only. Same inputs always produce same outputs.

Violating any of these three rules is a code review failure.

### Configuration Disciplines

Every behavioral value lives in settings, never hardcoded:
- Grid resolution → `settings.grid.resolution`
- Snap threshold → `settings.snap.threshold`
- All colors → `settings.theme.*`
- All tolerances → `settings.tolerance.*`
- All timing values → `settings.ui.*`

### Testing Disciplines

Tests run against public interfaces, not implementation internals. Tests that reach into implementation become constraints on refactoring.

Geometry engine has a test suite of known operations with known correct outputs. This suite protects against regression when internals change.

### Feature Flags

Every new feature goes behind a flag from day one. Allows shipping incomplete features to testers, A/B testing implementations, rollback without new release.

Simple JSON config file is enough. Don't over-engineer it.

### Async From Day One

Geometry compilation is async. Display updates independently. AI generation is async. Build async into the core architecture from the start. Retrofitting async onto synchronous code is a rewrite.

---

## 18. What Makes This Different From Existing Tools

| Property | FreeCAD | Fusion 360 | Shapr3D | This Tool |
|---|---|---|---|---|
| Stability | Crashes frequently | Generally stable | Stable | Stability is primary goal |
| Price | Free | $680/year | $299/year | $5/month |
| Learning curve | Very steep | 400-1200 hours | 3-5 days | Target: under 1 hour |
| Topological naming | Broken for years | Handled | Handled | Solved by architecture |
| Parametric rebuild | Brittle | Good | Limited | Event graph + incremental |
| Feature restrictions | None (open source) | Aggressive gating | Missing basics | Nothing gated |
| Cross platform | Yes | Yes | Apple + Windows | Yes from day one |
| File format | Binary | Proprietary cloud | Proprietary | Open JSON, human readable |
| AI integration | No | Basic | No | Native, editable history |
| 3D printing focus | General | General | General | Primary use case |

---

## 19. Things We Are Explicitly Not Doing (Yet)

- Threads (phase two — thread library)
- Assembly support (phase two)
- Slicer integration (phase two)
- Simulation or FEA
- CAM or toolpath generation
- Organic mesh sculpting
- Full NURBS surface modeling
- Variable radius fillets (phase two)
- Loft and sweep (phase two)
- STL mesh to solid conversion
- Mobile app
- Web/browser version
- Collaboration features

These are not ruled out forever. They are ruled out until the core is proven. Build the foundation right. Add features when users ask for them with real use cases.

---

## 20. Decisions Made and Why

**Grid-aligned control points with exact math between them**
Resolved the floating point ambiguity problem without the downsides of a pure grid (rotation problems, arbitrary curves). For this user's geometry — overwhelmingly primitive and orthogonal — the grid works perfectly and never manifests its theoretical problems.

**Operation graph as source of truth, geometry as compiled output**
Solves topological naming, enables incremental rebuild, makes undo trivial, makes AI integration natural, makes file format clean. The right philosophy for a parametric system.

**Incremental dependency graph rebuild**
Solves cascade performance. Only recomputes what changed. Standard computer science (build systems) applied to CAD.

**Nearest solution constraint solving**
Eliminates the flip problem. Standard Newton-Raphson seeded from current position. Hierarchical priority eliminates conflict ambiguity.

**Outcome constraints for parametric stability**
Makes the parametric model robust to upstream changes without dialog interruption. Conflicts surface visually when they occur, resolved on user's schedule.

**Closed form primitive intersections**
Covers 95%+ of this user's boolean operations exactly and instantly. OCCT as fallback for rare complex cases.

**$5/month single tier**
Market opportunity is volume not extraction. The 3D printing community responds to fair pricing with aggressive word-of-mouth. Complexity in pricing is itself a friction cost.

**STL export unrestricted on all tiers**
The number one thing this community needs. Restricting it is the number one thing that makes users distrust a tool. Making it free builds goodwill that converts to subscribers.

---

*This document represents a full day of architectural design. Every decision has been stress-tested, pushed back on, and revised. The architecture is sound for the target user. The market opportunity is real. The build order is realistic. The philosophy is consistent throughout.*

*When in doubt, return to the five core principles in section 5.*
