/**
 * CharacterFactory
 * ----------------
 * Builds the player character rig entirely from Three.js primitives —
 * no imported assets. The rig hierarchy is designed for the arcade
 * animation the controller drives:
 *
 *   root  (position + yaw, set by PlayerController)
 *    └─ tilt   (aligns to ground slope)
 *        ├─ board (deck, wheels — tilts during grinds)
 *        └─ body  (wobble pivot at deck level; squash/stretch + wobble)
 *            ├─ cone / tube / ducky meshes
 *            └─ accessory
 *
 * Everything uses flat-shaded Lambert materials with low segment counts
 * for the chunky PS2 look, and cheap canvas textures for deck art.
 */
import * as THREE from 'three';
import { CustomizationState, type BoardId } from './CustomizationState';

export interface CharacterRig {
  root: THREE.Group;
  tilt: THREE.Group;
  body: THREE.Group;
  board: THREE.Group;
  wheels: THREE.Mesh[];
  /** parts the controller keeps spinning (propeller cap, halo shimmer) */
  spinners: THREE.Object3D[];
  /** local-space point behind the board where trails spawn */
  trailAnchor: THREE.Object3D;
  height: number;
  /** SKATE BURGER: the grow-with-toppings stack (see BurgerStack) */
  stack?: BurgerStack;
  dispose(): void;
}

function lambert(color: number, opts: { emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 0.5;
  }
  return m;
}

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Deck art — tiny canvas textures keep the PS2 "baked" look cheap.   */
/* ------------------------------------------------------------------ */

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crunchy pixels on purpose
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, s) => {
    const n = 8;
    const c = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f5f0e6' : '#20242c';
        ctx.fillRect(x * c, y * c, c, c);
      }
  });
}

function galaxyTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, s) => {
    ctx.fillStyle = '#191036';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5b3aa8';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.42, s * 0.16, 0.6, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 40; i++) {
      const bright = Math.random();
      ctx.fillStyle = bright > 0.7 ? '#ffffff' : '#b9a0ff';
      const r = bright > 0.9 ? 2 : 1;
      ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
    }
  });
}

function pizzaTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, s) => {
    ctx.fillStyle = '#e8a33d'; // crust
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f7c948'; // cheese
    ctx.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);
    ctx.fillStyle = '#d63b2f'; // pepperoni
    const spots: [number, number][] = [
      [0.28, 0.25], [0.68, 0.2], [0.5, 0.5], [0.25, 0.7], [0.72, 0.72], [0.5, 0.88],
    ];
    for (const [x, y] of spots) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Skateboard                                                          */
/* ------------------------------------------------------------------ */

function buildBoard(style: BoardId, wheelColor: number): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const group = new THREE.Group();

  let deckMat: THREE.MeshLambertMaterial;
  switch (style) {
    case 'checkerboard':
      deckMat = new THREE.MeshLambertMaterial({ map: checkerTexture(), flatShading: true });
      break;
    case 'pizza':
      deckMat = new THREE.MeshLambertMaterial({ map: pizzaTexture(), flatShading: true });
      break;
    case 'neon':
      deckMat = lambert(0x2b1040, { emissive: 0xff2bd6, emissiveIntensity: 0.85 });
      break;
    case 'galaxy':
      deckMat = new THREE.MeshLambertMaterial({ map: galaxyTexture(), flatShading: true });
      deckMat.emissive = new THREE.Color(0x2b1a5e);
      deckMat.emissiveIntensity = 0.5;
      break;
    case 'gold':
      deckMat = lambert(0xd4af37, { emissive: 0x664d1a, emissiveIntensity: 0.5 });
      break;
    case 'wood':
      deckMat = lambert(0xa5713d);
      break;
    default:
      deckMat = lambert(0x3a3f4a);
  }

  // Deck: main slab + kicked nose/tail for silhouette.
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.05), deckMat));
  deck.position.y = 0.13;
  group.add(deck);
  for (const dir of [1, -1]) {
    const kick = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.055, 0.24), deckMat));
    kick.position.set(0, 0.16, dir * 0.6);
    kick.rotation.x = -dir * 0.35;
    group.add(kick);
  }

  // Wheels — cylinders lying on the X axis.
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.07, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = lambert(wheelColor);
  for (const z of [0.34, -0.34])
    for (const x of [0.17, -0.17]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.075, z);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    }

  return { group, wheels };
}

/* ------------------------------------------------------------------ */
/* Bodies — each returns anchors for hats + sunglasses.                */
/* ------------------------------------------------------------------ */

interface BodyBuild {
  group: THREE.Group;
  topAnchor: THREE.Vector3; // where hats sit
  eyeAnchor: THREE.Vector3; // where sunglasses sit
}

/** Googly eyes: shared by every body type because eyes are funny. */
function addEyes(group: THREE.Group, y: number, z: number, spread: number, scale = 1): void {
  const white = lambert(0xffffff);
  const black = lambert(0x14141a);
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09 * scale, 8, 6), white);
    eye.position.set(side * spread, y, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 8, 6), black);
    pupil.position.set(side * spread, y, z + 0.06 * scale);
    group.add(eye, pupil);
  }
}

function buildConeBody(color: number): BodyBuild {
  const group = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), lambert(color)));
  base.position.y = 0.06;
  group.add(base);

  // Tapered cone body, low radial segments for chunk.
  const cone = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.42, 1.05, 12), lambert(color)));
  cone.position.y = 0.64;
  group.add(cone);

  // Reflective white stripe (slightly fatter band).
  const stripe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.3, 0.22, 12), lambert(0xf5f0e6)));
  stripe.position.y = 0.78;
  group.add(stripe);

  addEyes(group, 0.92, 0.16, 0.1);
  return { group, topAnchor: new THREE.Vector3(0, 1.17, 0), eyeAnchor: new THREE.Vector3(0, 0.92, 0.14) };
}

function buildTubeBody(color: number): BodyBuild {
  const group = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), lambert(color)));
  base.position.y = 0.06;
  group.add(base);

  const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.65, 10), lambert(color)));
  tube.position.y = 0.94;
  group.add(tube);

  // Two safety stripes because tall cones are extra official.
  for (const y of [0.62, 1.18]) {
    const t = (y - 0.12) / 1.65;
    const r = 0.24 + (0.16 - 0.24) * t + 0.025;
    const stripe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r - 0.01, r + 0.01, 0.2, 10), lambert(0xf5f0e6)));
    stripe.position.y = y;
    group.add(stripe);
  }

  addEyes(group, 1.52, 0.16, 0.09);
  return { group, topAnchor: new THREE.Vector3(0, 1.78, 0), eyeAnchor: new THREE.Vector3(0, 1.52, 0.13) };
}

function buildDuckyBody(color: number): BodyBuild {
  const group = new THREE.Group();
  const mat = lambert(color);

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 9), mat));
  body.scale.set(1, 0.82, 1.12);
  body.position.y = 0.46;
  group.add(body);

  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), mat));
  head.position.set(0, 1.02, 0.18);
  group.add(head);

  // Beak
  const beak = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 8), lambert(0xff8c1a)));
  beak.rotation.x = Math.PI / 2;
  beak.scale.y = 0.9;
  beak.position.set(0, 0.98, 0.52);
  group.add(beak);

  // Wings
  for (const side of [1, -1]) {
    const wing = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat));
    wing.scale.set(0.45, 0.7, 1);
    wing.position.set(side * 0.48, 0.5, -0.05);
    wing.rotation.z = side * -0.3;
    group.add(wing);
  }

  // Tail flick
  const tail = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), mat));
  tail.rotation.x = -Math.PI / 2.6;
  tail.position.set(0, 0.62, -0.52);
  group.add(tail);

  addEyes(group, 1.1, 0.4, 0.13, 0.9);
  return { group, topAnchor: new THREE.Vector3(0, 1.32, 0.18), eyeAnchor: new THREE.Vector3(0, 1.1, 0.38) };
}

function darken(color: number, f = 0.78): number {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}

function buildFingerBody(color: number): BodyBuild {
  const g = new THREE.Group();
  const mat = lambert(color);

  // Base mound (the "hand" it rises from) + big pointer shaft.
  const mound = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 7), mat));
  mound.scale.set(1.15, 0.5, 1.15);
  mound.position.y = 0.1;
  g.add(mound);

  const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 1.35, 10), mat));
  shaft.position.y = 0.75;
  g.add(shaft);

  const tip = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat));
  tip.position.y = 1.44;
  g.add(tip);

  // Fingernail on the back, eyes on the front. Perfection.
  const nail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.07), lambert(0xf7e8dc)));
  nail.position.set(0, 1.46, -0.22);
  nail.rotation.x = 0.12;
  g.add(nail);

  // Knuckle creases.
  const crease = lambert(darken(color));
  for (const y of [0.55, 1.0]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.05, 10), crease);
    band.position.y = y;
    g.add(band);
  }

  addEyes(g, 1.42, 0.2, 0.1);
  return { group: g, topAnchor: new THREE.Vector3(0, 1.7, 0), eyeAnchor: new THREE.Vector3(0, 1.42, 0.18) };
}

function buildTeddyBody(color: number): BodyBuild {
  const g = new THREE.Group();
  const mat = lambert(color);
  const light = lambert(0xf0dcbe);

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9), mat));
  body.scale.set(1, 1.05, 0.85);
  body.position.y = 0.52;
  g.add(body);

  const belly = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), light));
  belly.scale.set(1, 1.15, 0.5);
  belly.position.set(0, 0.5, 0.26);
  g.add(belly);

  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), mat));
  head.position.y = 1.14;
  g.add(head);

  const muzzle = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), light));
  muzzle.scale.set(1.1, 0.8, 0.9);
  muzzle.position.set(0, 1.06, 0.24);
  g.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), lambert(0x3a2a20));
  nose.position.set(0, 1.1, 0.36);
  g.add(nose);

  for (const side of [1, -1]) {
    const ear = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat));
    ear.position.set(side * 0.22, 1.38, 0);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), light);
    inner.position.set(side * 0.22, 1.38, 0.07);
    const arm = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat));
    arm.scale.set(1, 1.7, 1);
    arm.position.set(side * 0.44, 0.66, 0.06);
    arm.rotation.z = side * -0.45;
    g.add(ear, inner, arm);
  }

  addEyes(g, 1.2, 0.24, 0.11, 0.8);
  return { group: g, topAnchor: new THREE.Vector3(0, 1.46, 0), eyeAnchor: new THREE.Vector3(0, 1.2, 0.22) };
}

function buildGoatBody(color: number): BodyBuild {
  const g = new THREE.Group();
  const mat = lambert(color);
  const bone = lambert(0xe0d6c2);

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 9), mat));
  body.scale.set(0.9, 1, 1.15);
  body.position.y = 0.48;
  g.add(body);

  const head = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.36), mat));
  head.position.set(0, 1.0, 0.14);
  g.add(head);
  const snout = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), mat));
  snout.position.set(0, 0.92, 0.4);
  g.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.05), lambert(0x5a4438));
  nose.position.set(0, 0.94, 0.52);
  g.add(nose);

  // Swept-back horns + floppy ears + the all-important beard.
  for (const side of [1, -1]) {
    const horn = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 6), bone));
    horn.position.set(side * 0.12, 1.26, -0.02);
    horn.rotation.x = -0.75;
    const ear = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), mat));
    ear.scale.set(0.55, 0.3, 0.9);
    ear.position.set(side * 0.22, 1.04, 0.08);
    ear.rotation.z = side * 0.9;
    g.add(horn, ear);
  }
  const beard = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), lambert(darken(color))));
  beard.rotation.x = Math.PI;
  beard.position.set(0, 0.78, 0.42);
  g.add(beard);
  const tail = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), mat));
  tail.rotation.x = -Math.PI / 3;
  tail.position.set(0, 0.78, -0.44);
  g.add(tail);

  addEyes(g, 1.08, 0.3, 0.12, 0.8);
  return { group: g, topAnchor: new THREE.Vector3(0, 1.34, 0.02), eyeAnchor: new THREE.Vector3(0, 1.08, 0.3) };
}

/* ------------------------------------------------------------------ */
/* Accessories                                                         */
/* ------------------------------------------------------------------ */

function buildAccessory(
  id: string,
  top: THREE.Vector3,
  eyes: THREE.Vector3,
  spinners: THREE.Object3D[],
): THREE.Group | null {
  const g = new THREE.Group();
  switch (id) {
    case 'crown': {
      const gold = lambert(0xd4af37, { emissive: 0x664d1a, emissiveIntensity: 0.4 });
      const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 8), gold));
      g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), gold));
        spike.position.set(Math.cos(a) * 0.16, 0.12, Math.sin(a) * 0.16);
        g.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), lambert(0xff4070, { emissive: 0xff4070, emissiveIntensity: 0.7 }));
      gem.position.set(0, 0.03, 0.18);
      g.add(gem);
      g.position.copy(top);
      break;
    }
    case 'halo': {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.035, 8, 18),
        lambert(0xffe066, { emissive: 0xffe066, emissiveIntensity: 1 }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.copy(top).add(new THREE.Vector3(0, 0.28, 0));
      g.add(halo);
      spinners.push(halo); // gentle shimmer spin
      break;
    }
    case 'propeller': {
      const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x3d8bff)));
      cap.scale.y = 0.8;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6), lambert(0x8a8a8a));
      hub.position.y = 0.16;
      const prop = new THREE.Group();
      for (const rot of [0, Math.PI / 2]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.05), lambert(0xffd21f));
        blade.rotation.y = rot;
        prop.add(blade);
      }
      prop.position.y = 0.22;
      spinners.push(prop);
      g.add(cap, hub, prop);
      g.position.copy(top).add(new THREE.Vector3(0, -0.03, 0));
      break;
    }
    case 'beanie': {
      const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xd63b2f)));
      dome.scale.y = 0.85;
      const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 10), lambert(0xa82c22)));
      brim.position.y = 0.01;
      const pom = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lambert(0xf5f0e6)));
      pom.position.y = 0.2;
      g.add(brim, dome, pom);
      g.position.copy(top).add(new THREE.Vector3(0, -0.04, 0));
      break;
    }
    case 'cowboy': {
      const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 12), lambert(0x8a5a2b)));
      const crown = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.24, 10), lambert(0x9c6a35)));
      crown.position.y = 0.14;
      const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.2, 0.07, 10), lambert(0x4a2f16)));
      band.position.y = 0.06;
      g.add(brim, crown, band);
      g.position.copy(top);
      g.rotation.z = 0.08; // rakish tilt
      break;
    }
    case 'wizard': {
      const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 12), lambert(0x5b2d91)));
      const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), lambert(0x6d3ab0)));
      cone.position.y = 0.29;
      const star = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.07), lambert(0xffd21f, { emissive: 0xffd21f, emissiveIntensity: 0.6 })));
      star.position.set(0.1, 0.32, 0.14);
      g.add(brim, cone, star);
      g.position.copy(top);
      g.rotation.z = -0.1;
      break;
    }
    case 'chef': {
      const white = lambert(0xf7f4ee);
      const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), white));
      band.position.y = 0.06;
      const puff = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 9), white));
      puff.scale.set(1, 0.82, 1);
      puff.position.y = 0.28;
      g.add(band, puff);
      g.position.copy(top).add(new THREE.Vector3(0, -0.02, 0));
      break;
    }
    case 'party': {
      const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 12), lambert(0xff5ea8)));
      cone.position.y = 0.25;
      const pom = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0xffe14d)));
      pom.position.y = 0.5;
      g.add(cone, pom);
      g.position.copy(top);
      g.rotation.z = 0.12;
      break;
    }
    case 'tophat': {
      const black = lambert(0x1c1c22);
      const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), black));
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 16), black));
      barrel.position.y = 0.23;
      const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.08, 16), lambert(0xd63b2f)));
      band.position.y = 0.08;
      g.add(brim, barrel, band);
      g.position.copy(top);
      break;
    }
    case 'sunglasses': {
      const black = lambert(0x14141a);
      for (const side of [1, -1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.05), black);
        lens.position.set(side * 0.11, 0, 0.06);
        g.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.04), black);
      bridge.position.set(0, 0.02, 0.06);
      g.add(bridge);
      g.position.copy(eyes).add(new THREE.Vector3(0, 0.02, 0.05));
      break;
    }
    case 'round': {
      const frame = lambert(0x2a2a30);
      const glass = lambert(0x6fd0e0, { emissive: 0x2a8090, emissiveIntensity: 0.3 });
      for (const side of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 14), frame);
        ring.position.set(side * 0.1, 0, 0.06);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), glass);
        lens.position.set(side * 0.1, 0, 0.055);
        g.add(ring, lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.03), frame);
      bridge.position.set(0, 0, 0.06);
      g.add(bridge);
      g.position.copy(eyes).add(new THREE.Vector3(0, 0.02, 0.05));
      break;
    }
    case 'visor': {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.05), lambert(0x1a1a22));
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), lambert(0x14e0ff, { emissive: 0x14b0d0, emissiveIntensity: 0.85 }));
      bar.position.z = 0.03;
      g.add(frame, bar);
      g.position.copy(eyes).add(new THREE.Vector3(0, 0.03, 0.06));
      break;
    }
    case 'threed': {
      const frame = lambert(0xffffff);
      const tints = [
        lambert(0xff2b3a, { emissive: 0x901018, emissiveIntensity: 0.3 }),
        lambert(0x2be0ff, { emissive: 0x108090, emissiveIntensity: 0.3 }),
      ];
      let i = 0;
      for (const side of [1, -1]) {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.02), frame);
        rim.position.set(side * 0.1, 0, 0.055);
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.02), tints[i++]);
        lens.position.set(side * 0.1, 0, 0.065);
        g.add(rim, lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), frame);
      bridge.position.set(0, 0.02, 0.06);
      g.add(bridge);
      g.position.copy(eyes).add(new THREE.Vector3(0, 0.02, 0.05));
      break;
    }
    case 'star': {
      const starShape = new THREE.Shape();
      const spikes = 5, outer = 0.095, inner = 0.042;
      for (let k = 0; k < spikes * 2; k++) {
        const r = k % 2 === 0 ? outer : inner;
        const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        k === 0 ? starShape.moveTo(px, py) : starShape.lineTo(px, py);
      }
      starShape.closePath();
      const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.03, bevelEnabled: false });
      const gold = lambert(0xffd21f, { emissive: 0x8a6a10, emissiveIntensity: 0.5 });
      for (const side of [1, -1]) {
        const star = new THREE.Mesh(starGeo, gold);
        star.position.set(side * 0.1, 0, 0.05);
        g.add(star);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.03), gold);
      bridge.position.set(0, 0, 0.06);
      g.add(bridge);
      g.position.copy(eyes).add(new THREE.Vector3(0, 0.02, 0.05));
      break;
    }
    default:
      return null;
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* SKATE BURGER — the star of the show                                 */
/*                                                                     */
/* The burger is a living sandwich: bottom bun + patty are permanent,  */
/* mystery-box toppings stack between them and the top bun, and each   */
/* layer is chained to the one below with a little spring sim so the   */
/* tower sways, whips and wobbles with the skating. Wipe out (bonk)    */
/* and every collected layer detaches into physics debris — you're     */
/* back to a basic bun-and-patty.                                      */
/* ------------------------------------------------------------------ */

export interface ToppingDef {
  id: string;
  label: string;
  emoji: string;
  h: number; // layer thickness the stack grows by
  build(): THREE.Group;
}

/** A flat layer disc with its base at y=0. */
function disc(r: number, h: number, color: number, seg = 14): THREE.Group {
  const g = new THREE.Group();
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), lambert(color)));
  m.position.y = h / 2;
  g.add(m);
  return g;
}

const TOPPINGS: ToppingDef[] = [
  { id: 'patty', label: 'Patty', emoji: '🥩', h: 0.13, build: () => disc(0.48, 0.13, 0x7a4426) },
  {
    id: 'cheese', label: 'Cheese', emoji: '🧀', h: 0.06,
    build: () => {
      const g = new THREE.Group();
      const slice = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.78), lambert(0xf9c440)));
      slice.position.y = 0.025;
      slice.rotation.y = Math.PI / 4; // corners poke out past the bun
      g.add(slice);
      return g;
    },
  },
  {
    id: 'lettuce', label: 'Lettuce', emoji: '🥬', h: 0.08,
    build: () => {
      const g = new THREE.Group();
      const leaf = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 7), lambert(0x77c04b)));
      leaf.scale.y = 0.16; // ruffly squashed sphere
      leaf.position.y = 0.05;
      g.add(leaf);
      return g;
    },
  },
  { id: 'tomato', label: 'Tomato', emoji: '🍅', h: 0.07, build: () => disc(0.44, 0.07, 0xd8402f) },
  {
    id: 'pickle', label: 'Pickles', emoji: '🥒', h: 0.07,
    build: () => {
      const g = new THREE.Group();
      for (const [px, pz] of [[0.2, 0.1], [-0.2, 0.14], [0.02, -0.22]] as const) {
        const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), lambert(0x5f8f3a)));
        p.position.set(px, 0.03, pz);
        g.add(p);
      }
      return g;
    },
  },
  {
    id: 'onion', label: 'Onion', emoji: '🧅', h: 0.05,
    build: () => {
      const g = new THREE.Group();
      for (const [r, px, pz] of [[0.24, 0.12, 0.1], [0.17, -0.18, -0.08]] as const) {
        const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 14), lambert(0xe9dff2)));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(px, 0.035, pz);
        g.add(ring);
      }
      return g;
    },
  },
  {
    id: 'bacon', label: 'Bacon', emoji: '🥓', h: 0.05,
    build: () => {
      const g = new THREE.Group();
      for (const [pz, rot] of [[0.14, 0.08], [-0.14, -0.06]] as const) {
        const strip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.22), lambert(0xa23b28)));
        strip.position.set(0, 0.025, pz);
        strip.rotation.z = rot;
        g.add(strip);
      }
      return g;
    },
  },
  { id: 'bun', label: 'Extra Bun', emoji: '🍞', h: 0.14, build: () => disc(0.5, 0.14, 0xe0a04e) },
];

interface BurgerParts {
  group: THREE.Group;
  topBun: THREE.Group;
  baseTop: number; // y of the base patty's top face (first topping sits here)
  topAnchor: THREE.Vector3; // hat anchor, LOCAL to topBun
  eyeAnchor: THREE.Vector3; // sunglasses anchor, LOCAL to topBun
}

function buildBurgerBody(): BurgerParts {
  const g = new THREE.Group();

  // Bottom bun (heel) + the permanent base patty.
  const heel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.2, 14), lambert(0xc98a3e)));
  heel.position.y = 0.1;
  g.add(heel);
  const patty = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.13, 14), lambert(0x7a4426)));
  patty.position.y = 0.265;
  g.add(patty);
  const baseTop = 0.33;

  // Top bun: sesame dome with the googly eyes — it rides the stack up.
  const topBun = new THREE.Group();
  const dome = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(0xe0a04e),
  ));
  dome.scale.y = 0.62;
  topBun.add(dome);
  const seedMat = lambert(0xf7ecd2);
  const seedGeo = new THREE.SphereGeometry(0.035, 5, 4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.4;
    const r = 0.18 + (i % 3) * 0.11;
    const seed = new THREE.Mesh(seedGeo, seedMat);
    seed.position.set(Math.cos(a) * r, Math.sqrt(Math.max(0, 0.52 * 0.52 - r * r)) * 0.62, Math.sin(a) * r);
    topBun.add(seed);
  }
  addEyes(topBun, 0.16, 0.44, 0.14);
  topBun.position.y = baseTop;
  g.add(topBun);

  return {
    group: g,
    topBun,
    baseTop,
    topAnchor: new THREE.Vector3(0, 0.34, 0),
    eyeAnchor: new THREE.Vector3(0, 0.16, 0.42),
  };
}

interface StackLayer {
  grp: THREE.Group;
  def: ToppingDef;
  off: THREE.Vector2; // horizontal sway offset relative to the layer below
  vel: THREE.Vector2;
  pop: number; // 0→1 scale-in when freshly collected
}

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
  mats: THREE.MeshLambertMaterial[];
}

const DEBRIS_LIFE = 1.4;

export class BurgerStack {
  private layers: StackLayer[] = [];
  private debris: Debris[] = [];
  private prevVel = new THREE.Vector3();

  constructor(
    private parts: BurgerParts,
    private root: THREE.Group, // rig root — debris reparents to its parent (the scene)
    private onHeight: (h: number) => void,
  ) {}

  /** Stack height in layers, counting the base patty. */
  get count(): number {
    return this.layers.length + 1;
  }

  addRandomTopping(): ToppingDef {
    const def = TOPPINGS[Math.floor(Math.random() * TOPPINGS.length)];
    const grp = def.build();
    grp.scale.setScalar(0.01); // pops in via `pop`
    this.parts.group.add(grp);
    this.layers.push({ grp, def, off: new THREE.Vector2(), vel: new THREE.Vector2(), pop: 0 });
    this.reportHeight();
    return def;
  }

  /** WIPEOUT: every collected layer detaches and flies; back to bun+patty. */
  wipeout(): number {
    const n = this.layers.length;
    if (n === 0) return 0;
    const parent = this.root.parent;
    for (const l of this.layers) {
      if (!parent) {
        l.grp.removeFromParent();
        continue;
      }
      const pos = l.grp.getWorldPosition(new THREE.Vector3());
      const quat = l.grp.getWorldQuaternion(new THREE.Quaternion());
      parent.add(l.grp);
      l.grp.position.copy(pos);
      l.grp.quaternion.copy(quat);
      l.grp.scale.setScalar(1);
      const mats: THREE.MeshLambertMaterial[] = [];
      l.grp.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
          o.material.transparent = true;
          mats.push(o.material);
        }
      });
      const a = Math.random() * Math.PI * 2;
      this.debris.push({
        obj: l.grp,
        vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 5 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 4)),
        spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        t: 0,
        mats,
      });
    }
    this.layers = [];
    this.reportHeight();
    return n;
  }

  /**
   * Per-frame sim. Each layer springs toward the layer below and gets
   * shoved by the rider's acceleration (rotated into local space), so the
   * tower lags, whips and settles like it's actually stacked up there.
   */
  update(dt: number, worldVel: THREE.Vector3, yaw: number): void {
    if (dt <= 0) return;

    // Rider acceleration → local space shove (skip teleport spikes).
    let ax = (worldVel.x - this.prevVel.x) / dt;
    let az = (worldVel.z - this.prevVel.z) / dt;
    this.prevVel.copy(worldVel);
    const amag = Math.hypot(ax, az);
    if (amag > 80) { ax = 0; az = 0; } // respawn/teleport, not skating
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const lx = ax * cos - az * sin;
    const lz = ax * sin + az * cos;

    // Chain sim, bottom → top.
    let belowX = 0, belowY = 0;
    let y = this.parts.baseTop;
    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i];
      l.pop = Math.min(1, l.pop + dt * 6);
      const K = 55, D = 9, R = 0.012 * (1 + i * 0.35);
      l.vel.x += ((belowX - l.off.x) * K - l.vel.x * D) * dt - lx * R;
      l.vel.y += ((belowY - l.off.y) * K - l.vel.y * D) * dt - lz * R;
      l.off.x += l.vel.x * dt;
      l.off.y += l.vel.y * dt;
      const maxLean = Math.min(0.5, 0.05 + i * 0.04);
      if (l.off.length() > maxLean) l.off.setLength(maxLean);

      l.grp.position.set(l.off.x, y, l.off.y);
      l.grp.rotation.z = -(l.off.x - belowX) * 1.1;
      l.grp.rotation.x = (l.off.y - belowY) * 1.1;
      l.grp.scale.setScalar(0.2 + 0.8 * l.pop);

      belowX = l.off.x;
      belowY = l.off.y;
      y += l.def.h;
    }

    // Top bun rides the top of the chain (smoothed so it plops, not snaps).
    const tb = this.parts.topBun;
    tb.position.y = THREE.MathUtils.damp(tb.position.y, y, 12, dt);
    tb.position.x = belowX;
    tb.position.z = belowY;
    tb.rotation.z = -belowX * 0.7;
    tb.rotation.x = belowY * 0.7;

    // Flying wipeout debris.
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.vel.y -= 22 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      const fade = THREE.MathUtils.clamp((DEBRIS_LIFE - d.t) / 0.4, 0, 1);
      for (const m of d.mats) m.opacity = fade;
      if (d.t >= DEBRIS_LIFE) {
        this.disposeDebris(d);
        this.debris.splice(i, 1);
      }
    }
  }

  private disposeDebris(d: Debris): void {
    d.obj.removeFromParent();
    d.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /** Called from rig.dispose — clears any debris still airborne. */
  disposeAll(): void {
    for (const d of this.debris) this.disposeDebris(d);
    this.debris = [];
  }

  private reportHeight(): void {
    let y = this.parts.baseTop;
    for (const l of this.layers) y += l.def.h;
    this.onHeight(0.16 + y + 0.34); // deck offset + stack + top-bun dome
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/** Hidden for the Skate Burger era — the classic crew, kept for later. */
export function buildLegacyBody(state: CustomizationState): BodyBuild {
  switch (state.bodyType) {
    case 'tube':
      return buildTubeBody(state.bodyColor);
    case 'ducky':
      return buildDuckyBody(state.bodyColor);
    case 'finger':
      return buildFingerBody(state.bodyColor);
    case 'teddy':
      return buildTeddyBody(state.bodyColor);
    case 'goat':
      return buildGoatBody(state.bodyColor);
    default:
      return buildConeBody(state.bodyColor);
  }
}

export function buildCharacter(state: CustomizationState): CharacterRig {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  const { group: board, wheels } = buildBoard(state.board, state.wheelColor);
  tilt.add(board);

  // Body pivot sits on the deck so wobble rotates around the base —
  // heavy bottom, light floppy top.
  const body = new THREE.Group();
  body.position.y = 0.16;
  tilt.add(body);

  // SKATE BURGER era: every skater is the Burger (see buildLegacyBody for
  // the hidden cone crew). Hats/sunglasses ride the top bun up the stack.
  const burger = buildBurgerBody();
  body.add(burger.group);

  const spinners: THREE.Object3D[] = [];
  // Hat + glasses are independent slots now, both riding the top bun.
  const hat = buildAccessory(state.accessory, burger.topAnchor, burger.eyeAnchor, spinners);
  if (hat) burger.topBun.add(hat);
  const specs = buildAccessory(state.glasses, burger.topAnchor, burger.eyeAnchor, spinners);
  if (specs) burger.topBun.add(specs);

  const trailAnchor = new THREE.Object3D();
  trailAnchor.position.set(0, 0.12, -0.65);
  tilt.add(trailAnchor);

  const rig: CharacterRig = {
    root,
    tilt,
    body,
    board,
    wheels,
    spinners,
    trailAnchor,
    height: 0.85,
    dispose() {
      rig.stack?.disposeAll();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshLambertMaterial && m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
      root.removeFromParent();
    },
  };
  rig.stack = new BurgerStack(burger, root, (h) => (rig.height = h));
  return rig;
}
