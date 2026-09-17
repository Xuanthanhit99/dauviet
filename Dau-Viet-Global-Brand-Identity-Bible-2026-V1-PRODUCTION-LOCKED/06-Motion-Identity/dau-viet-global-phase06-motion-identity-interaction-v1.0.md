# DẤU VIỆT GLOBAL — PHASE 06
## Motion Identity & Interaction Choreography V1.0

### Status
**PRODUCTION CANDIDATE**

### Motion idea: Reveal through time
Dấu Việt motion is derived from the same conceptual sequence as the locked Time Trace identity: **Time → Journey → Reveal → Story**. Motion should clarify continuity, discovery and spatial/temporal relationships. It must feel quiet, cinematic and deliberate — never bouncy, flashy or game-like.

### Timing system
- **Instant 0–80 ms:** direct feedback only.
- **Fast 120–180 ms:** hover, icon/state and compact controls.
- **Standard 200–280 ms:** panels, map selection, cards and common transitions.
- **Narrative 360–520 ms:** Story scenes and narrative context transitions.
- **Cinematic 600–900 ms:** logo/hero reveal only; never blocks interaction.

### Easing
- Enter: `cubic-bezier(0.22, 1, 0.36, 1)`
- Exit: `cubic-bezier(0.4, 0, 1, 1)`
- Move: `cubic-bezier(0.4, 0, 0.2, 1)`
- Linear is reserved for real progress/time playback.

### Signature choreography
**Logo Reveal:** 700–900 ms. Time layers establish, Journey path reveals, then the negative-space Reveal resolves. Glow is optional; recognition must remain in the static geometry.

**Map Selection:** 180–240 ms. Marker boundary/scale responds first, then label/panel; camera motion is optional. The anchor stays spatially stable and there is no bounce.

**Map Camera:** 280–480 ms when it genuinely helps orientation. User input interrupts immediately.

**Story Scene:** 360–520 ms. Outgoing context softens, continuity is preserved, incoming scene settles. Avoid theatrical page flips. Evidence and citations are never delayed behind animation.

**Journey Progress:** 200–360 ms. Current stop changes, route progress updates, then content focus follows. Progress animation is semantic, never an endless decorative route loop.

**Overlay / Context Panel:** 200–280 ms fade plus restrained translate/scale, with correct focus management.

**Then & Now:** 240–400 ms. Crossfade/slider is allowed, but explicit Then/Now state remains visible and motion is never the sole cue.

**Connection Graph:** 220–360 ms. Highlight related nodes/edges progressively; never keep the whole graph continuously moving.

### Reduced Motion
Reduced-motion is a first-class variant, not a later patch. Remove parallax, camera fly, path drawing, large translate/scale and cinematic sequences. The logo becomes the final static master or a minimal <=150 ms opacity change; maps jump/short-fade; Story swaps directly or uses a <=150 ms crossfade; Journey updates immediately.

### Accessibility / interaction rules
User-triggered navigation motion must be interruptible. Essential content/actions cannot wait for decorative motion. Focus state and focus destination are independent of animation timing. No flashing/strobing. Motion-only meaning is prohibited. Continuous ambient autoplay is off by default on content-heavy surfaces; meaningful autoplay requires appropriate pause/control behavior.

### Compatibility with locked baselines
This phase does not redesign Home V5, Explore Map V3, Destination/Place/Story/Journey baselines or Phases 01–05. It defines how their existing interactions move.

### Next validation
Run **Phase 06.1 — Motion Accessibility & Context QA** across normal/reduced-motion modes, keyboard navigation, interrupted transitions, map camera, Story scenes, Journey progress, overlays and logo reveal before Production Lock.
