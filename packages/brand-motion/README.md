# Brand motion

Import `@dauviet/brand-motion/styles.css` after brand tokens. This is the unmodified Phase 06 source CSS with durations 80/160/240/440/800ms and canonical easing. Optional classes: `.dv-motion-state`, `.dv-motion-panel`, `.dv-motion-story`.

The source stylesheet reduces CSS timing globally when `prefers-reduced-motion: reduce`. Runtime adapters must also remove camera fly, path drawing, parallax and large transforms; shortening animation alone is insufficient. No JS or native animation is installed by this package.

All facts, navigation, focus, evidence and citations are available immediately. Never gate behavior on `animationend` or `transitionend`. User input cancels or supersedes motion. No continuous decorative loops. iOS Reduce Motion and Android system preferences must be implemented in actual apps before native readiness is claimed. Normal/reduced-motion runtime QA remains pending absent frontend consumers.
