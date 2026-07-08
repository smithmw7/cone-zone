/**
 * DebugView
 * ---------
 * Developer overlay toggled with the V key during play. One toggle switches
 * between the normal render and "vertex" mode:
 *
 *   - every scene material flips to wireframe (shows the raw triangles)
 *   - green wireframe boxes show the Rapier colliders exactly where the
 *     physics sees them (the visual meshes and colliders are built
 *     separately, so drift between them shows up instantly here)
 *   - magenta lines show the analytic grind-rail segments
 *   - a yellow capsule tracks the player's kinematic physics body
 *
 * Debug geometry renders with depthTest off so colliders are visible even
 * when buried inside solid ramps.
 */
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import type { RailSegment } from './SkateParkScene';

export class DebugView {
  enabled = false;

  private group = new THREE.Group();
  private capsule: THREE.Mesh;
  private normalBackground: THREE.Color | THREE.Texture | null = null;
  private normalFog: THREE.Fog | null = null;

  constructor(private scene: THREE.Scene, physics: PhysicsWorld, rails: RailSegment[]) {
    // Collider shapes: green = solid, orange = bonk-only (rails/coping).
    const solidMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const bonkMat = new THREE.MeshBasicMaterial({
      color: 0xff9530,
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    for (const s of physics.debugShapes) {
      const material = s.bonkOnly ? bonkMat : solidMat;
      let mesh: THREE.Mesh;
      if (s.kind === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(s.size.x, s.size.y, s.size.z), material);
        mesh.position.copy(s.position);
        if (s.quaternion) mesh.quaternion.copy(s.quaternion);
      } else if (s.kind === 'cylinder') {
        const dir = s.b.clone().sub(s.a);
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.radius, s.radius, dir.length(), 8), material);
        mesh.position.copy(s.a).add(s.b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      } else {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(s.vertices, 3));
        geo.setIndex(new THREE.BufferAttribute(s.indices, 1));
        mesh = new THREE.Mesh(geo, material);
        mesh.position.copy(s.position);
        mesh.quaternion.copy(s.quaternion);
      }
      mesh.renderOrder = 999;
      this.group.add(mesh);
    }

    // Grind rail segments.
    const railMat = new THREE.LineBasicMaterial({ color: 0xff40ff, depthTest: false });
    const lift = new THREE.Vector3(0, 0.06, 0);
    for (const r of rails) {
      const geo = new THREE.BufferGeometry().setFromPoints([r.a.clone().add(lift), r.b.clone().add(lift)]);
      const line = new THREE.Line(geo, railMat);
      line.renderOrder = 999;
      this.group.add(line);
    }

    // Player physics capsule proxy (position updated from GameApp).
    this.capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, wireframe: true, depthTest: false }),
    );
    this.capsule.renderOrder = 999;
    this.group.add(this.capsule);

    this.group.visible = false;
    scene.add(this.group);
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.group.visible = on;
    if (on) {
      // Capture the CURRENT sky (presets change per run) so we restore it.
      this.normalBackground = this.scene.background;
      this.normalFog = this.scene.fog as THREE.Fog | null;
      this.scene.background = new THREE.Color(0x14181f);
      this.scene.fog = null;
    } else {
      this.scene.background = this.normalBackground;
      this.scene.fog = this.normalFog;
    }
    // The sky dome (and anything else tagged) hides in debug mode.
    this.scene.traverse((o) => {
      if (o.userData.hideInDebug) o.visible = !on;
    });
    this.applyWireframe();
  }

  /**
   * Flip every scene material's wireframe flag to match the current mode.
   * Called on toggle AND after the player rig is rebuilt (new materials).
   */
  applyWireframe(): void {
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || this.isDebugChild(obj) || obj.userData.noWireframe) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if ('wireframe' in m) (m as THREE.MeshLambertMaterial).wireframe = this.enabled;
      }
    });
  }

  /** Keep the capsule glued to the player's kinematic body. */
  updatePlayer(pos: THREE.Vector3): void {
    this.capsule.position.set(pos.x, pos.y + 0.8, pos.z);
  }

  private isDebugChild(obj: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = obj;
    while (p) {
      if (p === this.group) return true;
      p = p.parent;
    }
    return false;
  }
}
