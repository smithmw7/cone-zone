/**
 * PhysicsWorld
 * ------------
 * Thin wrapper around Rapier. The park registers static colliders and the
 * player controller queries the world with raycasts:
 *
 *   - groundRay: downward multi-hit ray that finds the best ridable surface
 *   - wallRay:   horizontal ray used for "bonk" collision — bouncing off
 *                walls, rails, ledge sides and anything too steep to ride
 *
 * Collider kinds:
 *   - boxes      ground, walls, decks, ledges, stairs, pads
 *   - trimeshes  ramps/curves — built from the SAME BufferGeometry as the
 *                visual mesh, so physics exactly matches what you see
 *   - cylinders  rails/coping/posts — flagged "bonk only": the ground ray
 *                ignores them (grinding is analytic) but wallRay hits them
 *
 * We deliberately do NOT simulate the skateboard — the controller is a
 * kinematic arcade mover. A kinematic capsule mirrors the player so future
 * dynamic props can react to it.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface GroundHit {
  y: number;
  normal: THREE.Vector3;
}

export interface WallHit {
  dist: number;
  normal: THREE.Vector3;
}

/** Records of every collider, consumed by DebugView (V key overlay). */
export type DebugShape =
  | { kind: 'box'; position: THREE.Vector3; size: THREE.Vector3; quaternion: THREE.Quaternion | null; bonkOnly: boolean }
  | { kind: 'cylinder'; a: THREE.Vector3; b: THREE.Vector3; radius: number; bonkOnly: boolean }
  | { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array; position: THREE.Vector3; quaternion: THREE.Quaternion; bonkOnly: boolean };

export class PhysicsWorld {
  world!: RAPIER.World;
  readonly debugShapes: DebugShape[] = [];
  private bonkOnlyHandles = new Set<number>();
  private playerBody: RAPIER.RigidBody | null = null;
  private playerCollider: RAPIER.Collider | null = null;

  /** Rapier ships as WASM; must init before constructing the world. */
  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  private fixedBody(position: THREE.Vector3): RAPIER.RigidBody {
    return this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
  }

  private track(collider: RAPIER.Collider, bonkOnly: boolean): void {
    if (bonkOnly) this.bonkOnlyHandles.add(collider.handle);
  }

  /** Static box collider. `size` is full extents. */
  addBox(position: THREE.Vector3, size: THREE.Vector3, quaternion?: THREE.Quaternion, bonkOnly = false): void {
    const body = this.fixedBody(position);
    const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    if (quaternion) desc.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
    this.track(this.world.createCollider(desc, body), bonkOnly);
    this.debugShapes.push({
      kind: 'box',
      position: position.clone(),
      size: size.clone(),
      quaternion: quaternion?.clone() ?? null,
      bonkOnly,
    });
  }

  /** Cylinder between two points — rails, coping, posts. Bonk-only by default. */
  addCylinder(a: THREE.Vector3, b: THREE.Vector3, radius: number, bonkOnly = true): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const body = this.fixedBody(mid);
    const desc = RAPIER.ColliderDesc.cylinder(length / 2, radius).setRotation({
      x: quat.x, y: quat.y, z: quat.z, w: quat.w,
    });
    this.track(this.world.createCollider(desc, body), bonkOnly);
    this.debugShapes.push({ kind: 'cylinder', a: a.clone(), b: b.clone(), radius, bonkOnly });
  }

  /**
   * Trimesh collider built directly from a render geometry, so the physics
   * surface is EXACTLY the visible surface (ramps, curves, pyramids).
   */
  addTrimesh(geometry: THREE.BufferGeometry, position: THREE.Vector3, quaternion: THREE.Quaternion, bonkOnly = false): void {
    const posAttr = geometry.attributes.position;
    const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
    let indices: Uint32Array;
    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array as ArrayLike<number>);
    } else {
      indices = new Uint32Array(posAttr.count);
      for (let i = 0; i < posAttr.count; i++) indices[i] = i;
    }
    const body = this.fixedBody(position);
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setRotation({
      x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w,
    });
    this.track(this.world.createCollider(desc, body), bonkOnly);
    this.debugShapes.push({ kind: 'trimesh', vertices, indices, position: position.clone(), quaternion: quaternion.clone(), bonkOnly });
  }

  /** Kinematic capsule so the player exists in the physics world. */
  createPlayerBody(position: THREE.Vector3): void {
    this.playerBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + 0.8, position.z),
    );
    this.playerCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.4, 0.35),
      this.playerBody,
    );
  }

  movePlayerBody(position: THREE.Vector3): void {
    this.playerBody?.setNextKinematicTranslation({ x: position.x, y: position.y + 0.8, z: position.z });
  }

  private rayToi(hit: unknown): number {
    // Rapier renamed `toi` → `timeOfImpact` across versions; accept both.
    const h = hit as { timeOfImpact?: number; toi?: number };
    return h.timeOfImpact ?? h.toi ?? 0;
  }

  /**
   * Find the best ground under `pos`: cast a ray from above straight down,
   * collect ALL hits, and keep the highest surface that isn't too far above
   * the player (so the tall face of a ramp doesn't teleport us on top).
   * Bonk-only colliders (rails etc.) are ignored — grinding is analytic.
   */
  groundRay(pos: THREE.Vector3, maxStepUp = 0.5): GroundHit | null {
    const rayUp = 3;
    const ray = new RAPIER.Ray({ x: pos.x, y: pos.y + rayUp, z: pos.z }, { x: 0, y: -1, z: 0 });
    let best: GroundHit | null = null;

    this.world.intersectionsWithRay(ray, rayUp + 8, false, (hit) => {
      if (this.playerCollider && hit.collider === this.playerCollider) return true;
      if (this.bonkOnlyHandles.has(hit.collider.handle)) return true;
      const hitY = pos.y + rayUp - this.rayToi(hit);
      if (hitY <= pos.y + maxStepUp) {
        if (!best || hitY > best.y) {
          const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
          if (n.y < 0) n.negate();
          best = { y: hitY, normal: n };
        }
      }
      return true; // keep collecting hits
    });

    return best;
  }

  /**
   * Closest obstruction along a (horizontal) direction — the "bonk" ray.
   * Includes bonk-only colliders. The returned normal is flipped to oppose
   * the ray so trimesh face orientation never matters.
   */
  wallRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, includeBonkOnly = true): WallHit | null {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
    );
    let best: WallHit | null = null;
    this.world.intersectionsWithRay(ray, maxDist, true, (hit) => {
      if (this.playerCollider && hit.collider === this.playerCollider) return true;
      if (!includeBonkOnly && this.bonkOnlyHandles.has(hit.collider.handle)) return true;
      const dist = this.rayToi(hit);
      if (!best || dist < best.dist) {
        const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
        if (n.dot(dir) > 0) n.negate();
        best = { dist, normal: n };
      }
      return true;
    });
    return best;
  }

  /**
   * Anti-embed probe: nothing in the park legitimately hangs overhead, so a
   * solid surface straight above the player means we're INSIDE something
   * (e.g. tunneled into a ramp). Returns the surface height to pop up to.
   * Bonk-only colliders are ignored (riding under a high rail is fine).
   */
  ceilingRay(pos: THREE.Vector3, maxDist = 6): number | null {
    const start = 0.15;
    const ray = new RAPIER.Ray({ x: pos.x, y: pos.y + start, z: pos.z }, { x: 0, y: 1, z: 0 });
    let lowest: number | null = null;
    this.world.intersectionsWithRay(ray, maxDist, true, (hit) => {
      if (this.playerCollider && hit.collider === this.playerCollider) return true;
      if (this.bonkOnlyHandles.has(hit.collider.handle)) return true;
      const y = pos.y + start + this.rayToi(hit);
      if (lowest === null || y < lowest) lowest = y;
      return true;
    });
    return lowest;
  }

  step(dt: number): void {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
