# Cone Zone 🚧🛹

A mobile-first, low-poly 3D skateboarding prototype — you're a wobbly traffic
cone (or a tall tube cone, or a big rubber ducky) shredding a small skate park.
PS2-era vibes, arcade physics, zero licensed content.

Built with **Three.js + TypeScript + Vite + Rapier**.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. The dev server listens on the LAN (`--host`), so you can
also open it from a phone on the same network to test touch controls.

`npm run build` type-checks and produces a static bundle in `dist/`.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Steer | A/D or ←/→ | ◀ ▶ buttons |
| Ollie / jump | Space | ⬆ button |
| **Boost** (blue meter) | hold W/↑ or Shift | hold 🔥 |
| Brake | S / ↓ | — |
| **Flip tricks** (in air) | tap Space + held direction | tap ⬆ + held ◀/▶ |
| **Grabs** (in air) | hold Shift/W + direction | hold 🔥 + ◀/▶ |
| **Specials** (meter full) | in air: hold boost + tap jump | same with 🔥 + ⬆ |
| Pause (full move list) | Esc or P | ⏸ button |
| Reset position | R | ↺ Reset button |
| Debug view | V | — |

The trick grammar follows the classic THPS convention: jump = ollie; in the
air the jump button + a held direction gives flip tricks (Kickflip /
Heelflip ◀ / Pop Shove-It ▶ / Impossible ↓), the boost button held is a grab
(Melon / Indy ▶ / Stalefish ◀ / Tail ↓), steering spins, and landing on
rails/ledges/lips grinds (50-50 straight, Boardslide sideways, Lip Grind on
coping). Landing tricks fills the **SPECIAL** meter; when it flashes, hold
boost + tap jump in the air for Rocket Air, The 900 (◀/▶) or Christ Air (↓).
The full cheat-sheet lives in the pause menu.

## Scoring: the move stack

Moves display live above the player and roll their value up **in place**
(AIR 8m → 14m…, SPIN 90° → 180°…). Moves performed together are a combo;
a new move within 1s of the last one ending chains the stack; repeating the
same move shows ×2/×3/×4 (capped) and multiplies it. One second after the
last move ends, everything converts into a single **+X POINTS** flyout that
feeds the score. **Bonking a wall voids the pending stack.**

| Move | Value | Anti-farm rule |
| --- | --- | --- |
| Ollie | 0 | it's a verb, not a trick |
| Air | 6/m after the first 4m | flat hops are worthless |
| Spin | 60 @ 90°, +80 per extra 90° | forgiving landings, honest degrees |
| Kickflip / Heel / Shove-It / Impossible | 120 / 140 / 140 / 180 | must land the full rotation |
| Grab | 40 + 120 per second | needs a real hold |
| Grind (50-50 / Board / Lip) | 30/40/50 + 60–80 per second | — |
| Special | 1000 flat | meter-gated; doesn't refill its own meter |
| Gold coin | 50 + 1 wallet coin | outside the stack |
| Repeat same move | ×2 → ×4 cap | Air exempt (every jump would qualify) |

## Boost, coins & the meta-game

- The **blue boost meter** (top of screen) starts full, drains while you hold
  boost on the ground, refills slowly while riding and quickly while resting.
  Glowing **blue orbs** around the park refill 40% instantly (they respawn).
- Collectibles are **gold coins**. Coins collected + a score bonus bank into
  a persistent wallet at the end of each run (localStorage).
- The customization screen doubles as the **shop**: locked items show a price
  (hats, boards, wheels, trails — including Crown, Halo, Propeller Cap,
  Galaxy and Solid Gold decks, Rainbow and Fire trails). Tap to buy + equip.
- Every trick inside the 4-second combo window raises the multiplier (x10 max);
  bonking a wall breaks the combo and hurts the special meter.

## Audio

- **Music**: original tracks by the author (`public/audio/`), streamed via an
  `<audio>` element — a random one loops each run, pauses with the game.
- **SFX**: synthesized live with the Web Audio API (oscillators + filtered
  noise) — ollie pop, landing thud, grind scrape loop, coin ding, boost orb,
  bonk, ducky boing, special fanfare, chain-banked cha-ching, UI clicks.
  No audio assets to download, nothing to license.
- 🔊 button in the HUD mutes everything (persisted).

## Visual variety

Each run rolls a random **gradient sky preset** (Noon / Sunset / Dawn / Dusk /
Minty) — a shader sky dome (the classic three.js hemisphere-example
technique). Fog, sunlight, and the perimeter **lamp posts** (real point
lights, facing into the park) all follow the preset, so dusk runs glow.

The debug view (V) swaps the render to wireframe and overlays the physics:
green = solid colliders, orange = bonk-only rails/coping, magenta lines =
grind segments, yellow capsule = the player's kinematic body.

## Project structure

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Entry point, boots the app |
| `src/GameApp.ts` | Orchestrator: renderer, screen state machine, game loop, camera |
| `src/CustomizationState.ts` | Selected body/color/hat/board/wheels/trail + stats per body type |
| `src/CharacterFactory.ts` | Procedural character rig (cone/tube/ducky, hats, boards) from primitives |
| `src/PhysicsWorld.ts` | Rapier wrapper: static colliders + multi-hit ground raycasts |
| `src/SkateParkScene.ts` | Level: ground, funbox, kicker, quarter pipe, rails, collectibles |
| `src/PlayerController.ts` | Kinematic arcade skater (ground/air/grind) + all character animation |
| `src/ScoreSystem.ts` | Points, combo chains, run timer |
| `src/TrailSystem.ts` | Pooled particle trails (sparkle/smoke/streak) |
| `src/UIManager.ts` | All DOM screens, HUD, trick popups, touch controls |

## Design notes

- **Modular grid park.** The level is assembled from a lego-style element
  library on a 2m grid: bank, kicker, funbox, pyramid, quarter pipe, half
  pipe, spine, ledge, rail (flat/diagonal/down), stairs + handrail, manual
  pad, roller, and high perimeter walls. Every element comes in **4 heights
  (1m–4m)** with a shared slope ratio (2m of run per 1m of rise) so any two
  pieces meet at matching angles. Quarter-pipe radius is derived from height
  so the lip always lands exactly at h.
- **Colliders exactly match visuals.** Curved/sloped modules register their
  render geometry as Rapier trimeshes (`userData.collide = 'trimesh'`);
  boxy modules register exact cuboids. The V debug view overlays them.
- **Bonk collision.** Short rays along the velocity at board/body height
  detect anything too steep to ride (walls, ledge sides, rails, wedge
  flanks). Hitting one pushes you out, reflects + damps your velocity —
  bounce off and slow down — turns you away, and breaks your combo.
  Rails/coping are "bonk-only" colliders: the ground snap ignores them
  (grinding stays analytic) but riding into them bounces you off.
- **Physics feel is still faked on purpose.** The player is a kinematic-style
  mover: velocity follows the slope found by a downward multi-hit raycast, so
  riding up a ramp naturally converts speed into a launch. Quarter-pipe lips,
  ledge coping, and stair handrails are all grindable line segments.
- All geometry is generated from Three.js primitives with flat-shaded Lambert
  materials; the only "textures" are two tiny generated canvases (checker &
  pizza decks).
- Handling numbers live in `BODY_TYPES` (`CustomizationState.ts`) and the
  constants at the top of `PlayerController.ts`; the park layout is the
  `buildLayout()` function in `SkateParkScene.ts` — every line is one module
  placement, so re-arranging the course is trivial.
