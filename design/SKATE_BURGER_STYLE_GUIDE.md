# Skate Burger — Brand, Marketing UI & Game Style Guide

Version 1.0 — July 2026  
Target: portrait mobile, hyper-casual arcade skate game

> **Brand promise:** A tiny burger. A big board. One more ridiculous run.

## 1. Creative north star

**Boardwalk burger shack × Y2K console arcade.** Skate Burger should feel like a lost PS2-era mascot game discovered inside a sun-faded seaside snack bar: low-poly, quick, scrappy, funny, and tactile.

The world already has the right raw ingredients—simple geometry, warm skies, chunky ramps, a cute burger, and a red-and-white striped shack. The interface should feel built from that same world, not laid over it as a generic rounded web UI.

### The three-second read

1. **Burger on a skateboard.** The character and board are always the hero.
2. **Stack toppings by landing tricks.** The fantasy is legible without a paragraph.
3. **Fast, funny arcade chaos.** A run should look immediately replayable.

### Brand pillars

| Pillar | Meaning | UI expression |
| --- | --- | --- |
| Fresh off the grill | Warm, handmade, imperfect | painted type, paper labels, sesame specks |
| Built to shred | Skate energy without “extreme sports” cliché | slants, board shapes, stamped scores, fast motion |
| Cute with consequences | Charming hero; toppings can fly everywhere | big reactions, squash, crumbs, short funny copy |
| One-more-run clarity | Hyper-casual speed and low cognitive load | one decision per screen, familiar verbs, progressive HUD |

### Avoid

- Generic glassmorphism, white floating cards, blue utility meters, and rainbow gradients.
- Emoji as final production icons. Use one coherent, chunky low-poly/sticker icon set.
- Long tutorial prose, control legends on the title screen, or location descriptions in the core flow.
- Over-theming essential mechanics. Keep **SCORE**, **BOOST**, **COMBO**, and **SPECIAL** instantly readable.
- Photoreal food, dripping gross-out sauces, graffiti overload, or “edgy” skate clichés.

## 2. Visual language

### Signature motifs

- **Shack stripe:** vertical tomato-red and warm-white stripes, always 1:1 width. Use on top rails, tickets, shop headers, and marketing frames—not as a full-screen wallpaper.
- **Deli check:** sparse red/cream checker used as a secondary texture at 8–12% opacity.
- **Board capsule:** elongated pill with squared-off ends, 10–14° tilt. Use for CTAs and selected tabs.
- **Order ticket:** warm paper with one clipped/notched corner. Use for results, unlocks, and offers.
- **Sesame scatter:** three to seven tiny seed marks around hero titles. Never place behind small text.
- **Grill stamp:** dark, slightly distressed all-caps micro labels for scores and category names.

### Shape rules

- Primary radius: **14 px**. Large sheets: **22 px**. Small chips: **8 px**.
- Buttons should resemble a skateboard deck or painted sign, not a soft marshmallow.
- Use a hard **3–5 px char-colored drop edge** instead of diffuse shadows.
- Stroke important UI with **2 px Char** or **2 px Cream**, chosen for contrast.
- Small UI may be square or clipped. Not every element gets a rounded container.

### Texture and depth

The game is low-poly, so UI depth should also be economical: flat fills, one hard shadow, one highlight edge, minimal blur. Texture comes from pattern and print imperfections, not noise over every surface.

## 3. Color system

| Token | Hex | Role |
| --- | --- | --- |
| Tomato | `#D93A2F` | primary brand, danger, shack stripe |
| Ketchup Dark | `#8F201C` | pressed edge, deep shadow |
| Cheese | `#FFC83D` | rewards, combo, primary highlight |
| Mustard | `#E69A17` | gold shadow, secondary highlight |
| Pickle | `#5E9E45` | success, equipped, fresh accent |
| Bun | `#D99A55` | character-adjacent neutral, cards |
| Toast | `#9A5C2E` | bun shadow, secondary text on cream |
| Cream | `#FFF3D6` | paper surface, light stripe |
| Char | `#28221F` | primary ink, outlines, modal dim |
| Sky | `#70B9EA` | world support only; not a default UI accent |
| Mayo | `#FFFDF6` | high-contrast text on Char/Tomato |

### Usage ratio

- 45% world/gameplay
- 25% Cream/Mayo surfaces
- 15% Tomato
- 10% Char
- 5% Cheese/Pickle accents

Tomato is the brand color. Cheese is the reward color. Pickle is success. Blue belongs mostly to sky and water so the UI does not compete with the world.

### Accessibility

- Body text: Char on Cream/Mayo.
- White text on Tomato is for 18 px+ bold labels only; use Char for smaller copy.
- Never communicate state by color alone. Pair it with an icon, label, fill shape, or animation.
- Minimum tap target: **48 × 48 px**; preferred primary action: **64 px high**.

## 4. Typography

### Recommended family

- **Display / logo / reactions: Lilita One** — friendly, heavy, compact, mascot-ready.
- **UI / labels / copy: Barlow Condensed SemiBold–Black** — athletic, narrow, and readable in portrait HUDs.
- **Numbers: Barlow Condensed Black with tabular figures** — score and timer stay stable while updating.

Both families must be self-hosted in production. Confirm the font license and include only required weights. System fallback: `Impact, "Arial Narrow", sans-serif` for display and `"Arial Narrow", system-ui, sans-serif` for UI.

### Type scale at 390 px wide

| Style | Size / line | Case | Use |
| --- | --- | --- | --- |
| Logo XL | 56 / 50 | custom stacked | title, store hero |
| Display | 36 / 34 | sentence or short caps | screen headline |
| Score | 32 / 30 | numerals | live score, final score |
| Action | 24 / 24 | short caps | primary CTA |
| UI title | 18 / 20 | caps | cards, labels |
| Body | 16 / 20 | sentence | rare supporting copy |
| Micro | 12 / 14 | caps + 0.08em | meter/category labels |

### Type rules

- Headlines: two lines maximum, four words maximum.
- Buttons: one to two words. Use an icon only if it speeds recognition.
- Avoid fake 3D text made from several blurred shadows. Use one cream face, one Char stroke, and one hard colored extrusion.
- Never set instructions in all caps.
- Score and timer use tabular numerals and no comma animation jitter.

## 5. Logo system

### Primary lockup

Stack **SKATE** small and forward-leaning above **BURGER**. BURGER is the dominant word. A short skateboard/deck underline carries both words; two wheels can act as punctuation. Add three sesame marks above the first or last letter, never both.

Preferred construction:

- Cream letter face
- Tomato 2 px outline
- Char 4 px hard extrusion down-right
- Optional Cheese underline/deck
- 8° forward slant for the complete lockup; do not italicize individual letters

### Small mark

A simplified burger on a board in a Tomato square with a Cream keyline. At 32 px, remove eyes, seeds, and wheel hardware; preserve bun/patty/board silhouette.

### Clear space

Keep one burger-patty height around the lockup. Do not place the logo inside the same generic white card used by the old UI.

## 6. Icon and illustration style

- Build icons as low-poly/sticker silhouettes with 2 px Char outline and one highlight plane.
- Use a fixed 24 px grid for HUD and 32 px for navigation.
- Use food icons only for food systems; do not turn every control into food.
- Primary set: burger stack, topping box, coin, boost flame, special star, score ticket, pause, sound, retry, shop, lock, board, hat, wheels, trail.
- Coin should be a branded **SB token** or tiny burger token, replacing the generic coin emoji.
- Mystery boxes should read as **topping crates** through a tomato/cream crate decal.

## 7. Motion and feedback

| Event | Motion | Timing |
| --- | --- | --- |
| Button press | sink 4 px into hard shadow; rebound | 90 ms down / 130 ms up |
| Screen in | sign/card drops 12 px with slight overshoot | 220 ms |
| Topping earned | topping arcs to burger, stack compresses | 450–650 ms |
| Trick landed | label stamps in at 110%, settles to 100% | 180 ms |
| Combo banked | score ticket tears/flicks toward total | 500 ms |
| Wipeout | toppings burst, one beat of freeze, “BEEF!” stamp | 600–900 ms |
| Special ready | controlled sauce-line chase, no full-screen pulsing | 900 ms loop |

Use 60 fps transforms and opacity only for DOM UI. Respect reduced-motion preferences by removing shake, parallax, and repeated pulse.

## 8. UI architecture

### Global rule: one screen, one job

Every full-screen state gets one headline, one primary action, and at most two secondary actions. Explanations belong in onboarding, not permanent navigation.

### Title / home

**Purpose:** start a run in one tap.

- Full-bleed live 3D hero: burger idles in front of the striped shack.
- Logo in top third; no enclosing card.
- Primary CTA: **DROP IN**.
- Secondary icon actions along bottom: **LOOKS**, **SHOP**, **SOUND**.
- Best score becomes a small order-ticket badge: `BEST 12,450`.
- Remove the keyboard/control paragraph entirely.

### Onboarding

Show only on first run, as three interactive beats:

1. **STEER** — drag left/right.
2. **POP** — tap the large board button.
3. **LAND IT** — align the board; successful landing gives the first topping.

Teach boost when the player first reaches a long straight. Teach specials when the meter first fills. Do not explain every trick before play.

### Customization

- Headline: **DRESS THE BUN**.
- Keep the burger large and centered; categories become icon tabs: hat, shades, deck, wheels, trail.
- Show only the selected category label and item name; remove repeated explanatory text.
- Locked items display price and lock, never opacity alone.
- Primary CTA: **RIDE**.
- If a purchase fails: `NEED 40 MORE` rather than shaking the entire interface.

### Spot select

- Headline: **PICK A SPOT**.
- One large visual card at a time with 3D preview, spot name, and two compact tags.
- Replace paragraphs and map dimensions with tags such as `EASY LINES`, `BIG AIR`, `FAST`, `TECH`.
- Primary action is tapping the card or **RIDE HERE**.
- Rename “Cone Park” before launch; it is legacy language from the prototype.

### Live HUD

The current build shows score, combo, topping progress, burger height, special, timer, boost, reset, pause, move stack, and touch controls at once. The redesign uses progressive disclosure.

**Always visible**

- Top-left: score number; tiny `SCORE` label only at run start.
- Top-center: timer on a small Cream ticket.
- Top-right: pause only. Move reset into Pause and automatic recovery.
- Bottom-right: primary **POP** button; smaller **BOOST** control above/inside its orbit.
- Bottom-left: invisible steer zone with a faint board-shaped thumb trail on first use.

**Contextual**

- Topping progress appears for 1.5 s after pickup, then collapses to burger stack `×4`.
- Combo meter appears only while a combo is active.
- Special meter appears only after its first gain; when full it becomes a compact `SPECIAL READY` badge.
- Trick names anchor above the burger, maximum two lines. One active move plus a compact multiplier replaces the scrolling move ledger.

**Meter styling**

- Boost: Cheese fill in a skateboard-deck track; Char depletion.
- Special: Tomato-to-Cheese sauce stripe with star end cap.
- Combo: Cream ticket with Char numeral and a fast Tomato underline.

### Pause

Headline: **ON BREAK**. Keep **BACK TO IT**, **RESTART**, **SETTINGS**, **QUIT**. Move the full move list to a separate **TRICK BOOK** screen. Do not put jukebox, two sliders, controls, and three run actions on one card.

### Results

Headline changes with performance:

- Normal: **ORDER UP!**
- New best: **HOUSE RECORD!**
- Wipeout-heavy run: **STILL EDIBLE.**

Show only three primary stats: **SCORE**, **TALLEST STACK**, **BEST COMBO**. Put crates, moves, banked coins, and wallet into a single expandable receipt. Primary CTA: **AGAIN!** Secondary: **LOOKS**. Tertiary text link: **HOME**.

## 9. Copy system

### Voice

Short, playful, confident, and a little deadpan. The burger never speaks in full mascot monologues. Food/skate wordplay is a garnish, not every sentence.

### Copy hierarchy

1. **Verb first:** `LAND 3 FLIPS`
2. **Concrete reward:** `+ TOMATO`
3. **Punchline last:** `STILL EDIBLE.`

### Approved vocabulary

| System | Use | Avoid |
| --- | --- | --- |
| Start | Drop In, Ride, Again | Play Game, Continue to Level |
| Jump | Pop | Launch off ramps |
| Pickups | Toppings, Topping Crates | Mystery boxes, collectibles |
| Burger height | Stack | Tallest burger layers |
| Failure | Beefed It, Burger Down | You failed, chain voided |
| Results | Order Up | Time’s Up screen |
| Customization | Looks, Dress the Bun | Make It Yours |
| Levels | Spots | Levels, map size |

### Screen copy replacement

| Current | Replace with |
| --- | --- |
| `Stack it. Shred it. Don’t drop it.` | `FLIP. STACK. SHRED.` |
| `PLAY` | `DROP IN` |
| `MAKE IT YOURS` | `DRESS THE BUN` |
| `SKATE!` | `RIDE` |
| `PICK A SPOT` | keep |
| `📦 4/29 · 🍔 5` | crate icon `4/29` + stack icon `×5` |
| `CHAIN ×4` | `COMBO ×4` |
| `CHAIN LOST` | `BEEFED IT` |
| `BURGER DOWN!` | `BURGER DOWN` |
| `TIME’S UP!` | `ORDER UP!` |
| `RETRY` | `AGAIN!` |
| `CUSTOMIZE` | `LOOKS` |

### Marketing voice lines

- **Flip patties. Land tricks.**
- **Stack your burger to the sky.**
- **Shred hard. Stay assembled.**
- **Dress the bun. Deck the board.**
- **Don’t beef the landing.**
- **One board. Too many toppings.**

## 10. Marketing UI

### App icon

Use a close crop of the burger leaning into a kickflip, board diagonal from lower-left to upper-right. Cream background, Tomato corner stripe, Char outline. No text, no shack, no tiny toppings.

### Store screenshot sequence (9:16)

| Frame | Headline | Visual brief |
| --- | --- | --- |
| 1 | **FLIP PATTIES. LAND TRICKS.** | burger mid-kickflip, shack behind, huge clear silhouette |
| 2 | **STACK IT TO THE SKY.** | absurd tall topping stack, low camera, clean sky negative space |
| 3 | **SHRED WILD SPOTS.** | three diagonal location slices; no descriptive paragraphs |
| 4 | **DRESS THE BUN.** | three burger looks, toy-like lineup |
| 5 | **DON’T BEEF THE LANDING.** | comic topping explosion, “BEEF!” stamp |
| 6 | **CHASE THE PERFECT ORDER.** | result ticket with score, stack, combo only |

### Screenshot layout

- Keep headline in the top 22% safe area and gameplay hero in the middle 60%.
- Use either a live screenshot or a graphic frame, never a phone mockup inside the store image.
- Frame gameplay with one Tomato/Cream stripe edge and a Char 3 px keyline.
- Headlines are 3–6 words, maximum two lines.
- Remove nonessential live HUD from marketing captures; retain score or combo only when it supports the frame’s claim.
- Every frame needs the burger’s face or unmistakable burger silhouette.

### Social/video end card

Three beats in 1.2 seconds: burger lands → toppings settle → logo stamps in. End card copy: **DROP IN. BUILD BIG.** Keep the CTA and store badges in the bottom safe area.

## 11. Game-world art direction

### Preserve

- Low-poly models, visible facets, simple materials, dramatic gradient skies.
- Toy-scale proportions and readable ramp silhouettes.
- The burger’s compact, slightly awkward center of mass.
- The red-and-white shack as the visual home base.

### Tighten

- Use a limited local palette per spot: one ground neutral, one structure neutral, one hero accent, one environmental accent.
- Give ramps slightly exaggerated edge bevels and painted wear at contact points.
- Add sparse food-service props near the shack: menu board, picnic table, tray, paper cup, ketchup cone. Keep collision silhouettes clean.
- Increase character/world separation with a thin warm rim light or brighter top planes; avoid realistic shadows that swallow the burger.
- Treat pickups as physical branded crates/toppings, not generic question boxes.

### Shack rules

- Tomato/Cream stripes are the single strongest landmark.
- Cream trim, Char menu-board panels, Cheese window light.
- The shack is the title-screen backdrop, shop entrance, and post-run celebration anchor.
- Do not repeat the stripe motif on every level object; it loses ownership if everything is striped.

## 12. Audio direction

- UI press: wooden board tap + short wrapper crinkle.
- Purchase/unlock: register bell with a tiny wheel spin.
- Topping land: soft ingredient-specific plop layered over board compression.
- Combo bank: stamped ticket snap, not a generic coin chime.
- Wipeout: deck clack, topping scatter, one dry grill-bell hit.
- Keep music energetic and lo-fi arcade; avoid audio that implies licensed skate culture.

## 13. Implementation tokens

```css
:root {
  --sb-tomato: #d93a2f;
  --sb-ketchup-dark: #8f201c;
  --sb-cheese: #ffc83d;
  --sb-mustard: #e69a17;
  --sb-pickle: #5e9e45;
  --sb-bun: #d99a55;
  --sb-toast: #9a5c2e;
  --sb-cream: #fff3d6;
  --sb-char: #28221f;
  --sb-sky: #70b9ea;
  --sb-mayo: #fffdf6;

  --sb-radius-sm: 8px;
  --sb-radius: 14px;
  --sb-radius-sheet: 22px;
  --sb-edge-sm: 3px;
  --sb-edge: 5px;

  --sb-font-display: "Lilita One", Impact, sans-serif;
  --sb-font-ui: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
}
```

### Component contract

- `Button/Primary`: Tomato face, Ketchup Dark edge, Mayo label, 64 px high.
- `Button/Secondary`: Cream face, Char edge, Char label, 52 px high.
- `Button/Icon`: Cream 48 px square, Char keyline; selected uses Cheese.
- `Ticket`: Cream with clipped corner, Char edge, micro label + large value.
- `Chip/Selected`: Char fill, Cream label, Cheese 2 px underline.
- `Toast/Reward`: Cheese face, Char text/edge; no translucent white container.
- `Toast/Failure`: Char face, Cream text, Tomato stamp.

## 14. Production priorities

### P0 — identity and clarity

1. Replace emoji and legacy “Cone Zone” language.
2. Add the Tomato/Cream/Char token system and production fonts.
3. Rebuild title, HUD, and results first; these define capture quality.
4. Remove title-screen control prose and collapse live HUD through progressive disclosure.
5. Create the primary logo and 24 px icon set.

### P1 — complete the loop

1. Restyle customization and spot select with image-led cards.
2. Replace mystery boxes with topping crates.
3. Split pause settings from the trick book.
4. Add the first-run contextual tutorial.

### P2 — marketing and polish

1. Produce app icon and six store frames.
2. Add shack-based title scene and post-run celebration.
3. Add branded motion/audio feedback and reduced-motion mode.

## 15. Approval checklist

- Can a new player understand “burger + board + toppings” in three seconds?
- Is the burger the largest visual idea on every marketing frame?
- Does each screen have exactly one obvious primary action?
- Is any paragraph doing work that motion, iconography, or staging could do faster?
- Are score, timer, and controls readable against every sky preset?
- Could this UI belong to a different hyper-casual game? If yes, add a Skate Burger-owned motif—not more decoration.
- Are emoji, prototype names, simulated-store language, and desktop control hints absent from release captures?

## Reference captures

These images record the July 2026 prototype state and are diagnostic references, not visual targets:

- `design/reference/current-title.png`
- `design/reference/current-customize.png`
- `design/reference/current-gameplay.png`

