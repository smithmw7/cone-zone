/**
 * WaterSystem
 * -----------
 * Stylized low-poly water: a big plane with animated sine-wave displacement,
 * a two-tone depth gradient, white foam on the crests, and a soft fade into
 * the scene fog at the horizon. Flat, bright and cartoony to match the PS2
 * art — not a mirror. One plane per level (an ocean around the island), plus
 * optional interior channels (aqueducts) reuse the same material.
 */
import * as THREE from 'three';

export interface WaterConfig {
  shallow: number; // crest / near colour
  deep: number;    // trough / far colour
  level: number;   // world Y of the surface
  extent: number;  // half-size of the plane
  fog: number;     // horizon fog colour to fade into
}

const VERT = /* glsl */ `
  uniform float uTime;
  varying float vWave;
  varying float vDist;
  void main() {
    vec3 p = position;
    float w =
        sin(p.x * 0.05 + uTime * 1.1) * 0.38
      + sin(p.z * 0.07 + uTime * 1.5) * 0.28
      + sin((p.x + p.z) * 0.035 + uTime * 0.8) * 0.34;
    p.y += w;
    vWave = w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uFog;
  varying float vWave;
  varying float vDist;
  void main() {
    float t = smoothstep(-0.7, 0.8, vWave);
    vec3 col = mix(uDeep, uShallow, t);
    float foam = smoothstep(0.62, 0.95, vWave);
    col = mix(col, uFoam, foam * 0.75);
    // Fade into the horizon fog so the plane's far edge is invisible.
    float f = smoothstep(120.0, 320.0, vDist);
    col = mix(col, uFog, f);
    gl_FragColor = vec4(col, 0.94);
  }
`;

export class WaterSystem {
  readonly mesh: THREE.Mesh;
  private uniforms: {
    uTime: { value: number };
    uShallow: { value: THREE.Color };
    uDeep: { value: THREE.Color };
    uFoam: { value: THREE.Color };
    uFog: { value: THREE.Color };
  };

  constructor(scene: THREE.Scene, cfg: WaterConfig) {
    const geo = new THREE.PlaneGeometry(cfg.extent * 2, cfg.extent * 2, 60, 60);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(cfg.shallow) },
      uDeep: { value: new THREE.Color(cfg.deep) },
      uFoam: { value: new THREE.Color(0xffffff) },
      uFog: { value: new THREE.Color(cfg.fog) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = cfg.level;
    this.mesh.renderOrder = -1; // draws after the sky dome, before opaque park
    this.mesh.userData.noWireframe = true;
    this.mesh.userData.hideInDebug = true;
    scene.add(this.mesh);
  }

  /** Recolour the fog fade when the sky preset changes. */
  setFog(color: number): void {
    this.uniforms.uFog.value.setHex(color);
  }

  update(elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
  }
}
