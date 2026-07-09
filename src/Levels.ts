/**
 * Levels
 * ------
 * Level configs consumed by SkateParkScene. Each config is theme + bounds +
 * spawn + physics feel + a build() that places modules from the shared
 * library. Elevated pieces use the modules' base-height `y` parameter, so
 * terraces, plateau drops and mountain tiers compose out of the same lego
 * set as ground-level parks.
 */
import type { LevelConfig, SkateParkScene } from './SkateParkScene';

/* ================================================================== */
/* 1. CONE PARK — the classic neighborhood park                        */
/* ================================================================== */

function buildConePark(p: SkateParkScene): void {
  // Perimeter rule: every edge element is a QUARTER PIPE (banks against a
  // wall just ram you into it), and every back sits FLUSH on the wall's
  // inner face (x ±69 / z ±49) — no dead gap behind the ramps.

  // North wall: a near-continuous quarter-pipe line at varied heights.
  p.moduleQuarterPipe(-62, -49, 0, 2, 12);
  p.moduleQuarterPipe(-44, -49, 0, 2, 20);
  p.moduleQuarterPipe(-10, -49, 0, 3, 24);
  p.moduleQuarterPipe(16, -49, 0, 4, 16);
  p.moduleQuarterPipe(34, -49, 0, 1, 12);
  p.moduleQuarterPipe(52, -49, 0, 3, 14);

  // South wall returns flanking the spawn.
  p.moduleQuarterPipe(-48, 49, Math.PI, 2, 14);
  p.moduleQuarterPipe(-26, 49, Math.PI, 1, 16);
  p.moduleQuarterPipe(24, 49, Math.PI, 2, 16);
  p.moduleQuarterPipe(48, 49, Math.PI, 2, 14);

  // West: half pipe mid-floor + wall QPs. East: two wall QPs.
  p.moduleHalfPipe(-52, 10, 2, 20, 8);
  p.moduleQuarterPipe(-69, -28, Math.PI / 2, 3, 12);
  p.moduleQuarterPipe(-69, 34, Math.PI / 2, 2, 12);
  p.moduleQuarterPipe(69, 20, -Math.PI / 2, 2, 14);
  p.moduleQuarterPipe(69, -20, -Math.PI / 2, 3, 14);

  // Center: transition playground.
  p.modulePyramid(0, -2, 2);
  p.modulePyramid(-26, 22, 1);
  p.moduleSpine(16, 12, 0, 1, 12);
  p.moduleFunbox(-22, -2, 0, 1, 8, 4);
  p.moduleFunbox(28, -24, Math.PI / 2, 2, 10, 4);
  p.moduleKicker(-22, 32, 0, 1, 6);
  p.moduleKicker(34, 4, Math.PI / 2, 2, 6);
  p.moduleKicker(-34, -30, Math.PI / 2, 3, 8);
  p.moduleRoller(-10, 20, 0, 8);
  p.moduleRoller(-10, 25, 0, 8);
  p.moduleRoller(-10, 30, 0, 8);

  // Bowls.
  p.moduleBowl(38, 24, 2);
  p.moduleBowl(-48, 34, 1);

  // Street plaza.
  p.moduleStairs(58, 38, Math.PI, 1, 8);
  p.moduleLedge(8, 34, 0, 12, 0.5);
  p.moduleLedge(52, 8, Math.PI / 2, 12, 1);
  p.moduleManualPad(14, 18, 0, 8);
  p.moduleManualPad(40, -8, Math.PI / 2, 8);
  p.moduleRail(14, 0.5, 24, 23, 0.5, 24);
  p.moduleRail(44, 1.0, -28, 44, 1.0, -16);
  p.moduleRail(-38, 0.5, 4, -28, 0.5, 14);

  p.placeCollectibles([
    [-44, 3.4, -44.2], [-10, 4.6, -42.7], [16, 5.8, -41.2], [34, 2.2, -45.6],
    [-26, 2.2, 45.6], [24, 3.4, 44.2],
    [-59, 3.6, 10], [-45, 3.6, 10],
    [38, 3.4, 13.2], [48.8, 3.4, 24], [38, 3.4, 34.8], [38, 4.4, 24],
    [-48, 2.2, 34], [-48, 2.8, 28.6],
    [0, 3.2, -2], [-26, 2.2, 22], [16, 2.4, 12], [-22, 2.2, -2], [28, 3.2, -24],
    [-22, 2.2, 32], [34, 3.2, 4], [-34, 4.2, -30],
    [18, 1.4, 24], [44, 1.9, -22], [-33, 1.4, 9], [8, 1.4, 34], [52, 1.9, 8], [58, 1.6, 34],
    [-10, 1.4, 25], [0, 0.9, 20], [-56, 0.9, -40], [58, 0.9, -38], [12, 0.9, -30],
  ]);
  p.placeBoostOrbs([
    [0, 1, 26], [-52, 1, 10], [38, 3.6, 24], [-10, 1, 34], [46, 1.2, -22],
    [-22, 1, -14], [12, 1, -36], [-62, 1, -30], [62, 1, 24], [0, 1, 8],
  ]);
}

/* ================================================================== */
/* 2. MEGA CANYON — desert mega-park with an elevated plateau zone     */
/* ================================================================== */

function buildMegaCanyon(p: SkateParkScene): void {
  // Perimeter rule: quarter pipes only on the walls, backs flush on the
  // inner faces (x ±96.5 / z ±66.5) — no bank-into-wall ramps, no gaps.

  // North rim: monster transitions (including a 6m vert wall).
  p.moduleQuarterPipe(-88, -66.5, 0, 3, 14);
  p.moduleQuarterPipe(-60, -66.5, 0, 4, 24);
  p.moduleQuarterPipe(-16, -66.5, 0, 6, 28);
  p.moduleQuarterPipe(24, -66.5, 0, 3, 20);
  p.moduleQuarterPipe(58, -66.5, 0, 4, 24);
  p.moduleQuarterPipe(84, -66.5, 0, 2, 14);

  // South returns.
  p.moduleQuarterPipe(-40, 66.5, Math.PI, 2, 20);
  p.moduleQuarterPipe(0, 66.5, Math.PI, 3, 20);
  p.moduleQuarterPipe(40, 66.5, Math.PI, 2, 20);
  p.moduleQuarterPipe(78, 66.5, Math.PI, 2, 16);

  // West mega-air zone: twin h5 kickers face off across a canyon gap.
  p.moduleKicker(-62, -10, Math.PI / 2, 5, 14);
  p.moduleKicker(-34, -10, Math.PI / 2, 5, 14);
  p.moduleQuarterPipe(-96.5, 24, Math.PI / 2, 4, 18);
  p.moduleQuarterPipe(-96.5, -30, Math.PI / 2, 3, 16);
  p.moduleHalfPipe(-58, 42, 3, 24, 10);

  // East wall QPs (the plateau drop corridor stays clear between them).
  p.moduleQuarterPipe(96.5, 30, -Math.PI / 2, 3, 16);
  p.moduleQuarterPipe(96.5, -45, -Math.PI / 2, 2, 14);

  // Center: mega pyramid + spine + bowls.
  p.modulePyramid(0, 0, 4);
  p.moduleSpine(28, -26, 0, 2, 16);
  p.moduleBowl(36, 34, 3);
  p.moduleBowl(-14, 30, 1);

  // EAST PLATEAU (y=6): ride up the giant banks, launch off the edge.
  p.moduleBox(70, -10, 0, 40, 6, 36); // plateau body: x 50..90, z -28..8
  p.moduleBank(50, -10, -Math.PI / 2, 6, 30);   // west approach bank
  p.moduleBank(70, -28, Math.PI, 6, 24);        // north approach bank
  p.moduleQuarterPipe(70, 7.6, Math.PI, 2, 20, 2.4, 6); // QP on the plateau's south edge
  p.moduleKicker(64, -10, Math.PI / 2, 2, 8, 6);        // kicker ON TOP → mega air off the drop
  // Drop-edge grind line on the EAST rim (the west/north rims are the bank
  // entries — a rail there would clothesline riders cresting the climb).
  p.moduleRail(90, 6.5, -24, 90, 6.5, 4);
  p.moduleRoller(80, -10, 0, 8, 6);

  // Floor street. Spawn runs straight north up x=0 — keep that corridor
  // clean (rollers only), so the first grind rail runs PARALLEL to the lane
  // off to the right (grind it lengthwise) instead of crossing the spawn.
  p.moduleStairs(60, 50, Math.PI, 2, 10);
  p.moduleLedge(16, 52, 0, 14, 0.5);
  p.moduleLedge(-80, -36, Math.PI / 2, 14, 1);
  p.moduleManualPad(-32, 52, 0, 10);
  p.moduleRail(10, 0.5, 50, 10, 0.5, 38);
  p.moduleRail(14, 1.0, -44, 34, 1.0, -44);
  p.moduleRoller(0, 22, 0, 10);
  p.moduleRoller(0, 28, 0, 10);
  p.moduleRoller(0, 34, 0, 10);

  p.placeCollectibles([
    // twin-kicker gap arc (huge air line)
    [-48, 7.5, -10], [-48, 8.5, -14], [-48, 8.5, -6],
    // monster QP airs
    [-16, 8.6, -55.5], [-60, 6.4, -56.6], [24, 5, -57.8],
    // plateau drop arcs
    [46, 8, -10], [42, 7, -10], [70, 9.6, 14], [64, 9, -10],
    // pyramid + spine + bowls
    [0, 5.2, 0], [28, 3.4, -26], [36, 4.4, 34], [-14, 2.2, 30],
    // halfpipe + banks
    [-58, 4.6, 42], [-88, 5, 24],
    // rails/ledges/stairs
    [10, 1.4, 44], [24, 1.9, -44], [90, 7, -10], [16, 1.4, 52], [-80, 2.4, -36], [60, 2.6, 48],
    // cruise
    [0, 0.9, 12], [-40, 0.9, 20], [70, 6.9, -10], [84, 0.9, 40], [-70, 0.9, -40],
  ]);
  p.placeBoostOrbs([
    [0, 1, 40], [-48, 1, -10], [70, 6.8, 0], [36, 4, 34], [-58, 1, 42],
    [30, 1, 0], [-80, 1, 0], [80, 1, 30], [0, 1, -40], [50, 1, 20], [-30, 1, -50],
  ]);
}

/* ================================================================== */
/* 3. POWDER PEAK — snowboard mountain: tiered terraces, huge drops    */
/* ================================================================== */

function buildPowderPeak(p: SkateParkScene): void {
  // The mountain: three full-width terraces descending from the north
  // wall, connected by giant banks. Bombing south = big speed; every
  // terrace edge has kickers for massive drop airs.
  // Width 193 spans wall-to-wall (x ±96.5) and the summit shelf reaches
  // the back wall (z −66.5) — no side/back gaps around the mountain.
  p.moduleBox(0, -59.75, 0, 193, 9, 13.5);     // summit shelf (y top = 9)
  p.moduleBank(0, -53, 0, 3, 193, 6);          // 9 → 6
  p.moduleBox(0, -42, 0, 193, 6, 10);          // shelf 2
  p.moduleBank(0, -37, 0, 3, 193, 3);          // 6 → 3
  p.moduleBox(0, -26, 0, 193, 3, 12);          // shelf 3
  p.moduleBank(0, -20, 0, 3, 193, 0);          // 3 → ground

  // Drop-air kickers on the shelves.
  p.moduleKicker(-30, -42, 0, 2, 10, 6);
  p.moduleKicker(30, -42, 0, 2, 10, 6);
  p.moduleKicker(0, -26, 0, 2, 12, 3);
  p.moduleKicker(-60, -26, 0, 1, 8, 3);
  p.moduleKicker(60, -26, 0, 1, 8, 3);

  // Summit toys.
  p.moduleSpine(0, -59, 0, 1, 14, 9);
  p.moduleRoller(-50, -59, 0, 10, 9);
  p.moduleRoller(50, -59, 0, 10, 9);

  // Big mountain down-rail from shelf 3 to the flats.
  p.moduleRail(46, 3.6, -20, 46, 0.6, -6);
  p.moduleRail(-46, 3.6, -20, -46, 0.6, -6);

  // The flats: halfpipe, bowls, mogul field, ice rails.
  p.moduleHalfPipe(-56, 24, 3, 26, 10);
  p.moduleBowl(44, 20, 2);
  p.moduleBowl(74, 46, 1);
  for (let i = 0; i < 6; i++) {
    p.moduleRoller(14 + (i % 3) * 12, 2 + Math.floor(i / 3) * 6, 0, 8);
  }
  // Ice rails kept OUT of the spawn lane (spawn runs straight north at
  // x=0 — nothing perpendicular in that corridor).
  p.moduleRail(16, 0.5, 40, 40, 0.5, 40);      // long ice rail, east side
  p.moduleRail(-30, 1.0, 12, -14, 1.0, 12);    // high ice rail, west side
  p.moduleLedge(20, 52, 0, 14, 0.5);
  p.moduleManualPad(-40, 48, 0, 10);

  // Spawn lane: a friendly starter kicker, then a clean run at the
  // mountain banks — first 20 seconds = jump, climb, drop. That's the loop.
  p.moduleKicker(0, 34, 0, 1, 10);

  // South wall returns to pump back toward the mountain — all QPs, flush
  // on the wall face (z 66.5), plus one wall QP per side in the flats.
  p.moduleQuarterPipe(-30, 66.5, Math.PI, 2, 20);
  p.moduleQuarterPipe(30, 66.5, Math.PI, 2, 20);
  p.moduleQuarterPipe(-70, 66.5, Math.PI, 2, 12);
  p.moduleQuarterPipe(70, 66.5, Math.PI, 2, 12);
  p.moduleQuarterPipe(-96.5, 45, Math.PI / 2, 2, 14);
  p.moduleQuarterPipe(96.5, 16, -Math.PI / 2, 2, 14);
  p.modulePyramid(-26, 14, 2); // moved off the spawn lane

  p.placeCollectibles([
    // drop arcs off the shelf kickers
    [-30, 10, -34], [30, 10, -34], [0, 7, -18], [-60, 5.5, -18], [60, 5.5, -18],
    // summit line
    [0, 10.4, -59], [-50, 10.4, -59], [50, 10.4, -59], [-20, 9.9, -59], [20, 9.9, -59],
    // mountain descent lane markers
    [0, 6.9, -48], [0, 3.9, -31], [0, 1.4, -14],
    // down-rails
    [46, 2.8, -14], [-46, 2.8, -14],
    // flats: halfpipe, bowls, moguls, rails, starter kicker
    [-56, 4.6, 24], [44, 3.4, 20], [74, 2.2, 46], [26, 1.4, 5], [28, 1.4, 40],
    [-22, 1.9, 12], [20, 1.4, 52], [0, 2.2, 34],
    // south returns + pyramid
    [-30, 3.4, 59.2], [30, 3.4, 59.2], [-26, 3.2, 14],
    // cruise
    [-80, 0.9, 30], [80, 0.9, 10], [0, 0.9, 48],
  ]);
  p.placeBoostOrbs([
    [0, 9.8, -59], [-40, 9.8, -59], [40, 9.8, -59],  // summit refills
    [0, 6.8, -42], [0, 3.8, -26],                     // shelf refills
    [-56, 1, 24], [44, 2.8, 20], [0, 2.3, 34], [-70, 1, 0], [70, 1, -6], [20, 1, 20],
  ]);
}

/* ================================================================== */

export const LEVELS: LevelConfig[] = [
  {
    id: 'cone-park',
    name: 'Cone Park',
    blurb: 'The classic neighborhood park. Balanced lines, friendly transitions.',
    icon: '🚧',
    bounds: { x: 67.5, z: 47.5 },
    spawn: { x: 0, z: 40, yaw: Math.PI },
    theme: {
      // Cool grey concrete floor vs warm plywood ramps — clear contrast.
      ground: 0xbdbfc4, groundDark: 0x9a9ca4, ramp: 0xcb9f61, rampAlt: 0xb98a49,
      surround: 0x6cbf5a, rail: 0xf0c93d, treeCrown: 0x4fae52, treeTrunk: 0x7a5230,
    },
    build: buildConePark,
  },
  {
    id: 'mega-canyon',
    name: 'Mega Canyon',
    blurb: 'Desert mega-park. Monster verts, a twin-kicker gap, and a plateau to huck off.',
    icon: '🏜️',
    bounds: { x: 95, z: 65 },
    spawn: { x: 0, z: 56, yaw: Math.PI },
    theme: {
      // Pale sun-bleached concrete pad vs richer wood ramps.
      ground: 0xcbc6ba, groundDark: 0xa8a091, ramp: 0xc0813f, rampAlt: 0xa96e30,
      surround: 0xc47a4a, rail: 0xffb347, treeCrown: 0x7a9e4e, treeTrunk: 0x8a5a30,
      skyPresets: ['Noon', 'Sunset', 'Dawn'],
    },
    build: buildMegaCanyon,
  },
  {
    id: 'powder-peak',
    name: 'Powder Peak',
    blurb: 'Snowboard mountain. Bomb three terraces of powder and catch HUGE drop airs.',
    icon: '🏔️',
    bounds: { x: 95, z: 65 },
    spawn: { x: 0, z: 56, yaw: Math.PI },
    physics: { speedMul: 1.2, turnMul: 0.85 }, // waxed base: faster, driftier
    theme: {
      // Snow-white floor vs warm wooden ramps — pops hard against the powder.
      ground: 0xeef3f8, groundDark: 0xd4dfe8, ramp: 0xbf9560, rampAlt: 0xa87f4b,
      surround: 0xe6eef5, rail: 0x7fd8ff, treeCrown: 0x2e5e46, treeTrunk: 0x5a4030,
      snowPines: true,
      skyPresets: ['Alpine', 'Noon', 'Minty', 'Dusk'],
    },
    build: buildPowderPeak,
  },
];

export function levelById(id: string): LevelConfig {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
