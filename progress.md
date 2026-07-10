Original prompt: update the game UI based on these mocks and generate the exact sprites needed for the UI to complete this. The game HUD should stick with a 4 button control system and a JUMP and BOOST button. Make the UI design efficient, don't bake the text into UI images except for things like the game logo

## 2026-07-10

- UI implementation scope: start, customize, level select, gameplay HUD, pause, jukebox, shop, and results.
- Control interpretation: preserve the existing four directional actions (launch/up, steer left, steer right, brake/down) plus separate JUMP and BOOST buttons.
- Asset plan: raster logo is the only baked-text asset; functional UI icons are a deterministic external SVG sprite so they stay crisp, themeable, and accessible.
- Generated a new Skate Burger wordmark on a chroma-key background; pending background removal and integration.
- Generated, keyed, cropped, optimized to an 87 KB transparent WebP, and integrated `public/ui/skate-burger-logo.webp`; editable PNG/chroma sources live under `design/ui-source/` and are excluded from the shipped public assets.
- Added `public/ui/ui-icons.svg`; all functional UI art is code-native and text-free.
- Reworked live screen markup/copy and added the approved release-style CSS across home, looks, spots, HUD, overlays, pause, shop, jukebox, and results.
- Preserved six gameplay inputs: four directional actions plus separate JUMP and BOOST.
- Added self-hosted Lilita One and Latin-only Barlow Condensed font packages.
- Added `render_game_to_text` and `advanceTime` test hooks. Production build passes.
- Required web-game client validation completed after installing its browser/runtime prerequisites; temporary Playwright project dependency was removed afterward.
- Automated gameplay state verified: home → Grill Yard → play, movement, jump burst, score/time progression, player position/speed, and pickups.
- Portrait browser QA verified home, spot select, looks, shop, jukebox, gameplay, pause/resume, and all six touch controls with zero console warnings/errors.
- Final screenshots saved under `output/ui-release/`.
- Replaced the production logo with a text-only Skate Burger wordmark; the previous skateboard-backed logo is retained in `design/ui-source/` as source reference.
- Added an animated home-screen 3D hero using the live burger model, airborne and angled toward camera on its skateboard against a blue sky gradient.
- Showcase stack order is fixed and visually spaced as patty, cheese, lettuce, bacon, pickle, tomato between the buns.
- Re-ran portrait home-to-game automation at 390 x 844: no browser errors, gameplay state entered correctly, and the four directional controls plus BOOST and JUMP remain visible.

## TODO

- Optional follow-up: split the existing large Three.js bundle; Vite still reports the pre-existing >500 kB chunk warning.

## 2026-07-10 Perimeter wall rebuild

- New request: make map walls more forgiving with a tighter, lower curve into a straight concrete wall and concrete top cap; prevent wall-top bonks and corner escapes; test ordinary wall and corner movement.
- Replaced the 4.5m, 68-degree perimeter ramp with a 1.75m quarter-circle transition feeding a 6.5m vertical concrete wall.
- Increased rounded-corner tessellation from 6 to 36 segments per quadrant.
- Added an outward-only visual concrete cap, deliberately excluded from collision so it cannot catch or flip the rider.
- Changed the controller safety backstop from a square clamp to an inset rounded rectangle matching the visible wall corners.
- Controlled normal-speed validation: straight wall reached 2.14m, returned inward with 0 bonks and 0 boundary escapes; diagonal corner approach had 0 bonks and 0 boundary escapes.
- Required web-game client passed the full home → customize → Grill Yard flow plus steering and jump; gameplay screenshot/text state matched and no browser errors were recorded.
- Final wall/corner screenshots and numeric traces are under `output/perimeter-wall-test/`.

## 2026-07-10 Level design audit

- Audited all eight levels from top-down runtime captures and inspected authored module footprints/collision behavior; no level geometry was changed.
- Shared `basicPark` conflict: the west bowl overlaps both halves of the neighboring half-pipe in Sunny Cove, Canopy Run, Redwood Coast, Aqueduct City, and Sunset Harbor.
- Redwood Coast adds a rotated mega drop-in that overlaps the shared west half-pipe and left ledge area.
- Sunset Harbor adds a half-pipe directly through the shared east stair set and its rail.
- Reproduced perimeter rejection in Cone Park: straight runs reverse around y=3.85 before the 4.5 m lip. The final 68-degree transition segment falls below the ground bonk threshold, vert-air intentionally pulls inward, and the controller clamp is 0.5 m inside the rendered lip.
- Runtime overhead captures and audit data are under `output/level-audit-overhead/`; transition traces are under `output/level-audit-transitions/`.

### Level audit follow-up

- Add module footprint metadata plus a build-time overlap validator, with explicit allow-lists for intentional compositions such as terrace banks.
- Re-space the shared west bowl/half-pipe cluster, then separately move the Redwood Coast drop-in and Sunset Harbor stair/rail cluster.
- Reconcile perimeter rideability: bonk threshold versus the 68-degree surface, vert-lock behavior, and clamp position should agree on whether the rider may clear the lip.
