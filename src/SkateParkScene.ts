/**
 * SkateParkScene
 * --------------
 * A LEVEL built from the modular, grid-aligned element library. The scene
 * is fully config-driven (see Levels.ts): a LevelConfig supplies the
 * bounds, theme colors, sky presets, spawn, physics feel multipliers and a
 * `build()` function that places modules.
 *
 * Module library (each is visual + exact colliders, and takes an optional
 * base height `y` so pieces can sit on elevated terraces for huge jumps):
 *   box (plateau/terrace), bank, kicker, funbox, pyramid, quarter pipe,
 *   half pipe, spine, bowl (lathe crater), ledge, rail, stairs + handrail,
 *   manual pad, roller — plus coins and boost orbs.
 *
 * Collision philosophy — the player must NEVER clip through anything:
 * curved/sloped shapes register their RENDER GEOMETRY as Rapier trimeshes,
 * boxy shapes register exact cuboids, rails/coping are "bonk-only"
 * cylinders (ground snap ignores them; riding into them bounces you off).
 */
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { SkySystem } from './SkySystem';
import { WaterSystem } from './WaterSystem';
import { createBurgerCrownCoin } from './CoinModel';

export interface RailSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  dir: THREE.Vector3; // normalized a→b
  length: number;
  label?: 'rail' | 'lip';
}

interface Collectible {
  mesh: THREE.Group;
  taken: boolean;
  respawnAt?: number;
}

export type FoliageKind = 'round' | 'pine' | 'palm' | 'jungle' | 'redwood' | 'city';

export interface WaterTheme {
  shallow: number;
  deep: number;
  level: number;   // world Y of the surface (defaults just below the park)
  surround?: number; // shrink the ground skirt so water shows around the park
}

export interface LevelTheme {
  ground: number;
  groundDark: number;
  ramp: number;
  rampAlt: number;
  surround: number;    // grass / snowfield / canyon floor
  rail: number;
  treeCrown: number;
  treeTrunk: number;
  /** pine-shaped trees with white tips (snow levels) */
  snowPines?: boolean;
  /** perimeter foliage style (defaults: round, or pine if snowPines) */
  foliage?: FoliageKind;
  /** secondary crown tint for fuller/higher-fidelity trees */
  treeCrown2?: number;
  /** stylized water surrounding the park */
  water?: WaterTheme;
  /** limit the random sky to these preset names */
  skyPresets?: string[];
}

export interface LevelConfig {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  bounds: { x: number; z: number }; // player clamp half-extents
  spawn: { x: number; z: number; yaw: number };
  physics?: { speedMul?: number; turnMul?: number };
  theme: LevelTheme;
  build(park: SkateParkScene): void;
}

/* ------------------------- grid constants ------------------------- */

export const GRID = 2;              // base unit (m) — placements snap to this
const SLOPE_RUN = 2;                // slope run per 1m of rise (26.57°)
const QP_MAX_ANGLE = (68 * Math.PI) / 180;
const QP_RADIUS_PER_H = 1 / (1 - Math.cos(QP_MAX_ANGLE)); // lip height == h
// The perimeter is deliberately different from a skate-module quarter pipe:
// a short, tight 90-degree transition feeds into a tall retaining wall. This
// lets riders carry momentum upward without presenting a launchable lip.
const PERIMETER_TRANSITION_H = 1.75;
const PERIMETER_WALL_H = 6.5;
const PERIMETER_CAP_DEPTH = 0.65;

function yawQuat(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
}

/** Solid triangular prism: vertical back at z=0, slope down to z=run. */
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

/** Quarter pipe closed profile, extruded to width. Back at z=0, opens +z. */
function makeQuarterPipeGeometry(width: number, h: number, deckDepth: number): {
  geo: THREE.BufferGeometry;
  lipY: number;
  lipZ: number;
} {
  const R = h * QP_RADIUS_PER_H;
  const sinMax = Math.sin(QP_MAX_ANGLE);
  const shape = new THREE.Shape(); // shape.x = local z, shape.y = local y
  shape.moveTo(0, 0);
  shape.lineTo(0, h);
  shape.lineTo(deckDepth, h);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const a = QP_MAX_ANGLE * (1 - i / steps);
    shape.lineTo(deckDepth + R * (sinMax - Math.sin(a)), R * (1 - Math.cos(a)));
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return { geo, lipY: h, lipZ: deckDepth };
}

/**
 * Curved perimeter wall: a quarter-pipe transition profile swept around a
 * rounded-rectangle path (the whole map boundary). Instead of four flat
 * walls you can smash into, the entire edge curves up so you ride it like a
 * bowl and get carried back in. Returns a triangle-soup BufferGeometry
 * (world-space triplanar textures need no UVs; flat normals suit the look).
 */
function perimeterPath(lx: number, lz: number, cr: number): { x: number; z: number; nx: number; nz: number }[] {
  // Rounded-rectangle wall path with inward (toward centre) unit normals.
  // The denser corner tessellation prevents the old six-sided corners from
  // acting like little kickers at speed.
  const ex = lx - cr, ez = lz - cr;
  const path: { x: number; z: number; nx: number; nz: number }[] = [];
  const add = (x: number, z: number, nx: number, nz: number) => path.push({ x, z, nx, nz });
  const ARC = 36;
  add(lx, -ez, -1, 0); add(lx, ez, -1, 0);
  for (let k = 1; k <= ARC; k++) { const t = (k / ARC) * (Math.PI / 2); add(ex + cr * Math.cos(t), ez + cr * Math.sin(t), -Math.cos(t), -Math.sin(t)); }
  add(-ex, lz, 0, -1);
  for (let k = 1; k <= ARC; k++) { const t = Math.PI / 2 + (k / ARC) * (Math.PI / 2); add(-ex + cr * Math.cos(t), ez + cr * Math.sin(t), -Math.cos(t), -Math.sin(t)); }
  add(-lx, -ez, 1, 0);
  for (let k = 1; k <= ARC; k++) { const t = Math.PI + (k / ARC) * (Math.PI / 2); add(-ex + cr * Math.cos(t), -ez + cr * Math.sin(t), -Math.cos(t), -Math.sin(t)); }
  add(ex, -lz, 0, 1);
  for (let k = 1; k < ARC; k++) { const t = 1.5 * Math.PI + (k / ARC) * (Math.PI / 2); add(ex + cr * Math.cos(t), -ez + cr * Math.sin(t), -Math.cos(t), -Math.sin(t)); }
  return path;
}

function makePerimeterGeometry(lx: number, lz: number, cr: number, transitionH: number, wallH: number): THREE.BufferGeometry {
  const R = transitionH;
  // Cross-section: tight quarter-circle transition, then a true vertical wall.
  // With no inward-facing deck at the top there is nothing for the rider to
  // catch, boink, or flip against.
  const PROF = 16;
  const prof: { inw: number; y: number }[] = [];
  for (let j = 0; j <= PROF; j++) {
    const a = (j / PROF) * (Math.PI / 2);
    prof.push({ inw: R * Math.cos(a), y: R * (1 - Math.cos(a)) });
  }
  prof.push({ inw: 0, y: wallH });

  const path = perimeterPath(lx, lz, cr);

  const N = path.length, M = prof.length;
  const vAt = (i: number, j: number): [number, number, number] => {
    const p = path[i], q = prof[j];
    return [p.x + p.nx * q.inw, q.y, p.z + p.nz * q.inw];
  };
  const verts: number[] = [];
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < M - 1; j++) {
      const a = vAt(i, j), b = vAt(i2, j), c = vAt(i2, j + 1), d = vAt(i, j + 1);
      verts.push(...a, ...c, ...b, ...a, ...d, ...c); // inward/up facing
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  return geo;
}

/** Visual concrete coping/cap. It projects outward, never over the ride face. */
function makePerimeterCapGeometry(lx: number, lz: number, cr: number, y: number, depth: number): THREE.BufferGeometry {
  const path = perimeterPath(lx, lz, cr);
  const verts: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const ai: [number, number, number] = [a.x, y, a.z];
    const bi: [number, number, number] = [b.x, y, b.z];
    const ao: [number, number, number] = [a.x - a.nx * depth, y, a.z - a.nz * depth];
    const bo: [number, number, number] = [b.x - b.nx * depth, y, b.z - b.nz * depth];
    verts.push(...ai, ...bi, ...bo, ...ai, ...bo, ...ao);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------- surface textures ------------------------- */
// Both textures are near-white LUMINANCE maps (detail in the 0.7–1.0 range)
// so they MULTIPLY over each theme's base color: the theme supplies the hue
// (warm wood / cool concrete), the texture supplies the grain and grime.
// They're sampled triplanar in world space (see applyTriplanar), so grain
// scale stays consistent across every module regardless of its UVs.

function texFromCanvas(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Max anisotropy keeps the ground/ramps sharp at grazing angles (the long
  // concrete floor receding to the horizon was smearing at low anisotropy).
  tex.anisotropy = 16;
  return tex;
}

/** Plywood: vertical grain streaks + darker plank seams. */
function makeWoodTexture(): THREE.CanvasTexture {
  return texFromCanvas((ctx, s) => {
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, s, s);
    // Fine grain — many faint vertical wavy strokes.
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * s;
      const shade = 150 + Math.random() * 70; // 0.59–0.86
      ctx.strokeStyle = `rgba(${shade | 0},${(shade * 0.9) | 0},${(shade * 0.72) | 0},0.25)`;
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      let y = 0;
      ctx.moveTo(x, 0);
      while (y < s) {
        y += 8 + Math.random() * 14;
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y);
      }
      ctx.stroke();
    }
    // Plank seams every 64px (tileable) — crisp darker grooves.
    ctx.strokeStyle = 'rgba(120,96,64,0.5)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= s; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
  });
}

/** Concrete: mottled speckle + a couple of faint hairline cracks. */
function makeConcreteTexture(): THREE.CanvasTexture {
  return texFromCanvas((ctx, s) => {
    ctx.fillStyle = '#e9e9ea';
    ctx.fillRect(0, 0, s, s);
    // Broad soft blotches for uneven pour.
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = 18 + Math.random() * 46;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.5;
      g.addColorStop(0, dark ? 'rgba(150,150,155,0.16)' : 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fine aggregate speckle.
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() < 0.5 ? 165 + Math.random() * 40 : 235 + Math.random() * 20;
      ctx.fillStyle = `rgba(${v | 0},${v | 0},${(v * 0.99) | 0},0.5)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    // A few hairline cracks.
    ctx.strokeStyle = 'rgba(120,120,124,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

export class SkateParkScene {
  scene = new THREE.Scene();
  rails: RailSegment[] = [];
  spawnPoint: THREE.Vector3;
  spawnYaw: number;
  totalCollectibles = 0;
  sky!: SkySystem;
  private water?: WaterSystem;
  /** Burger-shack drive-through: enter this zone to cash in your stack. */
  driveThrough?: { pos: THREE.Vector3; radius: number };
  private driveGlow: { ring: THREE.Mesh; cyl: THREE.Mesh } | null = null;
  private stripeTex?: THREE.CanvasTexture;
  readonly bounds: { x: number; z: number };

  private collectibles: Collectible[] = [];
  private orbs: Collectible[] = [];
  private spinTime = 0;
  private elapsed = 0;
  private wedgeGeoCache = new Map<string, THREE.BufferGeometry>();
  private matCache = new Map<number, THREE.MeshLambertMaterial>();
  private woodTex?: THREE.CanvasTexture;
  private concreteTex?: THREE.CanvasTexture;
  private theme: LevelTheme;

  constructor(private physics: PhysicsWorld, readonly config: LevelConfig) {
    this.theme = config.theme;
    this.bounds = config.bounds;
    this.spawnPoint = new THREE.Vector3(config.spawn.x, 0.5, config.spawn.z);
    this.spawnYaw = config.spawn.yaw;

    this.buildEnvironment();
    this.buildGroundAndWalls();
    this.buildLampPosts();
    config.build(this);
  }

  /**
   * Cached flat-shaded material per color (levels reuse a small palette).
   * Ramp colors get a WOOD grain, ground colors a CONCRETE finish — applied
   * as a world-space triplanar overlay so the two read as clearly different
   * materials, not just two shades of tan.
   */
  mat(color: number): THREE.MeshLambertMaterial {
    let m = this.matCache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      const surf = this.surfaceFor(color);
      if (surf === 'wood') this.applyTriplanar(m, this.woodTexture(), 0.5);
      else if (surf === 'concrete') this.applyTriplanar(m, this.concreteTexture(), 0.32);
      this.matCache.set(color, m);
    }
    return m;
  }

  /** Which surface finish a theme color represents (ramps=wood, floor=concrete). */
  private surfaceFor(color: number): 'wood' | 'concrete' | null {
    const t = this.theme;
    if (color === t.ramp || color === t.rampAlt) return 'wood';
    if (color === t.ground || color === t.groundDark) return 'concrete';
    return null;
  }

  private woodTexture(): THREE.CanvasTexture {
    return (this.woodTex ??= makeWoodTexture());
  }

  private concreteTexture(): THREE.CanvasTexture {
    return (this.concreteTex ??= makeConcreteTexture());
  }

  /**
   * Overlay a repeating texture sampled in WORLD space on three axes and
   * blended by the surface normal — no UVs required, so it works uniformly
   * on boxes, UV-less wedges, lathes and extrudes at a constant grain scale.
   * The texture MULTIPLIES the base color (see the texture generators).
   */
  private applyTriplanar(m: THREE.MeshLambertMaterial, map: THREE.CanvasTexture, scale: number): void {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTriMap = { value: map };
      shader.uniforms.uTriScale = { value: scale };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;')
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\n  vTriNrm = mat3(modelMatrix) * objectNormal;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uTriMap;
uniform float uTriScale;
varying vec3 vTriPos;
varying vec3 vTriNrm;
vec3 triplanarColor() {
  vec3 n = normalize(vTriNrm);
  vec3 bw = pow(abs(n), vec3(4.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 cx = texture2D(uTriMap, vTriPos.zy * uTriScale).rgb;
  vec3 cy = texture2D(uTriMap, vTriPos.xz * uTriScale).rgb;
  vec3 cz = texture2D(uTriMap, vTriPos.xy * uTriScale).rgb;
  return cx * bw.x + cy * bw.y + cz * bw.z;
}`,
        )
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= triplanarColor();');
    };
    // All triplanar mats share identical shader code (only uniforms differ),
    // so they can share one compiled program.
    m.customProgramCacheKey = () => 'triplanar';
  }

  /* ================================================================ */
  /* Collider registration                                            */
  /* ================================================================ */

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
  /* Module library (all take an optional base height `y`)            */
  /* ================================================================ */

  /** Plain solid box — plateaus, terraces, big blocks. */
  moduleBox(x: number, z: number, yaw: number, w: number, h: number, d: number, y = 0, color?: number): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const box = this.solidMesh(new THREE.BoxGeometry(w, h, d), this.mat(color ?? this.theme.rampAlt), 'box');
    box.position.y = h / 2;
    g.add(box);
    this.register(g);
  }

  /** Bank ramp: solid wedge, back at origin, slope toward local +z. */
  moduleBank(x: number, z: number, yaw: number, h: number, w: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    g.add(this.solidMesh(this.wedgeGeo(w, h, h * SLOPE_RUN), this.mat(this.theme.ramp), 'trimesh'));
    this.register(g);
  }

  /** Kicker: two solid wedges back-to-back forming a launch ridge. */
  moduleKicker(x: number, z: number, yaw: number, h: number, w: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const geo = this.wedgeGeo(w, h, h * SLOPE_RUN);
    for (const side of [0, Math.PI]) {
      const wedge = this.solidMesh(geo, this.mat(this.theme.ramp), 'trimesh');
      wedge.rotation.y = side;
      g.add(wedge);
    }
    this.register(g);
  }

  /** Funbox: flat box top with wedge slopes on both z sides. */
  moduleFunbox(x: number, z: number, yaw: number, h: number, w: number, topLen: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const top = this.solidMesh(new THREE.BoxGeometry(w, h, topLen), this.mat(this.theme.ramp), 'box');
    top.position.y = h / 2;
    g.add(top);
    const geo = this.wedgeGeo(w, h, h * SLOPE_RUN);
    for (const side of [1, -1] as const) {
      const wedge = this.solidMesh(geo, this.mat(this.theme.rampAlt), 'trimesh');
      wedge.position.z = side * (topLen / 2);
      wedge.rotation.y = side === 1 ? 0 : Math.PI;
      g.add(wedge);
    }
    this.register(g);
  }

  /** Pyramid: 4-sided frustum, rideable from every direction. */
  modulePyramid(x: number, z: number, h: number, y = 0): void {
    const topSide = 4;
    const bottomSide = topSide + 2 * h * SLOPE_RUN;
    const geo = new THREE.CylinderGeometry(
      (topSide * Math.SQRT2) / 2, (bottomSide * Math.SQRT2) / 2, h, 4, 1, false,
    );
    geo.rotateY(Math.PI / 4);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mesh = this.solidMesh(geo, this.mat(this.theme.ramp), 'trimesh');
    mesh.position.y = h / 2;
    g.add(mesh);
    this.register(g);
  }

  /** Quarter pipe: solid trimesh + coping visual + grindable lip line. */
  moduleQuarterPipe(x: number, z: number, yaw: number, h: number, w: number, deckDepth = 2.4, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const { geo, lipY, lipZ } = makeQuarterPipeGeometry(w, h, deckDepth);
    g.add(this.solidMesh(geo, this.mat(this.theme.ramp), 'trimesh'));

    const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w, 8), this.mat(0xe8e2d2));
    coping.rotation.z = Math.PI / 2;
    coping.position.set(0, lipY + 0.03, lipZ);
    coping.castShadow = true;
    g.add(coping);

    const quat = yawQuat(yaw);
    const a = new THREE.Vector3(-w / 2 + 0.2, lipY, lipZ).applyQuaternion(quat).add(g.position);
    const b = new THREE.Vector3(w / 2 - 0.2, lipY, lipZ).applyQuaternion(quat).add(g.position);
    this.pushRail(a, b, 'lip');
    this.register(g);
  }

  /** Half pipe: two quarter pipes facing each other across a channel. */
  moduleHalfPipe(x: number, z: number, h: number, w: number, gap: number, y = 0): void {
    const depth = 2.4 + h * QP_RADIUS_PER_H * Math.sin(QP_MAX_ANGLE);
    this.moduleQuarterPipe(x - gap / 2 - depth, z, Math.PI / 2, h, w, 2.4, y);
    this.moduleQuarterPipe(x + gap / 2 + depth, z, -Math.PI / 2, h, w, 2.4, y);
  }

  /**
   * Mega drop-in: a tall roll-in. Ride up the gentle bank on the back
   * (-z), across the deck, then plunge the steep curved transition on the
   * front (+z) to bomb into the park with big speed. Grind line on the lip.
   */
  moduleDropIn(x: number, z: number, yaw: number, h: number, w: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const deckLen = 4;
    const deck = this.solidMesh(new THREE.BoxGeometry(w, h, deckLen), this.mat(this.theme.rampAlt), 'box');
    deck.position.set(0, h / 2, 0);
    g.add(deck);

    // Front drop-in transition (vertical back on the deck, curves to floor +z).
    const { geo } = makeQuarterPipeGeometry(w, h, 0.3);
    const drop = this.solidMesh(geo, this.mat(this.theme.ramp), 'trimesh');
    drop.position.set(0, 0, deckLen / 2);
    g.add(drop);

    // Back approach bank (ride up to the deck from -z).
    const run = h * SLOPE_RUN;
    const bank = this.solidMesh(this.wedgeGeo(w, h, run), this.mat(this.theme.ramp), 'trimesh');
    bank.position.set(0, 0, -deckLen / 2);
    bank.rotation.y = Math.PI; // slope falls away toward -z
    g.add(bank);

    const quat = yawQuat(yaw);
    const origin = new THREE.Vector3(x, 0, z);
    const a = new THREE.Vector3(-w / 2 + 0.2, h, deckLen / 2).applyQuaternion(quat).add(origin);
    const b = new THREE.Vector3(w / 2 - 0.2, h, deckLen / 2).applyQuaternion(quat).add(origin);
    this.pushRail(a, b, 'lip');
    this.register(g);
  }

  /** Spine: two deckless quarter pipes back-to-back + ridge grind line. */
  moduleSpine(x: number, z: number, yaw: number, h: number, w: number, y = 0): void {
    this.moduleQuarterPipe(x, z, yaw, h, w, 0.3, y);
    this.moduleQuarterPipe(x, z, yaw + Math.PI, h, w, 0.3, y);
    const quat = yawQuat(yaw);
    const origin = new THREE.Vector3(x, y, z);
    const a = new THREE.Vector3(-w / 2 + 0.2, h, 0).applyQuaternion(quat).add(origin);
    const b = new THREE.Vector3(w / 2 - 0.2, h, 0).applyQuaternion(quat).add(origin);
    this.pushRail(a, b, 'lip');
  }

  /** Bowl: revolved crater — outer bank skirt, rim deck, inner transition. */
  moduleBowl(x: number, z: number, h: number, y = 0): void {
    const R = h * QP_RADIUS_PER_H;
    const sinMax = Math.sin(QP_MAX_ANGLE);
    const rFlat = 3 + h;
    const rLip = rFlat + R * sinMax;
    const rOut = rLip + 2.2;
    const rBase = rOut + h * SLOPE_RUN;
    // Lift the crater floor a hair above the ground plane so it doesn't
    // z-fight (or trap the ground-ray) where bowl meets ground, and sink
    // the outer skirt below ground so there's no seam gap around the rim.
    const floor = 0.05;
    const pts: THREE.Vector2[] = [new THREE.Vector2(0.01, floor), new THREE.Vector2(rFlat, floor)];
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * QP_MAX_ANGLE;
      pts.push(new THREE.Vector2(rFlat + R * Math.sin(a), floor + R * (1 - Math.cos(a))));
    }
    pts.push(new THREE.Vector2(rOut, floor + h));
    pts.push(new THREE.Vector2(rBase, -0.25));
    const geo = new THREE.LatheGeometry(pts, 28);
    const bowlMat = new THREE.MeshLambertMaterial({ color: this.theme.rampAlt, flatShading: true, side: THREE.DoubleSide });
    this.applyTriplanar(bowlMat, this.woodTexture(), 0.5);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(this.solidMesh(geo, bowlMat, 'trimesh'));
    this.register(g);
  }

  /** Grind ledge with coping. */
  moduleLedge(x: number, z: number, yaw: number, len: number, h: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const box = this.solidMesh(new THREE.BoxGeometry(len, h, 1.2), this.mat(this.theme.groundDark), 'box');
    box.position.y = h / 2;
    g.add(box);
    const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), this.mat(0xe8e2d2));
    coping.rotation.z = Math.PI / 2;
    coping.position.y = h + 0.02;
    coping.castShadow = true;
    g.add(coping);
    this.register(g);
    const quat = yawQuat(yaw);
    const a = new THREE.Vector3(-len / 2, h, 0).applyQuaternion(quat).add(g.position);
    const b = new THREE.Vector3(len / 2, h, 0).applyQuaternion(quat).add(g.position);
    this.pushRail(a, b);
    this.physics.addCylinder(a, b, 0.06);
  }

  /** Free-standing rail (flat, diagonal, sloped, or elevated) with posts. */
  moduleRail(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    this.pushRail(a, b);
    this.physics.addCylinder(a, b, 0.06);

    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    const railMat = this.mat(this.theme.rail);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 8), railMat);
    pipe.position.copy(a).add(b).multiplyScalar(0.5);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pipe.castShadow = true;
    this.scene.add(pipe);

    const posts = Math.max(2, Math.round(length / 3.5));
    for (let i = 0; i < posts; i++) {
      const t = posts === 1 ? 0.5 : i / (posts - 1);
      const p = a.clone().lerp(b, t);
      const groundY = Math.max(0, Math.min(a.y, b.y) - 4); // best-effort base
      const postH = p.y - groundY;
      if (postH < 0.2) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH, 6), railMat);
      post.position.set(p.x, p.y - postH / 2, p.z);
      post.castShadow = true;
      this.scene.add(post);
      this.physics.addCylinder(new THREE.Vector3(p.x, p.y - postH, p.z), p, 0.05);
    }
  }

  /** Stair set: platform + steps + grindable handrail. */
  moduleStairs(x: number, z: number, yaw: number, h: number, w: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const platLen = 4;
    const plat = this.solidMesh(new THREE.BoxGeometry(w, h, platLen), this.mat(this.theme.groundDark), 'box');
    plat.position.y = h / 2;
    g.add(plat);
    const steps = h * 3;
    const stepH = h / steps;
    const stepD = 0.8;
    for (let i = 0; i < steps; i++) {
      const sh = h - stepH * (i + 1);
      if (sh <= 0.01) continue;
      const step = this.solidMesh(new THREE.BoxGeometry(w, sh, stepD), this.mat(this.theme.groundDark), 'box');
      step.position.set(0, sh / 2, platLen / 2 + stepD / 2 + i * stepD);
      g.add(step);
    }
    this.register(g);

    const quat = yawQuat(yaw);
    const origin = new THREE.Vector3(x, y, z);
    const railA = new THREE.Vector3(0, h + 0.55, platLen / 2 - 0.4).applyQuaternion(quat).add(origin);
    const railB = new THREE.Vector3(0, 0.55, platLen / 2 + steps * stepD + 0.6).applyQuaternion(quat).add(origin);
    this.pushRail(railA, railB);
    this.physics.addCylinder(railA, railB, 0.05);
    const railMat = this.mat(this.theme.rail);
    const dir = railB.clone().sub(railA);
    const len = dir.length();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), railMat);
    pipe.position.copy(railA).add(railB).multiplyScalar(0.5);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    pipe.castShadow = true;
    this.scene.add(pipe);
  }

  moduleManualPad(x: number, z: number, yaw: number, len: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const pad = this.solidMesh(new THREE.BoxGeometry(len, 0.4, 3), this.mat(this.theme.groundDark), 'box');
    pad.position.y = 0.2;
    g.add(pad);
    this.register(g);
  }

  /** Roller: low double wedge — pump bump / mogul. */
  moduleRoller(x: number, z: number, yaw: number, w: number, y = 0): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const geo = this.wedgeGeo(w, 0.5, 1.2);
    for (const side of [0, Math.PI]) {
      const wedge = this.solidMesh(geo, this.mat(this.theme.rampAlt), 'trimesh');
      wedge.rotation.y = side;
      g.add(wedge);
    }
    this.register(g);
  }

  /* ---------------- Burger Shack drive-through ---------------- */

  private stripeTexture(): THREE.CanvasTexture {
    if (this.stripeTex) return this.stripeTex;
    this.stripeTex = texFromCanvas((ctx, s) => {
      const n = 6, cw = s / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#f4efe2' : '#d8342b';
        ctx.fillRect(i * cw, 0, cw, s);
      }
    });
    return this.stripeTex;
  }

  private buildRoofBurger(): THREE.Group {
    const g = new THREE.Group();
    const add = (m: THREE.Mesh, y: number) => { m.position.y = y; m.castShadow = true; g.add(m); };
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.5, 16), this.mat(0xe0a04e)), 0.25);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 16), this.mat(0x7a4426)), 0.65);
    const cheese = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.16, 1.95), this.mat(0xf9c440));
    cheese.rotation.y = Math.PI / 4; add(cheese, 0.9);
    const lettuce = new THREE.Mesh(new THREE.SphereGeometry(1.32, 14, 8), this.mat(0x77c04b));
    lettuce.scale.y = 0.2; add(lettuce, 1.05);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0xe0a04e));
    top.scale.y = 0.72; add(top, 1.15);
    const seedMat = this.mat(0xf7ecd2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (i % 2);
      const r = 0.3 + (i % 3) * 0.28;
      const seed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), seedMat);
      seed.position.set(Math.cos(a) * r, 1.15 + Math.sqrt(Math.max(0, 1.25 * 1.25 - r * r)) * 0.72, Math.sin(a) * r);
      g.add(seed);
    }
    return g;
  }

  /**
   * Red-and-white striped burger shack with a big burger on the roof and a
   * glowing drive-through drop-off out front. Driving through the ring cashes
   * in your stack (GameApp reads `driveThrough`).
   */
  moduleBurgerShack(x: number, z: number, yaw: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const white = this.mat(0xf4efe2);
    const striped = new THREE.MeshLambertMaterial({ map: this.stripeTexture(), flatShading: true });

    const bw = 7, bh = 4, bd = 5;
    const wall = this.solidMesh(new THREE.BoxGeometry(bw, bh, bd), striped, 'box');
    wall.position.set(0, bh / 2, -2.6);
    g.add(wall);
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 0.25), this.mat(0x2a2f3a));
    win.position.set(0, 2.1, -0.08);
    g.add(win);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 0.6), white);
    counter.position.set(0, 1.2, 0.1);
    g.add(counter);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, 0.5, bd + 0.6), white);
    roof.position.set(0, bh + 0.2, -2.6);
    roof.castShadow = true;
    g.add(roof);

    // Striped awning on posts over the drive-through lane.
    const awning = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.3, 3), striped);
    awning.position.set(0, 3.1, 0.7);
    awning.rotation.x = -0.14;
    awning.castShadow = true;
    g.add(awning);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.1, 6), white);
      post.position.set(sx * (bw / 2 - 0.4), 1.55, 1.9);
      g.add(post);
    }

    const burger = this.buildRoofBurger();
    burger.position.set(0, bh + 0.5, -2.6);
    g.add(burger);

    this.register(g); // only the wall has a collider

    // Glowing drop-off zone out front (+z local).
    const zone = new THREE.Vector3(0, 0, 3.4).applyEuler(new THREE.Euler(0, yaw, 0)).add(new THREE.Vector3(x, 0, z));
    const glow = new THREE.Group();
    glow.position.copy(zone);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.24, 10, 30),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 9, 26, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    cyl.position.y = 4.5;
    glow.add(ring, cyl);
    glow.userData.noWireframe = true;
    glow.userData.hideInDebug = true;
    this.scene.add(glow);
    this.driveGlow = { ring, cyl };
    this.driveThrough = { pos: zone, radius: 3.4 };
  }

  private pushRail(a: THREE.Vector3, b: THREE.Vector3, label: 'rail' | 'lip' = 'rail'): void {
    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    this.rails.push({ a, b, dir, length, label });
  }

  /* ================================================================ */
  /* Environment (derived from bounds + theme)                        */
  /* ================================================================ */

  private buildEnvironment(): void {
    this.scene.fog = new THREE.Fog(0x8ec9ff, 90, 320);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a8a68, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
    const ext = Math.max(this.bounds.x, this.bounds.z);
    sun.position.set(ext * 0.7, ext * 0.9, ext * 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -ext - 20;
    sun.shadow.camera.right = ext + 20;
    sun.shadow.camera.top = ext + 20;
    sun.shadow.camera.bottom = -ext - 20;
    sun.shadow.camera.far = ext * 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04; // kills the shadow acne on curved ramps
    sun.shadow.radius = 3.5;      // soft PCF contact shadows
    this.scene.add(sun);

    // Cool fill from the opposite side: lifts the shadow side and gives the
    // chunky shapes some form instead of reading flat. Preset-independent.
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.35);
    fill.position.set(-ext * 0.6, ext * 0.55, -ext * 0.7);
    this.scene.add(fill);

    this.sky = new SkySystem(this.scene, sun, hemi);

    this.buildFoliage();

    // Chunky clouds.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.5;
      const cloud = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2 - p * 0.7, 0), cloudMat);
        puff.position.set(p * 3.4 - 3.4, (p % 2), 0);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(a) * this.bounds.x * 0.8, 30 + (i % 3) * 5, Math.sin(a) * this.bounds.z * 0.9);
      this.scene.add(cloud);
    }
  }

  /* ---------------- foliage: higher-fidelity trees, bushes, rocks --------- */

  private frnd = 12345;
  /** Deterministic pseudo-random so a level's belt looks the same each load. */
  private rnd(): number {
    this.frnd = (this.frnd * 1103515245 + 12345) & 0x7fffffff;
    return this.frnd / 0x7fffffff;
  }

  private buildFoliage(): void {
    this.frnd = Math.round((this.bounds.x + this.bounds.z) * 131) || 1;
    const kind: FoliageKind = this.theme.foliage ?? (this.theme.snowPines ? 'pine' : 'round');
    const bx = this.bounds.x + 2;
    const bz = this.bounds.z + 2;
    const count = Math.round((this.bounds.x + this.bounds.z) / 7);
    for (let i = 0; i < count; i++) {
      const u = (i / count) * 4;
      const side = Math.floor(u);
      const f = u - side;
      const out = 8 + this.rnd() * 14; // deeper, staggered belt
      let tx = 0, tz = 0;
      if (side === 0) { tx = -bx + f * 2 * bx; tz = -(bz + out); }
      else if (side === 1) { tx = bx + out; tz = -bz + f * 2 * bz; }
      else if (side === 2) { tx = bx - f * 2 * bx; tz = bz + out; }
      else { tx = -(bx + out); tz = bz - f * 2 * bz; }
      const tree = this.makeTree(kind);
      tree.position.set(tx + (this.rnd() - 0.5) * 6, 0, tz + (this.rnd() - 0.5) * 6);
      tree.scale.setScalar(0.85 + this.rnd() * 0.5);
      tree.rotation.y = this.rnd() * Math.PI * 2;
      this.scene.add(tree);

      if (this.rnd() < 0.7) {
        const deco = this.rnd() < 0.65 ? this.makeBush() : this.makeRock();
        deco.position.set(tx + (this.rnd() - 0.5) * 10, 0, tz + (this.rnd() - 0.5) * 10);
        deco.rotation.y = this.rnd() * Math.PI * 2;
        this.scene.add(deco);
      }
    }
  }

  private makeTree(kind: FoliageKind): THREE.Group {
    switch (kind) {
      case 'palm': return this.makeTreePalm();
      case 'jungle': return this.makeTreeJungle();
      case 'redwood': return this.makeTreeRedwood();
      case 'pine': return this.makeTreePine();
      case 'city': return this.makeTreeRound(2.6, true);
      default: return this.makeTreeRound(2.8, false);
    }
  }

  private crownMat(alt = false): THREE.MeshLambertMaterial {
    return this.mat(alt && this.theme.treeCrown2 !== undefined ? this.theme.treeCrown2 : this.theme.treeCrown);
  }

  private makeTreeRound(trunkH: number, tidy: boolean): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, trunkH, 7), this.mat(this.theme.treeTrunk));
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const base = trunkH + 1.1;
    const blobs: [number, number, number, number, boolean][] = tidy
      ? [[0, base, 0, 2.0, false], [0, base + 1.0, 0, 1.5, true]]
      : [[0, base, 0, 2.2, false], [1.1, base - 0.5, 0.3, 1.5, true], [-0.9, base - 0.3, -0.5, 1.4, false], [0.2, base + 1.1, 0.2, 1.4, true]];
    for (const [x, y, z, r, alt] of blobs) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), this.crownMat(alt));
      crown.position.set(x, y, z);
      crown.castShadow = true;
      g.add(crown);
    }
    return g;
  }

  private makeTreePine(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 7), this.mat(this.theme.treeTrunk));
    trunk.position.y = 1.2;
    g.add(trunk);
    for (let t = 0; t < 4; t++) {
      const r = 2.3 - t * 0.5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 2.1, 8), this.crownMat(t % 2 === 1));
      cone.position.y = 2.4 + t * 1.35;
      cone.castShadow = true;
      g.add(cone);
    }
    if (this.theme.snowPines) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 7), this.mat(0xf4f8fc));
      cap.position.y = 8.0;
      g.add(cap);
    }
    return g;
  }

  private makeTreePalm(): THREE.Group {
    const g = new THREE.Group();
    const trunkMat = this.mat(this.theme.treeTrunk);
    let px = 0, py = 0;
    for (let s = 0; s < 6; s++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - s * 0.015, 0.24 - s * 0.015, 1.15, 7), trunkMat);
      px += 0.16 * s * 0.1;
      seg.position.set(px, py + 0.58, 0);
      seg.rotation.z = -0.05 * s;
      seg.castShadow = true;
      g.add(seg);
      py += 1.1;
    }
    const frondMat = this.crownMat();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 5), frondMat);
      frond.position.set(px + Math.cos(a) * 1.1, py + 0.1, Math.sin(a) * 1.1);
      frond.rotation.z = Math.cos(a) * 1.15;
      frond.rotation.x = -Math.sin(a) * 1.15;
      frond.scale.set(0.6, 1, 0.6);
      frond.castShadow = true;
      g.add(frond);
    }
    for (let c = 0; c < 3; c++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), this.mat(0x8a5a2b));
      nut.position.set(px + (c - 1) * 0.18, py - 0.2, 0.1);
      g.add(nut);
    }
    return g;
  }

  private makeTreeJungle(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4.2, 8), this.mat(this.theme.treeTrunk));
    trunk.position.y = 2.1;
    trunk.castShadow = true;
    g.add(trunk);
    const canopy: [number, number, number, number, boolean][] = [
      [0, 5.6, 0, 3.0, false], [2.1, 5.0, 0.6, 1.9, true], [-1.9, 5.2, -0.7, 1.8, true],
      [0.4, 6.6, 0.3, 1.9, false], [-0.6, 5.3, 1.8, 1.6, true],
    ];
    for (const [x, y, z, r, alt] of canopy) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), this.crownMat(alt));
      blob.position.set(x, y, z);
      blob.scale.y = 0.85;
      blob.castShadow = true;
      g.add(blob);
    }
    for (let v = 0; v < 3; v++) {
      const a = this.rnd() * Math.PI * 2;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6 + this.rnd(), 5), this.crownMat(true));
      vine.position.set(Math.cos(a) * 2.2, 4.3, Math.sin(a) * 2.2);
      g.add(vine);
    }
    return g;
  }

  private makeTreeRedwood(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.85, 9, 8), this.mat(this.theme.treeTrunk));
    trunk.position.y = 4.5;
    trunk.castShadow = true;
    g.add(trunk);
    for (let t = 0; t < 4; t++) {
      const r = 2.4 - t * 0.5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 3.0, 8), this.crownMat(t % 2 === 1));
      cone.position.y = 7.2 + t * 1.7;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  }

  private makeBush(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = 0.7 + this.rnd() * 0.5;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), this.crownMat(i === 1));
      blob.position.set((this.rnd() - 0.5) * 1.4, r * 0.7, (this.rnd() - 0.5) * 1.4);
      blob.scale.y = 0.8;
      blob.castShadow = true;
      g.add(blob);
    }
    return g;
  }

  private makeRock(): THREE.Group {
    const g = new THREE.Group();
    const grey = this.mat(0x8b8b90);
    for (let i = 0; i < 2; i++) {
      const r = 0.6 + this.rnd() * 0.9;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), grey);
      rock.position.set((this.rnd() - 0.5) * 1.6, r * 0.45, (this.rnd() - 0.5) * 1.6);
      rock.scale.set(1, 0.6, 1.1);
      rock.rotation.set(this.rnd(), this.rnd() * Math.PI, this.rnd());
      rock.castShadow = true;
      g.add(rock);
    }
    return g;
  }

  private buildGroundAndWalls(): void {
    const w = this.bounds.x * 2 + 5;
    const d = this.bounds.z * 2 + 5;
    const ground = this.solidMesh(new THREE.BoxGeometry(w, 1, d), this.mat(this.theme.ground), 'box');
    ground.position.y = -0.5;
    ground.castShadow = false;
    this.scene.add(ground);
    this.physics.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(w, 1, d));

    // Ground skirt (grass/sand/canyon floor). Water levels get a modest
    // beach ring so the ocean shows around it; dry levels keep a big skirt.
    const water = this.theme.water;
    const skirt = water ? (water.surround ?? 40) : 90;
    const surround = new THREE.Mesh(
      new THREE.BoxGeometry(w + skirt, 0.9, d + skirt * 0.78), this.mat(this.theme.surround),
    );
    surround.position.y = -0.56;
    surround.receiveShadow = true;
    this.scene.add(surround);

    if (water) {
      this.water = new WaterSystem(this.scene, {
        shallow: water.shallow,
        deep: water.deep,
        // Keep the surface (and its wave crests, ~+1) below the park deck so
        // it laps the shore instead of poking up through the floor.
        level: Math.min(water.level ?? -1.35, -1.2),
        extent: 420,
        fog: this.theme.skyPresets ? 0x9fc6e8 : 0x8ec9ff,
      });
    }

    this.buildCurvedPerimeter();

    // Spawn pad marker.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 3), this.mat(0x8fc7e8));
    pad.position.set(this.config.spawn.x, 0.012, this.config.spawn.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  /** Low transition + tall concrete retaining wall around the rounded map. */
  private buildCurvedPerimeter(): void {
    const lx = this.bounds.x + 0.5;
    const lz = this.bounds.z + 0.5;
    const cr = Math.min(16, this.bounds.x * 0.5, this.bounds.z * 0.5);
    const geo = makePerimeterGeometry(lx, lz, cr, PERIMETER_TRANSITION_H, PERIMETER_WALL_H);
    const mat = new THREE.MeshLambertMaterial({ color: this.theme.groundDark, flatShading: true, side: THREE.DoubleSide });
    this.applyTriplanar(mat, this.concreteTexture(), 0.32);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.physics.addTrimesh(geo, new THREE.Vector3(0, 0, 0), new THREE.Quaternion());

    // Cap is visual-only and lives entirely outside the wall. Keeping it out
    // of the rideable volume removes the old top-edge collision/flip hazard.
    const capGeo = makePerimeterCapGeometry(lx, lz, cr, PERIMETER_WALL_H, PERIMETER_CAP_DEPTH);
    const cap = new THREE.Mesh(capGeo, mat);
    cap.castShadow = true;
    cap.receiveShadow = true;
    this.scene.add(cap);
  }

  private buildLampPosts(): void {
    const spots: [number, number][] = [
      [-this.bounds.x * 0.5, -this.bounds.z - 4], [this.bounds.x * 0.5, -this.bounds.z - 4],
      [-this.bounds.x * 0.5, this.bounds.z + 4], [this.bounds.x * 0.5, this.bounds.z + 4],
      [-this.bounds.x - 4, -this.bounds.z * 0.4], [-this.bounds.x - 4, this.bounds.z * 0.4],
      [this.bounds.x + 4, -this.bounds.z * 0.4], [this.bounds.x + 4, this.bounds.z * 0.4],
    ];
    const poleMat = this.mat(0x3a3f4a);
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
      lamp.rotation.y = Math.atan2(-x, -z);
      this.scene.add(lamp);
      this.sky.registerLamp(light, bulbMat);
    }
  }

  /* ================================================================ */
  /* Collectibles: burger/crown coins & blue boost orbs               */
  /* ================================================================ */

  /**
   * Burger/crown coins. Each one collected drops a random topping onto the
   * burger and still banks a coin.
   */
  placeCollectibles(spots: [number, number, number][]): void {
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      const coin = createBurgerCrownCoin({ radius: 0.42, depth: 0.13, glow: true });
      coin.rotation.y = Math.random() * Math.PI * 2;
      g.add(coin);
      g.position.set(x, y, z);
      g.userData.baseY = y;
      this.scene.add(g);
      this.collectibles.push({ mesh: g, taken: false });
    }
    this.totalCollectibles = this.collectibles.length;
  }

  placeBoostOrbs(spots: [number, number, number][]): void {
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

  update(dt: number, playerPos: THREE.Vector3): { coins: number; orbs: number } {
    this.spinTime += dt;
    this.elapsed += dt;
    if (this.water) {
      this.water.update(this.elapsed);
      const fog = this.scene.fog as THREE.Fog | null;
      if (fog) this.water.setFog(fog.color.getHex()); // match the current sky
    }
    if (this.driveGlow) {
      const { ring, cyl } = this.driveGlow;
      ring.rotation.z += dt * 1.4;
      ring.position.y = 0.25 + Math.sin(this.spinTime * 3) * 0.18;
      (cyl.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.abs(Math.sin(this.spinTime * 2)) * 0.1;
    }
    let coins = 0;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 1.65;
      c.mesh.position.y = c.mesh.userData.baseY + Math.sin(this.spinTime * 2.5 + c.mesh.position.x) * 0.07;
      const glow = c.mesh.getObjectByName('coin-glow');
      if (glow instanceof THREE.Mesh) {
        glow.scale.setScalar(1 + Math.sin(this.spinTime * 4.6 + c.mesh.position.z) * 0.08);
        (glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(this.spinTime * 3.2) * 0.04;
      }
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

  /** Free GPU resources when switching levels. */
  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    this.scene.clear();
  }
}
