---
id: prin_manufacture_agnostic
kind: principle
status: accepted
origin: human
human_input: in_576
date: 2026-11-16
depends_on:
alternative_to:
---
# Modeling knows nothing of how a part will be made

No tool, setting or default in the modeler is shaped by a manufacturing route (laser cutting, 3D printing, machining, moulding): no kerf, no printing clearance, no tool radius, no minimum feature size, no route presets. A model is the geometry the person means. Making a model manufacturable for a route (compensating for kerf, adding clearance, checking what a printer or cutter can make) is a separate module that takes a finished model and a route, and is built later.

## Rationale

Stated by the human (`in_576`). It keeps one model usable for every route, and keeps route knowledge in one place instead of spread through the tools. Numbers that are plain geometry (a gear's backlash, a fit's clearance as a size the person types) are not route knowledge as long as their defaults are the nominal ones and the tool does not know why they are typed.
