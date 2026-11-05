---
id: prin_input_agnostic
kind: principle
status: accepted
origin: human
human_input: in_077
date: 2026-11-05
depends_on:
  - dec_platform_web_portable: running in a browser is what lets one app take mouse, trackpad, touch and pen input through the same pointer events
---
# Design for mouse, trackpad, phone touch and stylus from the start

The human has a mouse, a laptop trackpad and a phone, and may get a stylus (`in_077`). Every interaction decision should work, or have a clear equivalent, on all four, so that adding a device later is a new gesture mapping and not a redesign.

What this means in practice (AI's reading, to be refined as it is built):
- **Intents, not devices.** The input layer turns raw events (mouse buttons, wheel, trackpad pinch, one or two fingers, pen tip or barrel button, hover) into a small set of intents: select, extend selection, orbit, pan, zoom, open menu, start or finish drawing, type a number. Tools and sketch logic only see intents.
- **No feature that exists only on one device.** Anything reachable by hover, a hotkey, right-click or triple-click also has a way on touch (a tap target, a long-press, an on-screen button, an on-screen number pad). Hover is a bonus (mouse, pen), never the only feedback.
- **Pointer type decides precision and roles:** a pen is a precise pointer like a mouse (hover, barrel button = menu); a finger navigates (orbit, pan, pinch) and taps to select, with larger hit tolerances; a trackpad uses two-finger scroll and pinch for zoom and a modifier for orbit.
- **Tap targets of at least about 44 px**, and layouts that survive a phone-sized screen.

## Rationale

Retrofitting touch into a mouse-first interface is the expensive mistake this avoids (`prin_never_box_in`). Today's mouse-only parts (one pointer at a time, orbit on a right or middle button, hover ring, right-click menu, triple click, keyboard hotkeys and typed numbers) are the places that need an equivalent.
