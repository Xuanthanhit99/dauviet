# Frontend completion audit

Status: in progress on `feat/frontend-production-completion`.

## Locked surfaces preserved
Home V5, Explore Map V3, Destination Detail V4, Place Detail V4, Story Explorer V4, Journey Detail V3, Country Detail V1 and Region Detail V2 remain compositionally unchanged except for targeted navigation fixes.

## Current route audit

| Surface | Current state | Action in this pass |
| --- | --- | --- |
| /explore | implemented | Added canonical G11 search discovery, VI/EN and fallback disclosure. |
| /stories | implemented | Added published collection with pagination/loading/error/empty states. |
| /journeys | implemented | Added published collection with pagination/loading/error/empty states. |
| /events/[slug] | implemented | Existing Event Detail retained; links to Place/Country/Person are canonical. Theme/Era/Territory remain contextual where no approved detail route exists. |
| /people/[slug] | implemented | Existing Person Detail retained; timeline links to canonical Event Detail. |
| Country → Region | fixed | Region cards now link to `/regions/[slug]`. |
| Place timeline → Event | fixed | Timeline event title now links to `/events/[slug]`. |
| Destination turning point → Event | fixed | Turning-point title now links to `/events/[slug]`. |
| Map → Place/Event | fixed | Selected canonical Place/Event exposes a detail link. |
| Map → Territory | truthful degradation | Territory remains map context only; no unsupported detail route or present-day sovereignty inference is created. |
| Culture/Theme | frozen-contract gap | No Culture=Theme assumption and no fabricated detail route. |
| Era/Dynasty/Territory detail | not canonically defined | Keep contextual/non-clickable until a truthful product contract and route baseline exist. |

## Trust and data boundaries
No backend changes were made. No fixture/provider data is promoted to canonical knowledge. No AI/local substitute media was added. G08 private locations and G09/G10 private/commercial data are not exposed by these public routes.

## Remaining gate
GitHub Consumer QA must pass on the final branch head before this pass can move out of Draft. Browser-level responsive/keyboard QA remains required before merge.
