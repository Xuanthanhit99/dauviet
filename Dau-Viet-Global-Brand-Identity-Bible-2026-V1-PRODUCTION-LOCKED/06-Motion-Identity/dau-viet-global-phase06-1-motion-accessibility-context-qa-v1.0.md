# DẤU VIỆT GLOBAL — PHASE 06.1
## Motion Accessibility & Context QA V1.0

### Result
**PASS WITH IMPLEMENTATION RULES — READY FOR PHASE 06 PRODUCTION LOCK**

The Phase 06 motion system is coherent across normal and reduced-motion modes. No choreography redesign is required. The remaining requirements are implementation contracts that prevent motion from controlling meaning, focus, navigation or evidence access.

### Normal-motion QA
- **Logo Reveal:** PASS at 700–900 ms only as a non-blocking brand/application moment.
- **Map Selection:** PASS at 180–240 ms. Spatial anchor remains stable; no bounce.
- **Map Camera:** PASS WITH RULE at 280–480 ms. Use only when it genuinely improves orientation and allow immediate interruption.
- **Story Scene:** PASS at 360–520 ms. Essential content, citations and evidence are not delayed.
- **Journey Progress:** PASS at 200–360 ms and remains semantic rather than decorative.
- **Overlay / Context Panel:** PASS at 200–280 ms. Focus behavior is independent of animation timing.
- **Then & Now:** PASS WITH RULE. Explicit Then/Now state remains visible without motion.
- **Connection Graph:** PASS WITH RULE. Animate relationship focus only; no perpetual whole-graph movement.

### Reduced-motion QA
Reduced motion passes as a first-class variant:
- Logo = final static master or <=150 ms opacity transition.
- Map = jump/short fade, no camera fly.
- Story = direct scene swap or <=150 ms crossfade.
- Journey = immediate route/state update.
- Remove parallax, path drawing and large translate/scale.
- State, focus and progress remain explicit when all non-essential motion is removed.

### Keyboard and focus QA
Focus follows **semantic state change**, not `animationend` / `transitionend`. Opening overlays moves focus to a meaningful first target or container; closing returns focus to the invoker. Keyboard map selection must not depend on hover animation. Story chapter/scene state updates immediately.

### Interruption QA
User-triggered motion is interruptible. New navigation input cancels or supersedes prior transitions. Map wheel/pan/keyboard/marker selection interrupts camera motion. Story next/previous navigation replaces an in-flight scene transition cleanly. Close actions remain available throughout overlay transitions.

### Timing and accessibility
Essential actions never wait for decorative motion. Flashing/strobing is prohibited. Motion-only meaning is prohibited. Structural skeleton/progress is preferred over decorative loading loops. Ambient/cinematic autoplay is off by default on content-heavy surfaces.

### Required implementation rules for lock
1. Focus movement is tied to semantic state change, never animation-end events.
2. User-triggered map camera and scene transitions are cancellable by fresh input.
3. Reduced motion **removes** camera fly, path drawing, parallax and large scale/translate; it does not merely shorten them.
4. Logo/Hero cinematic motion never gates navigation or essential content.
5. Then & Now and Journey progress retain explicit textual/state cues with motion removed.
6. Connection graphs animate selected relationships only; continuous ambient node drift is prohibited on core content surfaces.
7. Ambient/cinematic autoplay is off by default on content-heavy surfaces; meaningful autoplay requires pause/stop controls.
8. Animation completion events are never prerequisites for data loading, URL/navigation state, focus, citations or evidence visibility.

### Decision
Phase 06 is **READY FOR PRODUCTION LOCK** with the eight implementation rules above included in the locked baseline.
