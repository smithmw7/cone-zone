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
  {
    name: 'Alpine', top: 0x2f6fc4, mid: 0x9cccf0, horizon: 0xeef6fc,
    sunColor: 0xffffff, sunIntensity: 1.45,
    hemiSky: 0xe8f4ff, hemiGround: 0xb8c4d0, hemiIntensity: 1.0, lampIntensity: 0,
  },
];

interface Lamp {
  light: THREE.PointLight;
  bulbMat: THREE.MeshLambertMaterial;
}

const SKY_RADIUS = 400;

export class SkySystem {
  preset: SkyPreset = SKY_PRESETS[0];

  private uniforms = {
    topColor: { value: new THREE.Color() },
    midColor: { value: new THREE.Color() },
    bottomColor: { value: new THREE.Color() },
  };
  private lamps: Lamp[] = [];
  private dome!: THREE.Mesh;
  private sunCore!: THREE.MeshBasicMaterial;
  private sunGlow!: THREE.MeshBasicMaterial;

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
  ) {
    // Local-space gradient (view direction), so the dome can ride the camera
    // and still read as an infinitely distant sky — no parallax as you skate.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          varying vec3 vDir;
          void main() {
            float h = normalize(vDir).y;
            vec3 c = h >= 0.0
              ? mix(midColor, topColor, pow(h, 0.75))
              : mix(midColor, bottomColor, pow(-h, 0.5));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    );
    dome.renderOrder = -2;
    // Debug view should neither wireframe nor show the dome.
    dome.userData.noWireframe = true;
    dome.userData.hideInDebug = true;
    scene.add(dome);
    this.dome = dome;

    // Distant sun / moon: a small round unlit sphere fixed on the sky dome,
    // set in the direction the sunlight comes from. Because it rides the dome
    // (which follows the camera, see update()), it holds one spot in the sky.
    const dir = sun.position.clone().normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.8, 0.3).normalize();
    this.sunCore = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), this.sunCore);
    disc.position.copy(dir).multiplyScalar(SKY_RADIUS * 0.88);
    disc.renderOrder = -1;
    this.sunGlow = new THREE.MeshBasicMaterial({
      color: 0xffffff, fog: false, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(20, 20, 14), this.sunGlow);
    glow.position.copy(disc.position);
    glow.renderOrder = -1;
    for (const o of [disc, glow]) {
      o.userData.noWireframe = true;
      o.userData.hideInDebug = true;
      dome.add(o); // children of the dome → ride the camera with it
    }

    this.apply(SKY_PRESETS[0]);
  }

  /** Lock the sky to the camera each frame so it never parallaxes. */
  update(cameraPos: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
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

    // Sun/moon disc: a bright tinted core + soft additive halo. Darker,
    // bluer presets read as a moon; warm bright ones as the sun.
    const tint = new THREE.Color(preset.sunColor);
    this.sunCore.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.55);
    this.sunGlow.color.copy(tint);
    this.sunGlow.opacity = 0.22 + preset.sunIntensity * 0.12;

    for (const lamp of this.lamps) this.applyLamp(lamp);
  }

  /** Random preset, optionally restricted to a level's allowed names. */
  applyRandom(filterNames?: string[]): SkyPreset {
    const pool = filterNames?.length
      ? SKY_PRESETS.filter((p) => filterNames.includes(p.name))
      : SKY_PRESETS;
    const pick = (pool.length ? pool : SKY_PRESETS)[Math.floor(Math.random() * (pool.length || SKY_PRESETS.length))];
    this.apply(pick);
    return pick;
  }

  private applyLamp(lamp: Lamp): void {
    const on = this.preset.lampIntensity > 0;
    lamp.light.intensity = this.preset.lampIntensity;
    lamp.bulbMat.emissiveIntensity = on ? 1 : 0.05;
  }
}
