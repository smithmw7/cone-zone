/**
 * SkySystem
 * ---------
 * Gradient sky dome + time-of-day presets.
 *
 * Technique: the classic three.js gradient sky from the official
 * `webgl_lights_hemisphere` example — a big inverted sphere with a small
 * shader that blends zenith → mid → horizon colors by view height. It's the
 * standard lightweight alternative to `examples/jsm/objects/Sky.js` (full
 * atmospheric scattering), and fits the PS2 low-poly art style much better.
 *
 * Each preset also drives the scene fog, sun + hemisphere light colors, and
 * the intensity of the perimeter lamp posts (bright at dusk, off at noon),
 * so picking a random preset per run restyles the whole park.
 */
import * as THREE from 'three';

export interface SkyPreset {
  name: string;
  top: number;      // zenith
  mid: number;      // sky band
  horizon: number;  // horizon / fog color
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  lampIntensity: number; // perimeter lamp posts
}

export const SKY_PRESETS: SkyPreset[] = [
  {
    name: 'Noon', top: 0x2f7fd9, mid: 0x8ec9ff, horizon: 0xdcedff,
    sunColor: 0xfff2d8, sunIntensity: 1.35,
    hemiSky: 0xcfe8ff, hemiGround: 0x9a8a68, hemiIntensity: 0.95, lampIntensity: 0,
  },
  {
    name: 'Sunset', top: 0x35407c, mid: 0xff8a5c, horizon: 0xffd9a0,
    sunColor: 0xffb36b, sunIntensity: 1.05,
    hemiSky: 0xffc9a0, hemiGround: 0x8a7460, hemiIntensity: 0.75, lampIntensity: 14,
  },
  {
    name: 'Dawn', top: 0x6a5bb8, mid: 0xff9ec7, horizon: 0xffe3c2,
    sunColor: 0xffd0a8, sunIntensity: 1.1,
    hemiSky: 0xf5d5e8, hemiGround: 0x8a7a68, hemiIntensity: 0.8, lampIntensity: 8,
  },
  {
    name: 'Dusk', top: 0x1a2450, mid: 0x4a5aa0, horizon: 0xf2a25c,
    sunColor: 0xa8bcff, sunIntensity: 0.75,
    hemiSky: 0x9aacdf, hemiGround: 0x655a48, hemiIntensity: 0.75, lampIntensity: 30,
  },
  {
    name: 'Minty', top: 0x2e86a8, mid: 0x9fe0d5, horizon: 0xfff2c9,
    sunColor: 0xfff8e0, sunIntensity: 1.25,
    hemiSky: 0xd8f2ea, hemiGround: 0x8a9a68, hemiIntensity: 0.9, lampIntensity: 0,
  },
];

interface Lamp {
  light: THREE.PointLight;
  bulbMat: THREE.MeshLambertMaterial;
}

export class SkySystem {
  preset: SkyPreset = SKY_PRESETS[0];

  private uniforms = {
    topColor: { value: new THREE.Color() },
    midColor: { value: new THREE.Color() },
    bottomColor: { value: new THREE.Color() },
  };
  private lamps: Lamp[] = [];

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
  ) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vWorldPosition;
          void main() {
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y;
            vec3 c = h >= 0.0
              ? mix(midColor, topColor, pow(h, 0.75))
              : mix(midColor, bottomColor, pow(-h, 0.5));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    );
    // Debug view should neither wireframe nor show the dome.
    dome.userData.noWireframe = true;
    dome.userData.hideInDebug = true;
    scene.add(dome);

    this.apply(SKY_PRESETS[0]);
  }

  /** Lamp posts register their light + bulb material for preset dimming. */
  registerLamp(light: THREE.PointLight, bulbMat: THREE.MeshLambertMaterial): void {
    this.lamps.push({ light, bulbMat });
    this.applyLamp(this.lamps[this.lamps.length - 1]);
  }

  apply(preset: SkyPreset): void {
    this.preset = preset;
    this.uniforms.topColor.value.setHex(preset.top);
    this.uniforms.midColor.value.setHex(preset.mid);
    this.uniforms.bottomColor.value.setHex(preset.horizon);

    this.scene.background = new THREE.Color(preset.horizon);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) fog.color.setHex(preset.horizon);

    this.sun.color.setHex(preset.sunColor);
    this.sun.intensity = preset.sunIntensity;
    this.hemi.color.setHex(preset.hemiSky);
    this.hemi.groundColor.setHex(preset.hemiGround);
    this.hemi.intensity = preset.hemiIntensity;

    for (const lamp of this.lamps) this.applyLamp(lamp);
  }

  applyRandom(): SkyPreset {
    const pick = SKY_PRESETS[Math.floor(Math.random() * SKY_PRESETS.length)];
    this.apply(pick);
    return pick;
  }

  private applyLamp(lamp: Lamp): void {
    const on = this.preset.lampIntensity > 0;
    lamp.light.intensity = this.preset.lampIntensity;
    lamp.bulbMat.emissiveIntensity = on ? 1 : 0.05;
  }
}
