/**
 * TrailSystem
 * -----------
 * Cheap pooled particles for the customizable trail effect. A fixed pool
 * of ~64 tiny meshes gets recycled — no allocations during gameplay, which
 * keeps mobile browsers happy.
 *
 * Styles: sparkle (confetti octahedrons), smoke (growing grey puffs),
 * streak (stretched additive slivers, only at speed).
 */
import * as THREE from 'three';
import type { TrailId } from './CustomizationState';

const POOL_SIZE = 64;

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  growth: number;
  spin: number;
  alive: boolean;
}

const SPARKLE_COLORS = [0xffd21f, 0xff6bb8, 0x39d8e8, 0xa46bff, 0x3fce5a];

export class TrailSystem {
  private particles: Particle[] = [];
  private style: TrailId = 'none';
  private emitAccum = 0;
  private rainbowHue = 0;

  private sparkleGeo = new THREE.OctahedronGeometry(0.07);
  private smokeGeo = new THREE.SphereGeometry(0.1, 6, 5);
  private streakGeo = new THREE.BoxGeometry(0.05, 0.05, 0.85);

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(this.sparkleGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        growth: 0,
        spin: 0,
        alive: false,
      });
    }
  }

  setStyle(style: TrailId): void {
    this.style = style;
  }

  /** Call every frame from the game loop while playing. */
  emitFrom(worldPos: THREE.Vector3, speedNorm: number, grounded: boolean, dt: number): void {
    if (this.style === 'none') return;

    // Emission rate scales with speed; streaks only appear when moving fast.
    let rate = 0;
    if (this.style === 'sparkle' || this.style === 'rainbow') rate = 10 + speedNorm * 26;
    else if (this.style === 'smoke') rate = (grounded ? 8 : 3) + speedNorm * 16;
    else if (this.style === 'fire') rate = 14 + speedNorm * 30;
    else if (this.style === 'streak') rate = speedNorm > 0.55 ? 26 : 0;

    this.emitAccum += rate * dt;
    while (this.emitAccum >= 1) {
      this.emitAccum -= 1;
      this.spawn(worldPos, speedNorm);
    }
  }

  private spawn(pos: THREE.Vector3, speedNorm: number): void {
    const p = this.particles.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.scale.setScalar(1);
    p.mat.opacity = 1;

    if (this.style === 'sparkle' || this.style === 'rainbow') {
      p.mesh.geometry = this.sparkleGeo;
      if (this.style === 'rainbow') {
        // Hue cycles over time so the trail paints a moving rainbow.
        this.rainbowHue = (this.rainbowHue + 0.045) % 1;
        p.mat.color.setHSL(this.rainbowHue, 0.95, 0.6);
      } else {
        p.mat.color.setHex(SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]);
      }
      p.mat.blending = THREE.NormalBlending;
      p.vel.set((Math.random() - 0.5) * 2, 1 + Math.random() * 1.6, (Math.random() - 0.5) * 2);
      p.maxLife = p.life = 0.55 + Math.random() * 0.25;
      p.growth = -0.9;
      p.spin = (Math.random() - 0.5) * 10;
    } else if (this.style === 'fire') {
      p.mesh.geometry = this.smokeGeo;
      p.mat.color.setHex(Math.random() < 0.55 ? 0xff7a1a : Math.random() < 0.5 ? 0xffd21f : 0xff3b1a);
      p.mat.blending = THREE.AdditiveBlending;
      p.vel.set((Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8);
      p.maxLife = p.life = 0.45 + Math.random() * 0.2;
      p.growth = -0.5;
      p.spin = 0;
    } else if (this.style === 'smoke') {
      p.mesh.geometry = this.smokeGeo;
      p.mat.color.setHex(0xdedad0);
      p.mat.blending = THREE.NormalBlending;
      p.vel.set((Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
      p.maxLife = p.life = 0.8 + Math.random() * 0.3;
      p.growth = 2.2;
      p.spin = 0;
    } else {
      p.mesh.geometry = this.streakGeo;
      p.mat.color.setHex(Math.random() < 0.5 ? 0x9fe8ff : 0xffffff);
      p.mat.blending = THREE.AdditiveBlending;
      p.vel.set(0, 0, 0);
      p.maxLife = p.life = 0.22;
      p.growth = -1.2;
      p.spin = 0;
      p.mesh.scale.z = 0.7 + speedNorm;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }
      const frac = p.life / p.maxLife;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mat.opacity = frac;
      if (p.growth !== 0) {
        const s = Math.max(0.05, 1 + p.growth * (1 - frac));
        p.mesh.scale.setScalar(s);
      }
      if (p.spin !== 0) {
        p.mesh.rotation.x += p.spin * dt;
        p.mesh.rotation.y += p.spin * 0.7 * dt;
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      p.alive = false;
      p.mesh.visible = false;
    }
  }
}
