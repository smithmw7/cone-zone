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
  // MAIN LAUNCH: the first camera axis reads as one complete line from the
  // spawn marker to the covered hero quarter, with forgiving space between
  // each takeoff and landing.
  p.moduleRoller(0, 34, 0, 12);
  p.moduleAFrame(0, 22, 0, 1.3, 12, 5);
  p.moduleSpine(0, 7, 0, 1.25, 14);
  p.moduleHeroQuarter(0, -22, 0, 3.5, 18);

  // WEST STREET LOOP: every piece points down the same travel axis and the
  // quarter at the end turns the rider back toward the center transfer.
  p.moduleBank(-30, 29, 0, 1.3, 12);
  p.moduleManualPad(-30, 20, Math.PI / 2, 10);
  p.moduleRail(-27, 0.62, 12, -27, 0.62, 1);
  p.moduleStairs(-25, -6, Math.PI, 1, 9);
  p.moduleLedge(-20, -13, Math.PI / 2, 10, 0.62);
  p.moduleQuarterPipe(-30, -28, 0, 2.6, 15);

  // EAST BOWL LOOP: a broad hip leads into the bowl, then a lateral spine
  // offers either a transfer back to center or a run to the return quarter.
  p.modulePyramid(20, 28, 1.5);
  p.moduleBowl(39, 7, 2.4, 0, 'concrete');
  p.moduleSpine(20, -8, Math.PI / 2, 1.3, 12);
  p.moduleQuarterPipe(40, -28, 0, 2.6, 15);

  // Foreground street details frame the main line without entering its
  // landing corridor.
  p.moduleLedge(-17, 30, Math.PI / 2, 10, 0.55);
  p.moduleRail(17, 0.58, 34, 17, 0.58, 23);

  // The shack is an edge landmark now, not a center-lane obstruction.
  p.moduleBurgerShack(-45, -23, 0);
  p.modulePatioCanopy(-45, -9, 0, 12, 6);
  p.modulePicnicTable(-48, -9, 0);
  p.modulePicnicTable(-41, -9, 0);
  p.modulePlanter(-51, 3, Math.PI / 2, 6);
  p.modulePlanter(29, 36, 0, 6);
  p.modulePlanter(43, 34, 0, 6);

  // Midground neighborhood layers: dark fence, then simple houses and the
  // existing foliage belt. These assets establish scale without collisions.
  p.moduleFenceLine(0, -40, 0, 104);
  p.moduleFenceLine(-58, 0, Math.PI / 2, 66);
  p.moduleFenceLine(58, 0, Math.PI / 2, 66);
  p.moduleSuburbanHouse(-40, -49, 0, 0xd9d0bd);
  p.moduleSuburbanHouse(0, -51, 0, 0xc7d3d8);
  p.moduleSuburbanHouse(40, -49, 0, 0xe1c6ad);

  p.placeCollectibles([
    // Main launch line.
    [0, 1.25, 34], [0, 2.3, 22], [0, 2.05, 7], [0, 1.25, -8], [0, 4.25, -20],
    // West street loop.
    [-30, 2.15, 29], [-30, 1.25, 23], [-30, 1.25, 12], [-30, 1.25, 3],
    [-28, 2.0, -7], [-23, 1.35, -13], [-30, 3.25, -26],
    // East bowl loop.
    [20, 2.35, 28], [31, 1.25, 18], [39, 1.25, 7], [30, 1.25, -3],
    [20, 2.1, -8], [40, 3.25, -26],
    // Connectors and landmark route.
    [-17, 1.2, 30], [12, 1.2, 28], [-14, 1.2, -7], [14, 1.2, -7],
    [-45, 1.25, -19], [-42, 1.2, 18], [46, 1.2, 29],
    // Alternate respawn pool: these stay hidden initially and rotate in as
    // the first 30 coins are collected during an endless session.
    [-8, 1.2, 32], [8, 1.2, 28], [-8, 1.2, 16], [8, 1.2, 13], [-8, 1.2, -2],
    [12, 1.2, -16], [-38, 1.2, 33], [-38, 1.2, 21], [-38, 1.2, 9],
    [-38, 1.2, -3], [-38, 1.2, -15], [20, 1.2, 36], [50, 1.2, -14],
    [31, 1.2, -16], [-52, 1.2, 12],
  ], 30);
  p.placeBoostOrbs([
    [0, 1, 38], [0, 1, 14], [0, 1, -12], [-24, 1, 26], [-30, 1, -18],
    [20, 1, 22], [29, 1, -8], [40, 1, -18], [-55, 1, -25],
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

  // Burger Shack drive-through in the middle of the canyon.
  p.moduleBurgerShack(0, 4, 0);

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
  p.moduleBowl(-66, -30, 3);
  p.moduleBowl(60, -40, 2);
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
    [-66, 1.3, -30], [60, 1.3, -40], [-66, 1.3, 30], [-66, 4, 30],
    // flank chains
    [-44, 1.3, 46], [-44, 1.3, 32], [-44, 1.4, 10], [42, 2.4, 44], [42, 1.3, 52],
    // cruisers
    [-20, 1.2, 50], [20, 1.2, 50], [-70, 1.2, -20], [30, 1.2, 34], [0, 1.2, -30],
  ]);
  p.placeBoostOrbs([
    [0, 1, 44], [0, 1, -14], [-44, 1, 6], [64, 6.8, -6], [-66, 1, -30],
    [60, 1, -40], [-66, 1, 30], [-44, 1, 32], [42, 1, 46], [0, 1, -40], [44, 1, -6],
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
  p.moduleBurgerShack(0, 0, 0);
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
/* Shared parametric park — a solid, chainable, reachable-coin layout   */
/* scaled to any bounds. New themed levels build on top of it.          */
/* ================================================================== */

function basicPark(p: SkateParkScene, X: number, Z: number): void {
  const kx = Math.round(X * 0.42);
  const near = Z - 10;
  const mid = Z * 0.28;

  // Flagship mega drop-in bombs north from the spawn side.
  p.moduleRoller(0, near, 0, 14);
  p.moduleDropIn(0, mid, Math.PI, 5, 18);

  // Left chain: kicker → rail → ledge (aligned down z).
  p.moduleKicker(-kx, Z * 0.3, 0, 1, 8);
  p.moduleRail(-kx, 0.6, Z * 0.15, -kx, 0.6, 0);
  p.moduleLedge(-kx, -Z * 0.2, 0, 10, 0.6);

  // Right chain: manual pad → funbox → rail.
  p.moduleManualPad(kx, Z * 0.3, 0, 10);
  p.moduleFunbox(kx, Z * 0.08, 0, 1, 9, 5);
  p.moduleRail(kx, 0.6, -Z * 0.08, kx, 0.6, -Z * 0.28);

  // Center: the Burger Shack drive-through (drop-in landing flows into it).
  p.moduleBurgerShack(0, -4, 0);

  // North landing.
  p.moduleSpine(0, -Z * 0.22, Math.PI / 2, 1, 14);
  p.modulePyramid(-X * 0.5, -Z * 0.55, 2);
  p.modulePyramid(X * 0.5, -Z * 0.55, 2);

  // Wing transitions + a street corner.
  p.moduleBowl(-X * 0.7, Z * 0.28, 2);
  p.moduleBowl(X * 0.7, -Z * 0.25, 2);
  p.moduleHalfPipe(-X * 0.72, -Z * 0.05, 2, 16, 8);
  p.moduleStairs(X * 0.6, Z * 0.5, Math.PI, 1, 8);
  p.moduleRail(X * 0.6, 1.2, Z * 0.42, X * 0.6, 0.4, Z * 0.6);

  p.placeCollectibles([
    // drop-in line
    [0, 1.3, near - 4], [0, 5.9, mid], [0, 1.3, mid - 12], [0, 1.3, -6], [0, 1.3, -Z * 0.4],
    // left chain
    [-kx, 2.8, Z * 0.26], [-kx, 1.3, Z * 0.08], [-kx, 1.4, -Z * 0.2],
    // right chain
    [kx, 1.3, Z * 0.3], [kx, 2.6, Z * 0.08], [kx, 1.3, -Z * 0.2],
    // center + pyramids
    [0, 2.1, -Z * 0.22], [-X * 0.5, 3, -Z * 0.55], [X * 0.5, 3, -Z * 0.55],
    // wings
    [-X * 0.7, 1.3, Z * 0.28], [X * 0.7, 1.3, -Z * 0.25], [-X * 0.72, 1.3, -Z * 0.05], [-X * 0.72, 3, -Z * 0.05],
    [X * 0.6, 1.6, Z * 0.5],
    // cruisers
    [-X * 0.35, 1.2, Z * 0.5], [X * 0.35, 1.2, Z * 0.5], [-X * 0.55, 1.2, -Z * 0.2], [X * 0.55, 1.2, Z * 0.2], [0, 1.2, Z * 0.1],
  ]);
  p.placeBoostOrbs([
    [0, 1, near], [0, 1, -Z * 0.3], [-kx, 1, Z * 0.2], [kx, 1, Z * 0.2], [-X * 0.72, 1, -Z * 0.05],
    [X * 0.7, 1, -Z * 0.25], [-X * 0.7, 1, Z * 0.28], [0, 1, -Z * 0.5], [X * 0.6, 1, Z * 0.5], [0, 1, 0],
  ]);
}

/* 4. SUNNY COVE — one large connected destination park. */
function buildSunnyCove(p: SkateParkScene): void {
  // C. SLOPESTYLE HEADLAND: three readable lines descend from one broad
  // overlook. Every lane has a clean miss route and feeds the central hub.
  p.moduleBox(0, 82, 0, 108, 6, 20, 0, 0xb9ada0);
  p.moduleBank(-36, 72, Math.PI, 6, 24);
  p.moduleBank(0, 72, Math.PI, 6, 24);
  p.moduleBank(36, 72, Math.PI, 6, 24);

  // Easy surf line.
  p.moduleRoller(-36, 54, 0, 15);
  p.moduleFunbox(-36, 39, 0, 0.8, 14, 5);
  p.moduleRoller(-36, 23, 0, 14);

  // Medium rail line.
  p.moduleKicker(0, 53, 0, 1.2, 15);
  p.moduleRail(6, 0.68, 44, 6, 0.68, 31);
  p.moduleAFrame(0, 18, 0, 1.25, 15, 5);

  // Advanced transfer line, with generous open runouts on both sides.
  p.moduleKicker(36, 53, 0, 1.8, 16);
  p.moduleSpine(36, 34, 0, 1.5, 15);
  p.moduleStairs(36, 14, Math.PI, 1.4, 12);

  // Wide cross-map transfer: a low spine and flanking rollers visibly hand
  // the downhill lines into either of the two arena districts.
  p.moduleRoller(-38, 4, Math.PI / 2, 18);
  p.moduleSpine(18, 4, 0, 1.15, 18);
  p.moduleRoller(38, 4, Math.PI / 2, 18);

  // A. LOOPING FLOW PLAZA (west): inward-facing transitions form a large
  // recovery circuit around a central street island and tangent bowl.
  p.moduleQuarterPipe(-121, -34, Math.PI / 2, 3, 24);
  p.moduleQuarterPipe(-16, -34, -Math.PI / 2, 3, 24);
  p.moduleHeroQuarter(-68, -79, 0, 4.2, 30);
  p.moduleQuarterPipe(-68, 2, Math.PI, 3, 28);
  p.moduleBowl(-101, -61, 2.6, 0, 'concrete');

  p.moduleAFrame(-68, -34, 0, 1.35, 17, 6);
  p.moduleManualPad(-91, -27, Math.PI / 2, 13);
  p.moduleRail(-88, 0.62, -47, -88, 0.62, -35);
  p.moduleLedge(-47, -53, Math.PI / 2, 13, 0.62);
  p.moduleSpine(-42, -20, Math.PI / 2, 1.2, 15);
  p.modulePyramid(-104, -13, 1.25);

  // B. CAMPUS TRICK WEB (east): two courtyards, a central transfer, and
  // perimeter returns. Features align with the east-west boulevard so the
  // player can loop either court or cross between them at several points.
  p.moduleQuarterPipe(18, -36, Math.PI / 2, 3, 24);
  p.moduleQuarterPipe(124, -36, -Math.PI / 2, 3, 24);
  p.moduleQuarterPipe(48, -79, 0, 2.7, 22);
  p.moduleHeroQuarter(96, 2, Math.PI, 4, 26);

  p.moduleFunbox(43, -36, Math.PI / 2, 1.1, 14, 6);
  p.moduleRail(38, 0.62, -55, 38, 0.62, -42);
  p.moduleManualPad(43, -17, 0, 12);
  p.moduleFunbox(99, -36, Math.PI / 2, 1.1, 14, 6);
  p.moduleRail(104, 0.62, -30, 104, 0.62, -17);
  p.moduleLedge(99, -57, 0, 12, 0.62);

  // Physical ramp links between the three districts. These are broad enough
  // to be ordinary routes, with the rails remaining optional side targets.
  p.moduleAFrame(-8, -35, Math.PI / 2, 1.25, 18, 7);
  p.moduleSpine(70, -36, 0, 1.35, 18);
  p.moduleBank(70, -7, Math.PI, 1.2, 20);
  p.moduleBank(-10, -7, Math.PI, 1.2, 18);

  // Coastal landmarks stay beyond the riding corridors and provide strong
  // navigation silhouettes from every district.
  p.modulePatioCanopy(-116, 73, 0, 18, 9);
  p.modulePicnicTable(-121, 73, 0);
  p.modulePicnicTable(-111, 73, 0);
  p.moduleBurgerShack(119, 72, Math.PI);
  p.modulePlanter(-126, 18, Math.PI / 2, 8);
  p.modulePlanter(128, 12, Math.PI / 2, 8);
  p.modulePlanter(128, -71, Math.PI / 2, 8);

  p.placeCollectibles([
    // Slopestyle lines and their alternate bypasses.
    [-36, 7.2, 68], [-36, 1.3, 58], [-36, 1.7, 39], [-36, 1.3, 28],
    [0, 7.2, 68], [0, 2.2, 53], [0, 1.35, 37], [0, 2.1, 18],
    [36, 7.2, 68], [36, 2.8, 53], [36, 2.4, 34], [36, 2.3, 14],
    [-18, 1.2, 55], [18, 1.2, 55], [-18, 1.2, 26], [18, 1.2, 26],
    // West flow circuit and street island.
    [-112, 1.2, -20], [-112, 1.2, -49], [-93, 1.2, -72], [-65, 1.2, -70],
    [-35, 1.2, -65], [-24, 1.2, -39], [-27, 1.2, -12], [-57, 1.2, -5],
    [-87, 1.2, -7], [-105, 1.2, -27], [-68, 2.2, -34], [-91, 1.2, -27],
    [-88, 1.25, -41], [-47, 1.35, -53], [-42, 2.0, -20], [-101, 1.2, -61],
    // East campus web.
    [27, 1.2, -19], [27, 1.2, -53], [48, 1.2, -69], [70, 1.2, -71],
    [94, 1.2, -69], [115, 1.2, -52], [115, 1.2, -20], [94, 1.2, -7],
    [68, 1.2, -10], [43, 2.0, -36], [43, 1.2, -17], [38, 1.25, -48],
    [99, 2.0, -36], [104, 1.25, -23], [99, 1.35, -57], [70, 2.2, -36],
    // Cross-map connectors and alternate endless respawn points.
    [-12, 1.2, -18], [8, 1.2, -18], [-8, 2.1, -35], [14, 1.2, -52],
    [-51, 1.2, 13], [-75, 1.2, 13], [55, 1.2, 11], [83, 1.2, 11],
    [-128, 1.2, -5], [130, 1.2, -8], [-129, 1.2, -55], [130, 1.2, -56],
  ], 44);

  p.placeBoostOrbs([
    [-36, 6.9, 78], [0, 6.9, 78], [36, 6.9, 78],
    [-36, 1, 11], [0, 1, 7], [36, 1, 11],
    [-110, 1, -35], [-68, 1, -68], [-30, 1, -35], [-68, 1, -8],
    [28, 1, -36], [70, 1, -67], [112, 1, -36], [70, 1, -9],
    [-8, 1, -55], [14, 1, -15],
  ]);
}

/* 5. CANOPY RUN — jungle rainforest: dense canopy, a lagoon. */
function buildCanopyRun(p: SkateParkScene): void {
  basicPark(p, 72, 64);
  // Jungle temple pyramid + twin kickers deeper in.
  p.modulePyramid(0, 40, 3);
  p.moduleKicker(-16, 44, 0, 2, 8);
  p.moduleKicker(16, 44, 0, 2, 8);
}

/* 6. REDWOOD COAST — towering redwoods over a cold coastline. */
function buildRedwoodCoast(p: SkateParkScene): void {
  basicPark(p, 80, 54);
  // A second, taller mega drop-in on the west + a long coastal rail.
  p.moduleDropIn(-46, -16, Math.PI / 2, 6, 16);
  p.moduleRail(0, 0.6, 44, 0, 0.6, 20);
}

/* 7. AQUEDUCT CITY — concrete channels + a raised highway of grind rails. */
function buildAqueductCity(p: SkateParkScene): void {
  basicPark(p, 88, 60);
  // The "highway": long parallel elevated grind rails you can bomb.
  p.moduleLedge(-44, 8, Math.PI / 2, 40, 1.2);
  p.moduleRail(-44, 1.7, 26, -44, 1.7, -14);
  p.moduleRail(44, 1.2, 30, 44, 1.2, -18);
  p.moduleStairs(-30, 46, Math.PI, 2, 12);
}

/* 8. SUNSET HARBOR — a marina at golden hour, pier ramps over the water. */
function buildSunsetHarbor(p: SkateParkScene): void {
  basicPark(p, 78, 58);
  // Pier: a big half-pipe + manual pads along the boardwalk.
  p.moduleHalfPipe(40, 30, 3, 20, 8);
  p.moduleManualPad(-20, 44, 0, 12);
  p.moduleManualPad(12, 44, 0, 12);
}

/* ================================================================== */

export const LEVELS: LevelConfig[] = [
  {
    id: 'cone-park',
    name: 'Cone Park',
    blurb: 'The classic neighborhood park. Balanced lines, friendly transitions.',
    bounds: { x: 67.5, z: 47.5 },
    spawn: { x: 0, z: 40, yaw: Math.PI },
    theme: {
      // Authored cool concrete and honey plywood make each module family read
      // at a glance while yellow steel ties the three routes together.
      ground: 0xe3e5e8, groundDark: 0xb9bdc3, ramp: 0xffefd0, rampAlt: 0xffdca0,
      surround: 0x6cbf5a, rail: 0xf0c93d, treeCrown: 0x4fae52, treeTrunk: 0x7a5230,
      treeCrown2: 0x397f43,
      skyPresets: ['Noon'],
      surfaceMaps: {
        concrete: 'textures/grill-yard/concrete.webp',
        wood: 'textures/grill-yard/plywood.webp',
        concreteScale: 0.13,
        woodScale: 0.18,
      },
    },
    build: buildConePark,
  },
  {
    id: 'mega-canyon',
    name: 'Mega Canyon',
    blurb: 'Desert mega-park. Monster verts, a twin-kicker gap, and a plateau to huck off.',
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
  {
    id: 'sunny-cove',
    name: 'Sunny Cove',
    blurb: 'A huge coastal destination linking slopestyle, flow park and campus lines.',
    bounds: { x: 145, z: 105 },
    spawn: { x: 0, y: 6.5, z: 78, yaw: Math.PI },
    theme: {
      ground: 0xddd5c7, groundDark: 0xb9ada0, ramp: 0x32aab7, rampAlt: 0xe8674f,
      surround: 0xf2cf78, rail: 0xff7657, treeCrown: 0x3ba65d, treeCrown2: 0x78cb52, treeTrunk: 0x9a6a3a,
      foliage: 'palm',
      water: { shallow: 0x35d5dc, deep: 0x087ca7, level: -0.55, surround: 38 },
      skyPresets: ['Noon'],
      surfaceMaps: {
        concrete: 'textures/sunny-cove/coastal-concrete.webp',
        wood: 'textures/sunny-cove/painted-ramp.webp',
        concreteScale: 0.16,
        woodScale: 0.2,
      },
    },
    build: buildSunnyCove,
  },
  {
    id: 'canopy-run',
    name: 'Canopy Run',
    blurb: 'Rainforest floor. Dense canopy, a hidden temple, a warm lagoon.',
    bounds: { x: 72, z: 64 },
    spawn: { x: 0, z: 56, yaw: Math.PI },
    theme: {
      ground: 0x8a9c5a, groundDark: 0x6f8046, ramp: 0xb98a49, rampAlt: 0xa2763b,
      surround: 0x4f7a3a, rail: 0xffd24d, treeCrown: 0x2f8f3e, treeCrown2: 0x4fb85a, treeTrunk: 0x6b4a2c,
      foliage: 'jungle',
      water: { shallow: 0x3fd0a8, deep: 0x1a8f78, level: -0.55, surround: 30 },
      skyPresets: ['Noon', 'Dawn', 'Minty'],
    },
    build: buildCanopyRun,
  },
  {
    id: 'redwood-coast',
    name: 'Redwood Coast',
    blurb: 'Giant redwoods over a cold, foggy coastline. Bomb the bluffs.',
    bounds: { x: 80, z: 54 },
    spawn: { x: 0, z: 46, yaw: Math.PI },
    theme: {
      ground: 0xa9b0a0, groundDark: 0x8b937f, ramp: 0xc08a52, rampAlt: 0xa5733f,
      surround: 0x5c7a52, rail: 0xe8b34d, treeCrown: 0x2e5e3e, treeCrown2: 0x3f7a4e, treeTrunk: 0x8a4a30,
      foliage: 'redwood',
      water: { shallow: 0x4a9fc0, deep: 0x24607e, level: -0.6, surround: 26 },
      skyPresets: ['Dawn', 'Dusk', 'Alpine'],
    },
    build: buildRedwoodCoast,
  },
  {
    id: 'aqueduct-city',
    name: 'Aqueduct City',
    blurb: 'Concrete channels and a highway of grind rails. Full-speed lines.',
    bounds: { x: 88, z: 60 },
    spawn: { x: 0, z: 52, yaw: Math.PI },
    physics: { speedMul: 1.1 },
    theme: {
      ground: 0xbfc2c8, groundDark: 0x92959c, ramp: 0xb9bcc2, rampAlt: 0x9a9da4,
      surround: 0x7a7d84, rail: 0xffcf3d, treeCrown: 0x4f9a54, treeCrown2: 0x6bc06f, treeTrunk: 0x6a5540,
      foliage: 'city',
      water: { shallow: 0x40b7e0, deep: 0x1f6f9e, level: -0.5, surround: 30 },
      skyPresets: ['Noon', 'Sunset', 'Dusk'],
    },
    build: buildAqueductCity,
  },
  {
    id: 'sunset-harbor',
    name: 'Sunset Harbor',
    blurb: 'Golden-hour marina. Pier ramps and glassy water everywhere.',
    bounds: { x: 78, z: 58 },
    spawn: { x: 0, z: 50, yaw: Math.PI },
    theme: {
      ground: 0xc9b48a, groundDark: 0xa9946c, ramp: 0xc98a4e, rampAlt: 0xb0743a,
      surround: 0xb89a6a, rail: 0xff8a3c, treeCrown: 0x4fa36a, treeCrown2: 0x6fce86, treeTrunk: 0x8a5a34,
      foliage: 'palm',
      water: { shallow: 0x59b8d8, deep: 0x2a6f9e, level: -0.5, surround: 26 },
      skyPresets: ['Sunset', 'Dawn', 'Dusk'],
    },
    build: buildSunsetHarbor,
  },
];

export function levelById(id: string): LevelConfig {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
