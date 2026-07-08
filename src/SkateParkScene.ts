/**
 * SkateParkScene
 * --------------
 * The park is assembled from a MODULAR, GRID-ALIGNED element library —
 * lego-style pieces that share consistent proportions so they line up:
 *
 *   GRID   = 2m   — footprints and positions snap to multiples of this
 *   HEIGHTS       — every element comes in 4 sizes: 1m, 2m, 3m, 4m
 *   SLOPE  = 2·h  — every straight slope runs 2m per 1m of rise (26.57°),
 *                   so any two banked pieces meet at matching angles
 *   QP RADIUS     — quarter pipe radius = 1.6·h so the lip lands at h
 *
 * Module library (each is visual + exact colliders):
 *   bank, kicker, funbox, pyramid, quarter pipe, half pipe (2 QPs),
 *   spine (2 QPs back-to-back), ledge, rail (flat/diagonal/down),
 *   stairs + handrail, manual pad, roller, perimeter walls
 *
 * Collision philosophy — the player must NEVER clip through anything:
 *   - curved/sloped shapes register their RENDER GEOMETRY as a Rapier
 *     trimesh (tagged `userData.collide = 'trimesh'`), so the physics
 *     surface is pixel-identical to the visual surface
 *   - boxy shapes (tagged 'box') register exact cuboids
 *   - rails/coping/posts get "bonk-only" cylinders: the ground ray skips
 *     them (grinding stays analytic) but the controller's wall rays hit
 *     them, so riding into a pipe bounces you off
 */
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { SkySystem } from './SkySystem';

export interface RailSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  dir: THREE.Vector3; // normalized a→b
  length: number;
  label?: 'rail' | 'lip'; // lips get their own trick callout
}

interface Collectible {
  mesh: THREE.Group;
  taken: boolean;
  /** boost orbs respawn; coins don't (until the run resets) */
  respawnAt?: number;
}

/* ------------------------- grid constants ------------------------- */

export const GRID = 2;              // base unit (m) — placements snap to this
const SLOPE_RUN = 2;                // slope run per 1m of rise (26.57°)
const QP_MAX_ANGLE = (68 * Math.PI) / 180;
const QP_RADIUS_PER_H = 1 / (1 - Math.cos(QP_MAX_ANGLE)); // lip height == h

export const PARK_BOUNDS = { x: 67.5, z: 47.5 }; // player clamp half-extents
const WALL_HEIGHT = 3;

const CONCRETE = 0xcfc5b2;
const CONCRETE_DARK = 0xb4a892;
const RAMP_COLOR = 0xd8cdb8;
const RAMP_ALT = 0xc9b9a4;
const RAIL_COLOR = 0xf0c93d;

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function yawQuat(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
}

/**
 * Solid triangular prism: vertical back face at z=0 (height `h`), slope
 * descending to z=`run`, closed bottom and sides, outward winding.
 */
function makeWedgeGeometry(w: number, h: number, run: number): THREE.BufferGeometry {
  const hw = w / 2;
  const btl = [-hw, h, 0], btr = [hw, h, 0];
  const bbl = [-hw, 0, 0], bbr = [hw, 0, 0];
  const fbl = [-hw, 0, run], fbr = [hw, 0, run];
  const tris = [
    btl, fbr, btr, btl, fbl, fbr, // slope
    btl, btr, bbr, btl, bbr, bbl, // back
    bbl, bbr, fbr, bbl, fbr, fbl, // bottom
    bbr, btr, fbr,                // +x side
    bbl, fbl, btl,                // -x side
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Quarter pipe cross-section, extruded to `width`. Local frame: back wall
 * at z=0, deck top at y=lipY from z=0..deckDepth, curve from the lip down
 * to ground level at z = deckDepth + R·sin(maxAngle). One closed profile,
 * so the trimesh is solid: deck, curve, sides and back all collide.
 */
function makeQuarterPipeGeometry(width: number, h: number, deckDepth: number): {
  geo: THREE.BufferGeometry;
  lipY: number;
  lipZ: number;
  toeZ: number;
} {
  const R = h * QP_RADIUS_PER_H;
  const lipY = h;
  const sinMax = Math.sin(QP_MAX_ANGLE);
  const lipZ = deckDepth;
  const toeZ = deckDepth + R * sinMax;

  const shape = new THREE.Shape(); // shape.x = local z, shape.y = local y
  shape.moveTo(0, 0);
  shape.lineTo(0, lipY);
  shape.lineTo(lipZ, lipY);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const a = QP_MAX_ANGLE * (1 - i / steps);
    shape.lineTo(deckDepth + R * (sinMax - Math.sin(a)), R * (1 - Math.cos(a)));
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // Map shape space into module space: shape.x → local z, extrusion → local x.
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return { geo, lipY, lipZ, toeZ };
}

export class SkateParkScene {
  scene = new THREE.Scene();
  rails: RailSegment[] = [];
  spawnPoint = new THREE.Vector3(0, 0.5, 40);
  spawnYaw = Math.PI; // face into the park (-z)
  totalCollectibles = 0;
  sky!: SkySystem;

  private collectibles: Collectible[] = [];
  private orbs: Collectible[] = [];
  private spinTime = 0;
  private elapsed = 0;
  private wedgeGeoCache = new Map<string, THREE.BufferGeometry>();

  constructor(private physics: PhysicsWorld) {
    this.buildEnvironment();
    this.buildGroundAndWalls();
    this.buildLampPosts();
    this.buildLayout();
    this.placeCollectibles();
    this.placeBoostOrbs();
  }

  /* ================================================================ */
  /* Layout — the actual course, zone by zone.                        */
  /* Coordinates are grid-aligned; x: -70..70, z: -50..50.            */
  /* ================================================================ */

  private buildLayout(): void {
    // ---- North wall: a run of quarter pipes at all 4 heights ----
    this.moduleQuarterPipe(-44, -48.4, 0, 2, 20);
    this.moduleQuarterPipe(-10, -48.4, 0, 3, 24);
    this.moduleQuarterPipe(16, -48.4, 0, 4, 16);
    this.moduleQuarterPipe(34, -48.4, 0, 1, 12);
    this.moduleBank(52, -48.4, 0, 4, 12);

    // ---- South wall: mellow return transitions flanking the spawn ----
    this.moduleQuarterPipe(-26, 48.4, Math.PI, 1, 16);
    this.moduleQuarterPipe(24, 48.4, Math.PI, 2, 16);
    this.moduleBank(-48, 48.4, Math.PI, 2, 10);
    this.moduleBank(48, 48.4, Math.PI, 1, 10);

    // ---- West: half pipe + wall bank ----
    this.moduleHalfPipe(-52, 10, 2, 20, 8);
    this.moduleBank(-68.4, -28, Math.PI / 2, 3, 12);

    // ---- East wall: bank + tall quarter pipe ----
    this.moduleBank(68.4, 20, -Math.PI / 2, 2, 14);
    this.moduleQuarterPipe(68.4, -20, -Math.PI / 2, 3, 14);

    // ---- Center: transition playground ----
    this.modulePyramid(0, -2, 2);          // big pyramid centerpiece
    this.modulePyramid(-26, 22, 1);        // small pyramid
    this.moduleSpine(16, 12, 0, 1, 12);    // spine transfer
    this.moduleFunbox(-22, -2, 0, 1, 8, 4);
    this.moduleFunbox(28, -24, Math.PI / 2, 2, 10, 4);
    this.moduleKicker(-22, 32, 0, 1, 6);
    this.moduleKicker(34, 4, Math.PI / 2, 2, 6);
    this.moduleKicker(-34, -30, Math.PI / 2, 3, 8);

    // Roller line — three low bumps for pump rhythm.
    this.moduleRoller(-10, 20, 0, 8);
    this.moduleRoller(-10, 25, 0, 8);
    this.moduleRoller(-10, 30, 0, 8);

    // ---- Bowls: revolved crater transitions, big + small ----
    this.moduleBowl(38, 24, 2);
    this.moduleBowl(-48, 34, 1);

    // ---- East street plaza: stairs, ledges, rails, pads ----
    this.moduleStairs(58, 38, Math.PI, 1, 8);
    this.moduleLedge(8, 34, 0, 12, 0.5);
    this.moduleLedge(52, 8, Math.PI / 2, 12, 1);
    this.moduleManualPad(14, 18, 0, 8);
    this.moduleManualPad(40, -8, Math.PI / 2, 8);
    this.moduleRail(14, 0.5, 24, 23, 0.5, 24);     // low flat rail
    this.moduleRail(44, 1.0, -28, 44, 1.0, -16);   // high flat rail
    this.moduleRail(-38, 0.5, 4, -28, 0.5, 14);    // diagonal rail
  }

  /* ================================================================ */
  /* Collider registration                                            */
  /* ================================================================ */

  /**
   * Add a module group to the scene and register colliders from tags:
   * `userData.collide = 'trimesh' | 'box'`. Because colliders come from
   * the same meshes that render, physics always matches visuals.
   */
  private register(g: THREE.Group): void {
    this.scene.add(g);
    g.updateMatrixWorld(true);
    g.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const kind = obj.userData.collide;
      if (!kind) return;
      const pos = obj.getWorldPosition(new THREE.Vector3());
      const quat = obj.getWorldQuaternion(new THREE.Quaternion());
      if (kind === 'trimesh') {
        this.physics.addTrimesh(obj.geometry, pos, quat);
      } else if (kind === 'box') {
        const p = (obj.geometry as THREE.BoxGeometry).parameters;
        this.physics.addBox(pos, new THREE.Vector3(p.width, p.height, p.depth), quat);
      }
    });
  }

  private wedgeGeo(w: number, h: number, run: number): THREE.BufferGeometry {
    const key = `${w}:${h}:${run}`;
    let geo = this.wedgeGeoCache.get(key);
    if (!geo) {
      geo = makeWedgeGeometry(w, h, run);
      this.wedgeGeoCache.set(key, geo);
    }
    return geo;
  }

  private solidMesh(geo: THREE.BufferGeometry, material: THREE.Material, collide: 'trimesh' | 'box'): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.collide = collide;
    return mesh;
  }

  /* ================================================================ */
  /* Module library                                                   */
  /* ================================================================ */

  /** Bank ramp: solid wedge, back at the module origin, slope toward +z. */
  private moduleBank(x: number, z: number, yaw: number, h: number, w: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const wedge = this.solidMesh(this.wedgeGeo(w, h, h * SLOPE_RUN), mat(RAMP_COLOR), 'trimesh');
    g.add(wedge);
    this.register(g);
  }

  /** Kicker: two solid wedges back-to-back forming a launch ridge. */
  private moduleKicker(x: number, z: number, yaw: number, h: number, w: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const geo = this.wedgeGeo(w, h, h * SLOPE_RUN);
    for (const side of [0, Math.PI]) {
      const wedge = this.solidMesh(geo, mat(RAMP_COLOR), 'trimesh');
      wedge.rotation.y = side;
      g.add(wedge);
    }
    this.register(g);
  }

  /** Funbox: flat box top with wedge slopes on both z sides. */
  private moduleFunbox(x: number, z: number, yaw: number, h: number, w: number, topLen: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const top = this.solidMesh(new THREE.BoxGeometry(w, h, topLen), mat(RAMP_COLOR), 'box');
    top.position.y = h / 2;
    g.add(top);

    const geo = this.wedgeGeo(w, h, h * SLOPE_RUN);
    for (const side of [1, -1] as const) {
      const wedge = this.solidMesh(geo, mat(RAMP_ALT), 'trimesh');
      wedge.position.z = side * (topLen / 2);
      wedge.rotation.y = side === 1 ? 0 : Math.PI;
      g.add(wedge);
    }
    this.register(g);
  }

  /** Pyramid: 4-sided frustum, rideable from every direction. Top = 4m sq. */
  private modulePyramid(x: number, z: number, h: number): void {
    const topSide = 4;
    const run = h * SLOPE_RUN;
    const bottomSide = topSide + 2 * run;
    const geo = new THREE.CylinderGeometry(
      (topSide * Math.SQRT2) / 2,
      (bottomSide * Math.SQRT2) / 2,
      h,
      4,
      1,
      false,
    );
    geo.rotateY(Math.PI / 4); // faces normal to ±x/±z
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const mesh = this.solidMesh(geo, mat(RAMP_COLOR), 'trimesh');
    mesh.position.y = h / 2;
    g.add(mesh);
    this.register(g);
  }

  /**
   * Quarter pipe: solid closed profile (deck + curve + sides + back) as one
   * trimesh. Module origin = back edge center; opens toward local +z.
   * Adds a grindable lip line + coping visual.
   */
  private moduleQuarterPipe(x: number, z: number, yaw: number, h: number, w: number, deckDepth = 2.4): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const { geo, lipY, lipZ } = makeQuarterPipeGeometry(w, h, deckDepth);
    g.add(this.solidMesh(geo, mat(RAMP_COLOR), 'trimesh'));

    // Coping visual along the lip (no collider — must not block launches).
    const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w, 8), mat(0xe8e2d2));
    coping.rotation.z = Math.PI / 2;
    coping.position.set(0, lipY + 0.03, lipZ);
    coping.castShadow = true;
    g.add(coping);

    // Analytic grind line along the lip.
    const quat = yawQuat(yaw);
    const a = new THREE.Vector3(-w / 2 + 0.2, lipY, lipZ).applyQuaternion(quat).add(g.position);
    const b = new THREE.Vector3(w / 2 - 0.2, lipY, lipZ).applyQuaternion(quat).add(g.position);
    this.pushRail(a, b, 'lip');

    this.register(g);
  }

  /** Half pipe: two quarter pipes facing each other across a flat channel. */
  private moduleHalfPipe(x: number, z: number, h: number, w: number, gap: number): void {
    const R = h * QP_RADIUS_PER_H;
    const depth = 2.4 + R * Math.sin(QP_MAX_ANGLE);
    this.moduleQuarterPipe(x - gap / 2 - depth, z, Math.PI / 2, h, w);
    this.moduleQuarterPipe(x + gap / 2 + depth, z, -Math.PI / 2, h, w);
  }

  /** Spine: two deckless quarter pipes back-to-back + ridge grind line. */
  private moduleSpine(x: number, z: number, yaw: number, h: number, w: number): void {
    this.moduleQuarterPipe(x, z, yaw, h, w, 0.3);
    this.moduleQuarterPipe(x, z, yaw + Math.PI, h, w, 0.3);
    const quat = yawQuat(yaw);
    const a = new THREE.Vector3(-w / 2 + 0.2, h, 0).applyQuaternion(quat).add(new THREE.Vector3(x, 0, z));
    const b = new THREE.Vector3(w / 2 - 0.2, h, 0).applyQuaternion(quat).add(new THREE.Vector3(x, 0, z));
    this.pushRail(a, b, 'lip');
  }

  /** Grind ledge with coping: 0.5m (curb) or 1m (street ledge) high. */
  private moduleLedge(x: number, z: number, yaw: number, len: number, h: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const box = this.solidMesh(new THREE.BoxGeometry(len, h, 1.2), mat(CONCRETE_DARK), 'box');
    box.position.y = h / 2;
    g.add(box);
    const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), mat(0xe8e2d2));
    coping.rotation.z = Math.PI / 2;
    coping.position.y = h + 0.02;
    coping.castShadow = true;
    g.add(coping);
    this.register(g);

    const quat = yawQuat(yaw);
    const a = new THREE.Vector3(-len / 2, h, 0).applyQuaternion(quat).add(g.position);
    const b = new THREE.Vector3(len / 2, h, 0).applyQuaternion(quat).add(g.position);
    this.pushRail(a, b);
    this.physics.addCylinder(a, b, 0.06); // bonk if you ride into it
  }

  /** Free-standing rail (flat, diagonal, or sloped) with posts. */
  private moduleRail(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    this.pushRail(a, b);
    this.physics.addCylinder(a, b, 0.06); // bonk-only

    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    const railMat = mat(RAIL_COLOR);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 8), railMat);
    pipe.position.copy(a).add(b).multiplyScalar(0.5);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pipe.castShadow = true;
    this.scene.add(pipe);

    const posts = Math.max(2, Math.round(length / 3));
    for (let i = 0; i < posts; i++) {
      const t = posts === 1 ? 0.5 : i / (posts - 1);
      const p = a.clone().lerp(b, t);
      if (p.y < 0.2) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, p.y, 6), railMat);
      post.position.set(p.x, p.y / 2, p.z);
      post.castShadow = true;
      this.scene.add(post);
      this.physics.addCylinder(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, p.y, p.z), 0.05);
    }
  }

  /** Stair set: platform + steps down the +z side + handrail (grindable). */
  private moduleStairs(x: number, z: number, yaw: number, h: number, w: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const platLen = 4;
    const plat = this.solidMesh(new THREE.BoxGeometry(w, h, platLen), mat(CONCRETE_DARK), 'box');
    plat.position.y = h / 2;
    g.add(plat);

    const steps = h * 3; // 0.33m per step
    const stepH = h / steps;
    const stepD = 0.8;
    for (let i = 0; i < steps; i++) {
      const sh = h - stepH * (i + 1);
      if (sh <= 0.01) continue;
      const step = this.solidMesh(new THREE.BoxGeometry(w, sh, stepD), mat(CONCRETE_DARK), 'box');
      step.position.set(0, sh / 2, platLen / 2 + stepD / 2 + i * stepD);
      g.add(step);
    }
    this.register(g);

    // Handrail: sloped grind line following the stairs.
    const quat = yawQuat(yaw);
    const origin = new THREE.Vector3(x, 0, z);
    const railA = new THREE.Vector3(0, h + 0.55, platLen / 2 - 0.4).applyQuaternion(quat).add(origin);
    const railB = new THREE.Vector3(0, 0.55, platLen / 2 + steps * stepD + 0.6).applyQuaternion(quat).add(origin);
    this.pushRail(railA, railB);
    this.physics.addCylinder(railA, railB, 0.05);
    const railMat = mat(RAIL_COLOR);
    const dir = railB.clone().sub(railA);
    const len = dir.length();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), railMat);
    pipe.position.copy(railA).add(railB).multiplyScalar(0.5);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    pipe.castShadow = true;
    this.scene.add(pipe);
    for (const t of [0.05, 0.95]) {
      const p = railA.clone().lerp(railB, t);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6), railMat);
      post.position.set(p.x, p.y - 0.28, p.z);
      this.scene.add(post);
      this.physics.addCylinder(new THREE.Vector3(p.x, p.y - 0.55, p.z), p, 0.045);
    }
  }

  /** Manual pad: low box, rideable onto from any side (below step-up limit). */
  private moduleManualPad(x: number, z: number, yaw: number, len: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const pad = this.solidMesh(new THREE.BoxGeometry(len, 0.4, 3), mat(CONCRETE_DARK), 'box');
    pad.position.y = 0.2;
    g.add(pad);
    this.register(g);
  }

  /**
   * Bowl: a full crater made by revolving a quarter-pipe profile (Three's
   * LatheGeometry) — conical outer bank up to a flat rim deck, then a curved
   * transition dropping to a flat bottom. Rideable from every direction;
   * one trimesh, exact collision. Comes in the standard 4 heights.
   */
  private moduleBowl(x: number, z: number, h: number): void {
    const R = h * QP_RADIUS_PER_H;
    const sinMax = Math.sin(QP_MAX_ANGLE);
    const rFlat = 3 + h;               // flat bottom radius
    const rLip = rFlat + R * sinMax;   // inner transition ends at the rim
    const rimW = 2.2;
    const rOut = rLip + rimW;
    const rBase = rOut + h * SLOPE_RUN; // outer bank skirt

    const pts: THREE.Vector2[] = [new THREE.Vector2(0.01, 0), new THREE.Vector2(rFlat, 0)];
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * QP_MAX_ANGLE;
      pts.push(new THREE.Vector2(rFlat + R * Math.sin(a), R * (1 - Math.cos(a))));
    }
    pts.push(new THREE.Vector2(rOut, h));
    pts.push(new THREE.Vector2(rBase, 0));

    const geo = new THREE.LatheGeometry(pts, 28);
    const bowlMat = mat(RAMP_ALT);
    bowlMat.side = THREE.DoubleSide; // lathe winding: keep the crater visible from inside
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(this.solidMesh(geo, bowlMat, 'trimesh'));
    this.register(g);
  }

  /** Roller: low double wedge — a pump bump. */
  private moduleRoller(x: number, z: number, yaw: number, w: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const geo = this.wedgeGeo(w, 0.5, 1.2);
    for (const side of [0, Math.PI]) {
      const wedge = this.solidMesh(geo, mat(RAMP_ALT), 'trimesh');
      wedge.rotation.y = side;
      g.add(wedge);
    }
    this.register(g);
  }

  private pushRail(a: THREE.Vector3, b: THREE.Vector3, label: 'rail' | 'lip' = 'rail'): void {
    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    this.rails.push({ a, b, dir, length, label });
  }

  /* ================================================================ */
  /* Environment: ground, perimeter walls, decor                      */
  /* ================================================================ */

  private buildEnvironment(): void {
    this.scene.fog = new THREE.Fog(0x8ec9ff, 80, 260);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a8a68, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
    sun.position.set(60, 70, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -85;
    sun.shadow.camera.right = 85;
    sun.shadow.camera.top = 85;
    sun.shadow.camera.bottom = -85;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Gradient sky dome + time-of-day presets (fog/sun/lamps follow it).
    this.sky = new SkySystem(this.scene, sun, hemi);

    // Trees ringing the park.
    const treePositions: [number, number][] = [
      [-76, -30], [-76, 6], [-75, 34], [76, -22], [76, 12], [75, 40],
      [-40, -56], [-8, -57], [28, -56], [56, -55], [-56, 55], [-20, 56],
      [12, 56], [44, 55], [66, -50], [-70, -50],
    ];
    for (const [x, z] of treePositions) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.6, 7), mat(0x7a5230));
      trunk.position.y = 1.3;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 0), mat(0x4fae52));
      crown.position.y = 3.6;
      crown.castShadow = true;
      tree.add(trunk, crown);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }

    // Chunky clouds way up high.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const cloudSpots: [number, number, number][] = [
      [-50, 30, -50], [20, 34, -60], [64, 30, 10], [-24, 36, 52], [8, 31, 20], [-64, 33, -8],
    ];
    for (const [x, y, z] of cloudSpots) {
      const cloud = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 - i * 0.7, 0), cloudMat);
        puff.position.set(i * 3.2 - 3.2, (i % 2) * 0.9, 0);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      this.scene.add(cloud);
    }
  }

  private buildGroundAndWalls(): void {
    const ground = this.solidMesh(new THREE.BoxGeometry(140, 1, 100), mat(CONCRETE), 'box');
    ground.position.y = -0.5;
    ground.castShadow = false;
    this.scene.add(ground);
    this.physics.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(140, 1, 100));

    const grass = new THREE.Mesh(new THREE.BoxGeometry(220, 0.9, 160), mat(0x6cbf5a));
    grass.position.y = -0.56;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // High perimeter walls (solid colliders — the controller also clamps
    // position as a backstop, but bonking off the wall is the primary stop).
    const wallMat = mat(CONCRETE_DARK);
    const capMat = mat(0xbfb49c);
    const mkWall = (w: number, d: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.physics.addBox(new THREE.Vector3(x, WALL_HEIGHT / 2, z), new THREE.Vector3(w, WALL_HEIGHT, d));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w === 1 ? 1.4 : w, 0.25, d === 1 ? 1.4 : d), capMat);
      cap.position.set(x, WALL_HEIGHT + 0.12, z);
      this.scene.add(cap);
    };
    mkWall(140, 1, 0, -49.5);
    mkWall(140, 1, 0, 49.5);
    mkWall(1, 100, -69.5, 0);
    mkWall(1, 100, 69.5, 0);

    // Painted deco.
    const paint = mat(0xbdb096);
    for (const z of [-36, 20]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(130, 0.02, 0.3), paint);
      line.position.set(0, 0.011, z);
      line.receiveShadow = true;
      this.scene.add(line);
    }
    const accents: [number, number, number][] = [[20, 20, 4], [-44, -8, 3], [56, 36, 2.6]];
    for (const [x, z, r] of accents) {
      const circle = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 20), mat(0xd8b13d));
      circle.position.set(x, 0.008, z);
      circle.receiveShadow = true;
      this.scene.add(circle);
    }

    const pad = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 3), mat(0x8fc7e8));
    pad.position.set(0, 0.012, 40);
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  /**
   * Lamp posts ringing the park, heads leaning in over the walls. Each
   * carries a real PointLight for dynamic lighting; the sky presets dim
   * them at noon and crank them at dusk. Decor only — no colliders, so
   * they never interfere with play or the anti-embed ceiling probe.
   */
  private buildLampPosts(): void {
    const spots: [number, number][] = [
      [-36, -52], [36, -52], [-36, 52], [36, 52],
      [-72, -18], [-72, 18], [72, -18], [72, 18],
    ];
    const poleMat = mat(0x3a3f4a);
    for (const [x, z] of spots) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 7), poleMat);
      pole.position.y = 3.2;
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.2), poleMat);
      arm.position.set(0, 6.3, 1.0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.9), poleMat);
      head.position.set(0, 6.2, 2.1);
      const bulbMat = new THREE.MeshLambertMaterial({
        color: 0xfff0c9, emissive: 0xffd98a, emissiveIntensity: 1, flatShading: true,
      });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.7), bulbMat);
      bulb.position.set(0, 6.08, 2.1);
      const light = new THREE.PointLight(0xffd98a, 0, 34, 1.6);
      light.position.set(0, 5.9, 2.3);
      lamp.add(pole, arm, head, bulb, light);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = Math.atan2(-x, -z); // face the park center
      this.scene.add(lamp);
      this.sky.registerLamp(light, bulbMat);
    }
  }

  /* ================================================================ */
  /* Collectibles: gold coins (score + currency) & blue boost orbs    */
  /* ================================================================ */

  private placeCollectibles(): void {
    const spots: [number, number, number][] = [
      // quarter pipe air lines (above each lip)
      [-44, 3.4, -44.2], [-10, 4.6, -42.7], [16, 5.8, -41.2], [34, 2.2, -45.6],
      [-26, 2.2, 45.6], [24, 3.4, 44.2],
      // half pipe air, both sides
      [-59, 3.6, 10], [-45, 3.6, 10],
      // bowls: rim ring + dead center air
      [38, 3.4, 13.2], [48.8, 3.4, 24], [38, 3.4, 34.8], [38, 4.4, 24],
      [-48, 2.2, 34], [-48, 2.8, 28.6],
      // pyramid peaks + spine + funbox tops
      [0, 3.2, -2], [-26, 2.2, 22], [16, 2.4, 12], [-22, 2.2, -2], [28, 3.2, -24],
      // kicker arcs
      [-22, 2.2, 32], [34, 3.2, 4], [-34, 4.2, -30],
      // rails & ledges & stairs (grind to collect)
      [18, 1.4, 24], [44, 1.9, -22], [-33, 1.4, 9], [8, 1.4, 34], [52, 1.9, 8], [58, 1.6, 34],
      // roller line + cruise pickups
      [-10, 1.4, 25], [0, 0.9, 20], [-56, 0.9, -40], [58, 0.9, -38], [12, 0.9, -30],
    ];
    // Gold coin: flat cylinder with an inner disc, standing on edge.
    const coinMat = new THREE.MeshLambertMaterial({
      color: 0xffce3d, emissive: 0x8a6a10, emissiveIntensity: 0.55, flatShading: true,
    });
    const innerMat = new THREE.MeshLambertMaterial({
      color: 0xffe388, emissive: 0xa8842a, emissiveIntensity: 0.5, flatShading: true,
    });
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 14), coinMat);
      coin.rotation.x = Math.PI / 2; // stand on edge so the face shows
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), innerMat);
      inner.rotation.x = Math.PI / 2;
      g.add(coin, inner);
      g.position.set(x, y, z);
      this.scene.add(g);
      this.collectibles.push({ mesh: g, taken: false });
    }
    this.totalCollectibles = this.collectibles.length;
  }

  /** Glowing blue orbs that refill the boost meter. They respawn. */
  private placeBoostOrbs(): void {
    const spots: [number, number, number][] = [
      [0, 1, 26],           // spawn run
      [-52, 1, 10],         // half pipe channel
      [38, 3.6, 24],        // big bowl center (high)
      [-10, 1, 34],         // roller lane
      [46, 1.2, -22],       // street plaza
      [-22, 1, -14],        // west funbox lane
      [12, 1, -36],         // north QP approach
      [-62, 1, -30],        // west bank corner
      [62, 1, 24],          // east cruise
      [0, 1, 8],            // pyramid approach
    ];
    const orbMat = new THREE.MeshLambertMaterial({
      color: 0x59c8ff, emissive: 0x2a8aff, emissiveIntensity: 1.1, flatShading: true,
    });
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), orbMat);
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.48, 0),
        new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.25 }),
      );
      g.add(orb, shell);
      g.position.set(x, y, z);
      this.scene.add(g);
      this.orbs.push({ mesh: g, taken: false });
    }
  }

  /**
   * Spin/bob animation + pickup radius checks. Coins stay collected for the
   * run; boost orbs respawn after a while. Returns what was picked up.
   */
  update(dt: number, playerPos: THREE.Vector3): { coins: number; orbs: number } {
    this.spinTime += dt;
    this.elapsed += dt;
    let coins = 0;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 3;
      if (c.mesh.position.distanceTo(playerPos) < 1.5) {
        c.taken = true;
        c.mesh.visible = false;
        coins++;
      }
    }
    let orbs = 0;
    for (const o of this.orbs) {
      if (o.taken) {
        if (o.respawnAt !== undefined && this.elapsed >= o.respawnAt) {
          o.taken = false;
          o.mesh.visible = true;
        }
        continue;
      }
      o.mesh.rotation.y += dt * 1.8;
      const pulse = 1 + Math.sin(this.spinTime * 4 + o.mesh.position.z) * 0.12;
      o.mesh.scale.setScalar(pulse);
      if (o.mesh.position.distanceTo(playerPos) < 1.6) {
        o.taken = true;
        o.mesh.visible = false;
        o.respawnAt = this.elapsed + 14;
        orbs++;
      }
    }
    return { coins, orbs };
  }

  get collectedCount(): number {
    return this.collectibles.filter((c) => c.taken).length;
  }

  resetCollectibles(): void {
    for (const c of [...this.collectibles, ...this.orbs]) {
      c.taken = false;
      c.respawnAt = undefined;
      c.mesh.visible = true;
    }
  }
}
