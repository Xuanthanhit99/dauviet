# Frontend ↔ frozen backend contract gaps

## Culture / Theme detail

**State:** BLOCKED_BY_FROZEN_CONTRACT for a standalone editorial Culture/Theme detail experience.

The frontend has Theme relationships/labels in existing canonical entity responses, but this pass does not have evidence for a frozen public editorial contract that is sufficient to treat Theme as Culture or to construct a Culture Detail page. The UI therefore renders Theme as contextual information and does not create a dead/fabricated link.

Safe degradation: yes. Existing Event/Destination pages retain the labels without implying an unsupported detail destination.

Minimal future resolution: define a canonical Culture domain (or explicitly define Theme as the product surface), its public detail contract, localization, evidence/source semantics, media/provenance behavior and route baseline. This should be an additive post-freeze contract decision, not a frontend inference.

## Era / Dynasty / Territory detail

Backend/search/map knowledge may reference these entity kinds, but a public API's existence alone is not sufficient to invent a frontend product baseline. Territory in particular must not be presented as a current political boundary. Until an approved detail contract/surface exists, these relationships remain contextual; Territory remains available in historical map context.
