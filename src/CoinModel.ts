import * as THREE from 'three';

export interface CoinModelOptions {
  radius?: number;
  depth?: number;
  glow?: boolean;
}

function goldMaterial(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: 0x9b4d00,
    emissiveIntensity: 0.22,
    metalness: 0.55,
    roughness,
  });
}

function makeStamp(radius: number, z: number, material: THREE.Material): THREE.Mesh {
  const points = [
    new THREE.Vector3(radius * 0.25, radius * 0.35, 0),
    new THREE.Vector3(radius * 0.04, radius * 0.46, 0),
    new THREE.Vector3(-radius * 0.25, radius * 0.34, 0),
    new THREE.Vector3(-radius * 0.27, radius * 0.1, 0),
    new THREE.Vector3(radius * 0.18, -radius * 0.04, 0),
    new THREE.Vector3(radius * 0.26, -radius * 0.27, 0),
    new THREE.Vector3(-radius * 0.02, -radius * 0.43, 0),
    new THREE.Vector3(-radius * 0.28, -radius * 0.32, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const stamp = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, radius * 0.055, 7, false),
    material,
  );
  stamp.position.z = z;
  stamp.castShadow = true;
  return stamp;
}

/** A simple warm-gold collectible shared visually with the HUD flyout coin. */
export function createBurgerCrownCoin(options: CoinModelOptions = {}): THREE.Group {
  const radius = options.radius ?? 0.45;
  const depth = options.depth ?? 0.14;
  const group = new THREE.Group();
  group.name = 'collectible-coin';

  const bodyMaterial = goldMaterial(0xffb72c, 0.3);
  const rimMaterial = goldMaterial(0xffdc68, 0.22);
  const stampMaterial = goldMaterial(0xb86a0a, 0.36);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, depth, 48, 1, false),
    bodyMaterial,
  );
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  for (const side of [-1, 1]) {
    const z = side * (depth * 0.51);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.78, radius * 0.055, 8, 36),
      rimMaterial,
    );
    rim.position.z = z;
    rim.castShadow = true;
    group.add(rim);

    const stamp = makeStamp(radius, z + side * radius * 0.018, stampMaterial);
    if (side < 0) stamp.rotation.y = Math.PI;
    group.add(stamp);
  }

  if (options.glow ?? true) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.2, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc43d, transparent: true, opacity: 0.11, depthWrite: false }),
    );
    glow.name = 'coin-glow';
    group.add(glow);
  }

  return group;
}
