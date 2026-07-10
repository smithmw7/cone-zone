import * as THREE from 'three';

const GOLD = 0xffc326;
const GOLD_LIGHT = 0xfff06a;
const GOLD_DARK = 0xb76a08;
const INK = 0x4a2b05;
const CHEESE = 0xffdf3a;

export interface CoinModelOptions {
  radius?: number;
  depth?: number;
  glow?: boolean;
}

function mat(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true });
}

function addPuck(
  parent: THREE.Group,
  radius: number,
  depth: number,
  material: THREE.Material,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 52), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = z;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBar(
  parent: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  rot = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rot;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addSeed(parent: THREE.Group, x: number, y: number, z: number, material: THREE.Material): void {
  const seed = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 5), material);
  seed.scale.set(1, 0.62, 0.18);
  seed.position.set(x, y, z);
  seed.castShadow = true;
  parent.add(seed);
}

function addBurgerSide(parent: THREE.Group, z: number, scale: number): void {
  const bun = mat(0xffb71b, 0x7a3f00, 0.28);
  const outline = mat(INK);
  const patty = mat(0x7a3c16);
  const cheese = mat(CHEESE, 0x5d3600, 0.14);
  const seed = mat(0xfff2a3, 0x5d3600, 0.18);
  const d = 0.055 * scale;

  addPuck(parent, 0.27 * scale, d, outline, z);
  const top = addPuck(parent, 0.25 * scale, d, bun, z + 0.008);
  top.scale.z = 0.54;
  top.position.y = 0.12 * scale;

  addBar(parent, 0.54 * scale, 0.065 * scale, d, 0, 0.015 * scale, z + 0.018, outline);
  addBar(parent, 0.48 * scale, 0.055 * scale, d, 0, 0.02 * scale, z + 0.028, cheese);
  addBar(parent, 0.48 * scale, 0.09 * scale, d, 0, -0.08 * scale, z + 0.02, outline);
  addBar(parent, 0.43 * scale, 0.07 * scale, d, 0, -0.08 * scale, z + 0.03, patty);

  addPuck(parent, 0.25 * scale, d, outline, z + 0.004).scale.set(1, 1, 0.32);
  const bottom = addPuck(parent, 0.23 * scale, d, bun, z + 0.026);
  bottom.scale.set(1, 1, 0.26);
  bottom.position.y = -0.19 * scale;

  const seeds: [number, number][] = [
    [-0.12, 0.19], [-0.04, 0.23], [0.06, 0.22], [0.14, 0.17],
    [-0.17, 0.11], [-0.06, 0.12], [0.05, 0.13], [0.16, 0.09],
  ];
  for (const [x, y] of seeds) addSeed(parent, x * scale, y * scale, z + 0.065, seed);
}

function addCrownSide(parent: THREE.Group, z: number, scale: number): void {
  const crown = mat(CHEESE, 0x7a4f00, 0.24);
  const outline = mat(INK);
  const d = 0.05 * scale;
  addBar(parent, 0.46 * scale, 0.09 * scale, d, 0, -0.19 * scale, z + 0.012, outline);
  addBar(parent, 0.39 * scale, 0.055 * scale, d, 0, -0.19 * scale, z + 0.03, crown);

  addBar(parent, 0.11 * scale, 0.34 * scale, d, -0.17 * scale, -0.02 * scale, z + 0.018, outline, -0.46);
  addBar(parent, 0.10 * scale, 0.46 * scale, d, 0, 0.02 * scale, z + 0.018, outline);
  addBar(parent, 0.11 * scale, 0.34 * scale, d, 0.17 * scale, -0.02 * scale, z + 0.018, outline, 0.46);
  addBar(parent, 0.07 * scale, 0.29 * scale, d, -0.17 * scale, -0.02 * scale, z + 0.04, crown, -0.46);
  addBar(parent, 0.07 * scale, 0.38 * scale, d, 0, 0.02 * scale, z + 0.04, crown);
  addBar(parent, 0.07 * scale, 0.29 * scale, d, 0.17 * scale, -0.02 * scale, z + 0.04, crown, 0.46);

  for (const [x, y] of [[-0.26, 0.13], [0, 0.28], [0.26, 0.13]] as [number, number][]) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.055 * scale, 12, 8), crown);
    orb.scale.z = 0.38;
    orb.position.set(x * scale, y * scale, z + 0.066);
    orb.castShadow = true;
    parent.add(orb);
  }
}

export function createBurgerCrownCoin(options: CoinModelOptions = {}): THREE.Group {
  const radius = options.radius ?? 0.45;
  const depth = options.depth ?? 0.14;
  const group = new THREE.Group();
  group.name = 'burger-crown-coin';

  const bodyMat = mat(GOLD, 0xb66a00, 0.45);
  const rimMat = mat(GOLD_LIGHT, 0xffb000, 0.32);
  const grooveMat = mat(GOLD_DARK, 0x4a2500, 0.12);

  addPuck(group, radius, depth, bodyMat, 0);
  addPuck(group, radius * 1.03, depth * 0.26, rimMat, depth * 0.44);
  addPuck(group, radius * 1.03, depth * 0.26, rimMat, -depth * 0.44);
  addPuck(group, radius * 0.83, depth * 0.08, grooveMat, depth * 0.58);
  addPuck(group, radius * 0.83, depth * 0.08, grooveMat, -depth * 0.58);

  const reliefScale = radius / 0.45;
  addBurgerSide(group, depth * 0.66, reliefScale);
  const crownBack = new THREE.Group();
  addCrownSide(crownBack, depth * 0.66, reliefScale);
  crownBack.rotation.y = Math.PI;
  group.add(crownBack);

  if (options.glow ?? true) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.25, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd447, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    glow.name = 'coin-glow';
    group.add(glow);
  }

  return group;
}
