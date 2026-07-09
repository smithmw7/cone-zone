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
  // The curved perimeter is the boundary now — this is all interior content,
  // kept inside the ~7m transition (|x|<58, |z|<38) and laid out in lines you
  // can CHAIN: launch → grind → hop → land, over and over.

  // Spawn (0,40) bombs north. Keep the x≈0 lane clear, then a mega DROP-IN is
  // the flagship: ride up the back from the spawn side, plunge north across
  // the whole park.
  p.moduleRoller(0, 30, 0, 12);
  p.moduleDropIn(0, 12, Math.PI, 5, 18);

  // LEFT chain line (x=-26): kicker → rail → ledge, all aligned down z.
  p.moduleKicker(-26, 26, 0, 1, 8);
  p.moduleRail(-26, 0.6, 14, -26, 0.6, 0);
  p.moduleLedge(-26, -14, 0, 10, 0.6);

  // RIGHT chain line (x=26): manual pad → funbox → rail.
  p.moduleManualPad(26, 26, 0, 10);
  p.moduleFunbox(26, 8, 0, 1, 9, 5);
  p.moduleRail(26, 0.6, -8, 26, 0.6, -22);

  // North landing zone off the drop-in: spine + flanking pyramids.
  p.moduleSpine(0, -20, Math.PI / 2, 1, 14);
  p.modulePyramid(-30, -26, 2);
  p.modulePyramid(30, -26, 2);

  // Transitions on the wings.
  p.moduleBowl(-46, 20, 2);
  p.moduleBowl(46, -18, 2);
  p.moduleHalfPipe(-46, -8, 2, 16, 8);

  // East plaza: stairs + hubba rail down them.
  p.moduleStairs(46, 30, Math.PI, 1, 8);
  p.moduleRail(46, 1.2, 24, 46, 0.4, 34);

  p.placeCollectibles([
    // spawn lane + the drop-in line (approach → deck → landing runway)
    [0, 1.3, 24], [0, 5.9, 12], [0, 1.3, 2], [0, 1.3, -6], [0, 1.3, -16],
    // left chain: over the kicker, along the rail, onto the ledge
    [-26, 2.8, 20], [-26, 1.3, 10], [-26, 1.3, 2], [-26, 1.4, -14],
    // right chain: pad, over the funbox, along the rail
    [26, 1.3, 24], [26, 2.6, 8], [26, 1.3, -12], [26, 1.3, -20],
    // north landing features: spine + pyramids
    [0, 2.1, -20], [-30, 3, -26], [30, 3, -26],
    // bowls + halfpipe (near their floors, grabbable on a lap)
    [-46, 1.3, 20], [46, 1.3, -18], [-46, 1.3, -8], [-46, 3.1, -8],
    // east stairs
    [46, 2.0, 28], [46, 1.3, 34],
    // open-floor cruisers
    [-15, 1.2, 34], [15, 1.2, 34], [-42, 1.2, -28], [42, 1.2, 28], [0, 1.2, -32],
    [-16, 1.2, 0], [16, 1.2, 0],
  ]);
  p.placeBoostOrbs([
    [0, 1, 34], [0, 1, -24], [-26, 1, 20], [26, 1, 20], [-46, 1, -8],
    [46, 1, -18], [-46, 1, 20], [-30, 1, -26], [30, 1, -26], [0, 1, -2],
  ]);
}

/* ================================================================== */
/* 2. MEGA CANYON — desert mega-park with an elevated plateau zone     */
/* ================================================================== */

function buildMegaCanyon(p: SkateParkScene): void {
  // Curved perimeter = boundary. Interior fits inside the ~7m transition
  // (|x|<86, |z|<56), built as chainable lines around the signature
  // twin-kicker gap + east plateau, with a mega drop-in flagship.

  // Spawn (0,56) bombs north: warm-up roller, then the mega drop-in.
  p.moduleRoller(0, 46, 0, 16);
  p.moduleDropIn(0, 24, Math.PI, 6, 24);

  // Twin-kicker canyon gap (identity): two 5m kickers face off in the west.
  p.moduleKicker(-58, 6, Math.PI / 2, 5, 16);
  p.moduleKicker(-30, 6, -Math.PI / 2, 5, 16);

  // Center landing zone off the drop-in.
  p.moduleSpine(0, -8, Math.PI / 2, 2, 18);
  p.modulePyramid(0, -40, 3);

  // EAST PLATEAU (top y=6): ride the west bank up, launch off the south edge.
  p.moduleBox(64, -6, 0, 36, 6, 34);                   // plateau x46..82, z-23..11
  p.moduleBank(44, -6, -Math.PI / 2, 6, 30);           // west approach bank
  p.moduleQuarterPipe(64, 12, Math.PI, 3, 24, 2.4, 6); // launch QP on the south edge
  p.moduleKicker(58, -6, Math.PI / 2, 2, 8, 6);        // kicker on top → mega drop air
  p.moduleRail(82, 6.5, -18, 82, 6.5, 6);              // east-rim grind line

  // Transitions on the wings.
  p.moduleBowl(-30, 36, 3);
  p.moduleBowl(34, 40, 2);
  p.moduleHalfPipe(-66, 30, 3, 26, 10);

  // Chain lines on the flanks: pad→rail→ledge (west), stairs+hubba (east).
  p.moduleManualPad(-44, 46, 0, 12);
  p.moduleRail(-44, 0.6, 40, -44, 0.6, 24);
  p.moduleLedge(-44, 10, 0, 12, 0.6);
  p.moduleStairs(42, 46, Math.PI, 2, 10);
  p.moduleRail(42, 1.4, 40, 42, 0.4, 52);

  p.placeCollectibles([
    // drop-in line: approach → deck → landing runway
    [0, 1.3, 40], [0, 7, 24], [0, 1.3, 10], [0, 1.3, -6], [0, 1.3, -22],
    // twin-kicker gap arc (reachable off the 5m kickers)
    [-44, 6, 6], [-44, 6.5, 0], [-44, 6.5, 12],
    // center features
    [0, 3, -8], [0, 4, -40],
    // plateau line: bank approach → deck → launch air → east rim
    [44, 1.3, -6], [64, 7, -6], [64, 9, 16], [82, 7, -6],
    // bowls + halfpipe
    [-30, 1.3, 36], [34, 1.3, 40], [-66, 1.3, 30], [-66, 4, 30],
    // flank chains
    [-44, 1.3, 46], [-44, 1.3, 32], [-44, 1.4, 10], [42, 2.4, 44], [42, 1.3, 52],
    // cruisers
    [-20, 1.2, 50], [20, 1.2, 50], [-70, 1.2, -20], [60, 1.2, 34], [0, 1.2, -30],
  ]);
  p.placeBoostOrbs([
    [0, 1, 44], [0, 1, -14], [-44, 1, 6], [64, 6.8, -6], [-30, 1, 36],
    [34, 1, 40], [-66, 1, 30], [-44, 1, 32], [42, 1, 46], [0, 1, -40], [44, 1, -6],
  ]);
}

/* ================================================================== */
/* 3. POWDER PEAK — snowboard mountain: tiered terraces, huge drops    */
/* ================================================================== */

function buildPowderPeak(p: SkateParkScene): void {
  // The mountain: three terraces descending south, connected by giant
  // banks. Skate north up the banks to the summit, then bomb SOUTH for big
  // speed — every terrace edge has kickers for drop airs. Sized to sit
  // inside the curved perimeter (width 168, back at z=-54).
  p.moduleBox(0, -54, 0, 168, 9, 12);          // summit shelf (top y = 9)
  p.moduleBank(0, -48, 0, 3, 168, 6);          // 9 → 6
  p.moduleBox(0, -37, 0, 168, 6, 10);          // shelf 2
  p.moduleBank(0, -32, 0, 3, 168, 3);          // 6 → 3
  p.moduleBox(0, -21, 0, 168, 3, 12);          // shelf 3
  p.moduleBank(0, -15, 0, 3, 168, 0);          // 3 → ground

  // Drop-air kickers on the shelves (launch south = the bomb direction).
  p.moduleKicker(-30, -37, 0, 2, 10, 6);
  p.moduleKicker(30, -37, 0, 2, 10, 6);
  p.moduleKicker(0, -21, 0, 2, 12, 3);
  p.moduleKicker(-56, -21, 0, 1, 8, 3);
  p.moduleKicker(56, -21, 0, 1, 8, 3);

  // Summit toys + a mountain down-rail on each side into the flats.
  p.moduleSpine(0, -54, 0, 1, 14, 9);
  p.moduleRoller(-48, -54, 0, 10, 9);
  p.moduleRoller(48, -54, 0, 10, 9);
  p.moduleRail(46, 3.4, -15, 46, 0.6, -1);
  p.moduleRail(-46, 3.4, -15, -46, 0.6, -1);

  // The flats (south): a mega drop-in to session, plus bowls, halfpipe and
  // rails off to the sides so the x≈0 spawn lane stays clean.
  p.moduleDropIn(0, 20, Math.PI, 5, 18);
  p.moduleHalfPipe(-60, 30, 3, 24, 10);
  p.moduleBowl(50, 30, 2);
  p.moduleBowl(-30, 46, 1);
  p.moduleManualPad(30, 46, 0, 12);
  p.moduleRail(30, 0.6, 40, 30, 0.6, 26);
  p.moduleLedge(-14, 8, 0, 12, 0.6);
  p.modulePyramid(-30, 8, 2);

  p.placeCollectibles([
    // drop arcs off the shelf kickers (just above each 2–3m kicker)
    [-30, 5.5, -32], [30, 5.5, -32], [0, 5, -16], [-56, 4, -16], [56, 4, -16],
    // summit line (on the shelf, y top 9)
    [0, 10, -54], [-40, 10, -54], [40, 10, -54], [-20, 10, -54], [20, 10, -54],
    // mountain descent markers (on each shelf surface)
    [0, 7, -44], [0, 4, -33], [0, 1.4, -12],
    // side down-rails
    [46, 2.6, -9], [-46, 2.6, -9],
    // flats: drop-in line + halfpipe + bowls
    [0, 1.3, 34], [0, 5.9, 20], [0, 1.3, 8], [-60, 1.3, 30], [-60, 4, 30],
    [50, 1.3, 30], [-30, 1.3, 46],
    // right chain + pyramid + ledge
    [30, 1.3, 46], [30, 1.3, 32], [-30, 3, 8], [-14, 1.4, 8],
    // cruisers
    [-20, 1.2, 50], [20, 1.2, 50], [-70, 1.2, 6], [70, 1.2, 20],
  ]);
  p.placeBoostOrbs([
    [0, 10, -54], [-40, 10, -54], [40, 10, -54],   // summit refills
    [0, 7, -44], [0, 4, -33],                       // shelf refills
    [-60, 1, 30], [50, 1, 30], [0, 1, 34], [30, 1, 40], [-30, 1, 46], [0, 1, 0],
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
