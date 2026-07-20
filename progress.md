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

## 2026-07-20 Player selection restoration

- New request: restore player selection with Skate Burger plus three construction cones; cone players carry the burger on top and all collected ingredients stack on that burger.
- Restored the start → player select → looks → spots flow and added distinct Street, Highway, and Barricade cone choices.
- Reworked character assembly so the same live BurgerStack is mounted either directly on the board or above the selected cone.
- Production TypeScript/Vite build passes.
- Required web-game client and mobile browser QA passed with no console errors.
- Verified all four cards update `selectedPlayer`; a normal Highway Cone run collected two pickups and grew from stack height 1 to 3.
- Verified a stationary Barricade Cone with cheese, lettuce, and tomato at stack height 4; screenshots are under `output/player-selection/`.

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

## 2026-07-10 Burger/crown coin collectible

- Replaced the mystery-crate collectible visual with a reusable 3D gold coin model: burger relief on one side, crown relief on the other, raised rim/groove details, slow spin, bob, and a soft glow.
- Reworked the UI token SVG into a gold burger coin icon and added a crown symbol for coin backs.
- Updated HUD/results language and icons from crate-focused collection to coin-focused collection.
- Added CSS-3D burger/crown coin flyouts for pickups and drive-through cash-in, with pickup flyouts launching toward the HUD on collection.
- Validation: production build passes; automated pickup test collected the first coin, increased score to 50, stack height to 2, and saved screenshots under `output/coin-feature/`.

## 2026-07-14 Coin flyout pivot fix

- Rebuilt the CSS-3D flyout transform hierarchy so the complete coin, including both solid faces and its edge, rotates around one centered pivot.
- Coin flyouts now follow a curved path into the live HUD coin icon instead of using a viewport-estimated endpoint.
- Verified front, edge, and crown frames at 390 x 844 with square matching bounds, no console errors, and a passing production build; captures are under `output/coin-pivot-fix/`.

## 2026-07-14 Audio controls, PNG icons, and app icon

- Added working music/SFX mute controls with remembered restore levels, synchronized slider fills, persistent volume updates, and SFX adjustment feedback.
- Music remains audible while paused so the pause-screen mixer can be heard immediately.
- Removed emoji placeholder fields and replaced the visible lock/mute states with project-local PNG icons.
- Added a generated 1024 x 1024 low-poly burger skateboard app icon plus manifest, favicon, and Apple touch derivatives.
- Browser validation at 390 x 844 confirmed exact music/SFX mute restores, localStorage and audio-element synchronization, music continuing through pause, loaded PNG controls/locks, no pictographic placeholder text, and no console errors.

## 2026-07-14 GSAP animation consolidation

- Added GSAP 3.15 and centralized all DOM/presentation motion in `src/UIAnimations.ts`.
- Replaced 13 CSS keyframe families, every CSS transition, the hand-rolled coin interval tween, and animation cleanup timers with GSAP tweens/timelines.
- Migrated overlays, shop toast, equalizers, deny feedback, HUD meters/pulses, move rows, score/points/trick feedback, and CSS-3D coin spin/flyouts.
- Repeating HUD and jukebox loops now stop while hidden and resume only while visible; dynamic animations kill descendant tweens before removing their nodes.
- Physics, player tricks, debris, trails, collectibles, and camera pose remain in the deterministic game update loop because they are simulation state rather than DOM presentation.
- Validation: production build and GSAP lifecycle tests pass; full home to Looks to Grill Yard gameplay, jump, pause, and resume flow passed with no browser errors. Screenshots are under `output/gsap-pass/`.

## 2026-07-14 AI level thumbnails

- Created a unified prompt system for all eight spots: square 1990s arcade racing level-select art, low camera, strong route perspective, saturated low-poly rendering, and one unmistakable environmental landmark per level.
- Generated distinct art for Grill Yard, Mega Canyon, Powder Peak, Sunny Cove, Canopy Run, Redwood Coast, Aqueduct City, and Sunset Harbor.
- Replaced the placeholder CSS scenery in the level picker with optimized 1024 x 1024 WebP thumbnails and a compact number badge.
- Validation: all eight assets loaded at 1024 x 1024 in desktop and mobile browser passes with no console errors; the final Sunset Harbor card remained selectable and entered the correct level. Captures are under `output/level-thumbnails/`.

## 2026-07-14 Simple gold collectible coin

- Replaced the layered burger/crown CSS flyout with one centered warm-gold medallion, a raised rim, soft highlight, and a clear `S` stamp.
- Limited the flyout motion to a gentle 3D tilt plus a slow face rotation so the coin stays intact and readable throughout its path to the HUD.
- Simplified the in-world collectible to match: smooth gold body, raised double-sided rim and `S` stamp, restrained metallic shading, and a softer glow.
- Validation: production build passes; early, middle, and late flyout frames retain one stable pivot and the final browser pass completed with no console errors. Captures are under `output/simple-coin/`.

## 2026-07-14 Grill Yard visual and layout upgrade

- Audited the original park against its new thumbnail and documented the missing hierarchy, connected lines, useful density, edge landmark, scale cues, and material separation in `design/grill-yard-upgrade-plan.md`.
- Added an explicit top-down build plan in `design/grill-yard-topdown.svg` with three connected routes: main launch, west street, and east bowl loops.
- Generated and integrated authored 1024 x 1024 concrete and plywood surface maps as per-level triplanar textures; other levels retain their procedural materials.
- Added reusable 3D modules for an A-frame, covered hero quarter, grindable picnic table, concrete planter, timber fence, suburban house backdrop, and striped patio canopy.
- Rebuilt Grill Yard around a clear central silhouette, optional grind lanes, unobstructed landings, a concrete bowl zone, an edge-mounted burger shack patio, and layered neighborhood scenery.
- Playtesting corrected a blocking center rail by moving grind targets into an optional lane. The main launch collected its first sequence cleanly, the west route crossed the full park and launched from its return quarter, and the bowl route traversed the crater without boundary escapes or browser errors.
- Production and visual QA captures are under `output/grill-yard-upgrade/`.

## 2026-07-14 Endless pickup placement pass

- Disabled the run countdown and hid the timer HUD so gameplay continues indefinitely while score and combo systems remain active.
- Added geometry-aware placement validation after each level finishes building, including solid boxes, rails, safe map bounds, coin spacing, and coin-to-boost spacing.
- Expanded Grill Yard to a 40-position coin pool with 30 active coins and 9 boosts; collected coins respawn after 8 seconds at rotating alternate locations away from the player and other active pickups.
- Changed the coin HUD to a cumulative total so respawning coins do not reduce or cap the displayed collection count.
- Audited all eight levels in-browser: every level has zero pickup-to-geometry overlaps, coin spacing is at least 3 m, coin-to-boost spacing is at least 3.4 m, and no placement warnings or browser errors were reported.
- Live respawn validation confirmed the active count returns from 29 to 30 at a new location while the cumulative count stays at 1; advancing the score system by 180 seconds leaves endless play active with the timer hidden.

## 2026-07-16 Sunny Cove destination rebuild

- Replaced Sunny Cove's shared `basicPark()` layout with one 290 x 210 m destination map combining a three-lane slopestyle headland, looping flow plaza, and two-courtyard campus web.
- Added broad physical A-frame, spine, bank, and roller connections between all three districts, with inward-facing perimeter transitions and large open runouts.
- Expanded the map to a 60-position coin pool with 44 active coins and 16 boost locations distributed along complete routes.
- Corrected the global perimeter cross-section to a true floor-tangent quarter circle, widened it from 1.75 m to 3 m, and increased profile subdivisions from 16 to 28.
- Generated project-local 1024 x 1024 coastal concrete and painted ramp textures for Sunny Cove.
- Upgraded shared lit materials to roughness/metalness-aware standard materials, enabled ACES tone mapping, and increased directional shadow resolution to 4096.
- Refined the opening vista with a neutral concrete summit, closer spawn, district-scale covered quarter-pipe landmarks, and an immediately readable three-line drop-in.
- Ride testing moved the center grind rail into an optional side lane and shifted the hub spine off the main boulevard; an unsteered 12-second run now flows from the summit through multiple features into the lower park without a forced reversal.
- Perimeter testing drove directly into the rebuilt transition at speed and returned the rider 27 m into the park without sticking or leaving the playable bounds; browser validation reported no console errors.
