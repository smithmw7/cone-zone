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
const WALL_HEIGHT = 3;

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
  tex.anisotropy = 4;
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
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.sky = new SkySystem(this.scene, sun, hemi);

    // Tree ring OUTSIDE the walls: walk the wall rectangle's perimeter and
    // push each tree outward. (An ellipse ring dips inside a rectangle's
    // corners, which used to leave trees overlapping walls and the park.)
    const count = Math.round((this.bounds.x + this.bounds.z) / 8);
    for (let i = 0; i < count; i++) {
      const u = (i / count) * 4;
      const side = Math.floor(u);
      const f = u - side;
      const out = 7 + (i % 3) * 4; // stagger depth so it's not a fence
      const bx = this.bounds.x + 2;
      const bz = this.bounds.z + 2;
      let tx = 0, tz = 0;
      if (side === 0) { tx = -bx + f * 2 * bx; tz = -(bz + out); }
      else if (side === 1) { tx = bx + out; tz = -bz + f * 2 * bz; }
      else if (side === 2) { tx = bx - f * 2 * bx; tz = bz + out; }
      else { tx = -(bx + out); tz = bz - f * 2 * bz; }
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.6, 7), this.mat(this.theme.treeTrunk));
      trunk.position.y = 1.3;
      tree.add(trunk);
      if (this.theme.snowPines) {
        for (let t = 0; t < 3; t++) {
          const r = 2.2 - t * 0.6;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 2.2, 7), this.mat(this.theme.treeCrown));
          cone.position.y = 2.6 + t * 1.5;
          cone.castShadow = true;
          tree.add(cone);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 7), this.mat(0xf4f8fc));
        cap.position.y = 7.1;
        tree.add(cap);
      } else {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 0), this.mat(this.theme.treeCrown));
        crown.position.y = 3.6;
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.position.set(tx, 0, tz);
      this.scene.add(tree);
    }

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

  private buildGroundAndWalls(): void {
    const w = this.bounds.x * 2 + 5;
    const d = this.bounds.z * 2 + 5;
    const ground = this.solidMesh(new THREE.BoxGeometry(w, 1, d), this.mat(this.theme.ground), 'box');
    ground.position.y = -0.5;
    ground.castShadow = false;
    this.scene.add(ground);
    this.physics.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(w, 1, d));

    const surround = new THREE.Mesh(new THREE.BoxGeometry(w + 90, 0.9, d + 70), this.mat(this.theme.surround));
    surround.position.y = -0.56;
    surround.receiveShadow = true;
    this.scene.add(surround);

    // High perimeter walls (solid, bonkable; position clamp is the backstop).
    const wallMat = this.mat(this.theme.groundDark);
    const capMat = this.mat(this.theme.rampAlt);
    const wx = this.bounds.x + 2;
    const wz = this.bounds.z + 2;
    const mkWall = (ww: number, wd: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, WALL_HEIGHT, wd), wallMat);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.physics.addBox(new THREE.Vector3(x, WALL_HEIGHT / 2, z), new THREE.Vector3(ww, WALL_HEIGHT, wd));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(ww === 1 ? 1.4 : ww, 0.25, wd === 1 ? 1.4 : wd), capMat);
      cap.position.set(x, WALL_HEIGHT + 0.12, z);
      this.scene.add(cap);
    };
    mkWall(wx * 2 + 1, 1, 0, -wz);
    mkWall(wx * 2 + 1, 1, 0, wz);
    mkWall(1, wz * 2 + 1, -wx, 0);
    mkWall(1, wz * 2 + 1, wx, 0);

    // Spawn pad marker.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 3), this.mat(0x8fc7e8));
    pad.position.set(this.config.spawn.x, 0.012, this.config.spawn.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
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
  /* Collectibles: mystery boxes & blue boost orbs                    */
  /* ================================================================ */

  /**
   * Mystery boxes — spinning golden "?" crates. Each one collected drops
   * a random topping onto the burger (and still banks a coin).
   */
  placeCollectibles(spots: [number, number, number][]): void {
    const qTex = texFromCanvas((ctx, s) => {
      ctx.fillStyle = '#f2b632';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#b57f14';
      ctx.lineWidth = s * 0.09;
      ctx.strokeRect(0, 0, s, s);
      ctx.fillStyle = '#fff6e0';
      ctx.font = `900 ${s * 0.62}px 'Arial Rounded MT Bold', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', s / 2, s * 0.55);
    });
    const boxMat = new THREE.MeshLambertMaterial({
      map: qTex, emissive: 0x6a4a10, emissiveIntensity: 0.35, flatShading: true,
    });
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), boxMat);
      box.castShadow = true;
      g.add(box);
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
    let coins = 0;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 3; // the mystery spin
      c.mesh.position.y = c.mesh.userData.baseY + Math.sin(this.spinTime * 2.5 + c.mesh.position.x) * 0.07;
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
