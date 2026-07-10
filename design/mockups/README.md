# Skate Burger UI Flow Mockups

Standalone clickable prototype for validating the portrait game UI before the visual system is integrated into the live Three.js game.

## Open locally

From the project root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/design/mockups/`.

At desktop sizes the prototype includes a screen navigator and a 390 × 844 device frame. At phone widths the prototype becomes the full viewport. Use the side navigation, the Prev/Next controls, the arrow keys, or the buttons inside the mockups.

## Screen inventory

1. Home
2. First-run onboarding
3. Looks / customization
4. Spot select
5. Gameplay HUD
6. Pause
7. Settings
8. Trick book
9. Grill Shop
10. Jukebox
11. Results

## Proposed core flow

```text
HOME
  ├─ DROP IN ──────────> SPOT SELECT ─> GAMEPLAY ─> RESULTS ─> AGAIN
  ├─ LOOKS ────────────> CUSTOMIZE ───> SPOT SELECT
  ├─ SHOP ─────────────> GRILL SHOP
  └─ JUKEBOX ──────────> MUSIC

FIRST LAUNCH ONLY
  HOME ─> STEER ─> POP ─> LAND IT ─> GAMEPLAY

GAMEPLAY
  PAUSE ─┬─ BACK TO IT
         ├─ TRICK BOOK
         ├─ SETTINGS
         ├─ RESTART RUN
         └─ QUIT TO SHACK
```

## UX decisions to validate

- Home starts a run in one primary tap; Looks, Shop and Jukebox are secondary.
- First-run teaching is three interactive beats, not a permanent instruction paragraph.
- Spot cards replace descriptions and map dimensions with two gameplay tags.
- Gameplay always shows score, timer, pause and stack. Combo, pickup, trick and special feedback are contextual.
- Reset is removed from the live HUD and moved into Pause/automatic recovery.
- Pause contains run actions only. Settings and the Trick Book are separate screens.
- Results show only Score, Tallest Stack and Best Combo; the rest collapses into a receipt.
- Store and Jukebox are branded destinations rather than generic modal grids.

## Files

- `index.html` — complete mockup markup and flow
- `mockups.css` — Skate Burger visual system and screen layouts
- `mockups.js` — lightweight screen navigation and tutorial steps
- `assets/skate-burger-style-guide.png` — generated visual style reference
- `screenshots/` — representative review captures
