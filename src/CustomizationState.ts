/**
 * CustomizationState
 * ------------------
 * Single source of truth for everything the player picked on the
 * character-select and customization screens. The UI writes into it,
 * and anything that renders the character (preview + gameplay) rebuilds
 * from it via a change listener.
 */

export type BodyType =
  | 'burger'
  | 'cone'
  | 'cone-tall'
  | 'cone-wide'
  | 'tube'
  | 'ducky'
  | 'finger'
  | 'teddy'
  | 'goat';
export type AccessoryId =
  | 'none' | 'beanie' | 'chef' | 'cowboy' | 'party' | 'wizard' | 'tophat' | 'propeller' | 'crown' | 'halo';
export type GlassesId = 'none' | 'sunglasses' | 'round' | 'star' | 'visor' | 'threed';
export type BoardId = 'default' | 'checkerboard' | 'neon' | 'wood' | 'pizza' | 'galaxy' | 'gold';
export type TrailId = 'none' | 'sparkle' | 'smoke' | 'streak' | 'rainbow' | 'fire';

/** Arcade tuning knobs per body type. All handling numbers live here. */
export interface BodyStats {
  maxSpeed: number;   // top cruising speed (m/s)
  accel: number;      // how fast we reach it
  turnRate: number;   // yaw radians/sec at full steer
  jumpPower: number;  // ollie launch velocity
  bounce: number;     // 0..1 landing restitution (ducky!)
  wobble: number;     // multiplier on the silly body wobble
  height: number;     // rough body height, used by camera/anchors
}

export interface BodyTypeDef {
  id: BodyType;
  label: string;
  blurb: string;
  stats: BodyStats;
  /** 0..1 values purely for the stat bars in the select UI */
  display: { speed: number; turning: number; bounce: number };
}

export const BODY_TYPES: BodyTypeDef[] = [
  {
    id: 'burger',
    label: 'Skate Burger',
    blurb: 'The original stack. Compact, quick, and extra delicious.',
    stats: { maxSpeed: 12, accel: 15, turnRate: 2.7, jumpPower: 9.8, bounce: 0.0, wobble: 1.0, height: 0.85 },
    display: { speed: 0.72, turning: 0.78, bounce: 0.2 },
  },
  {
    id: 'cone',
    label: 'Street Cone',
    blurb: 'Classic orange construction cone with a burger topper.',
    stats: { maxSpeed: 11.8, accel: 15, turnRate: 2.75, jumpPower: 9.8, bounce: 0.0, wobble: 1.1, height: 2.0 },
    display: { speed: 0.65, turning: 0.82, bounce: 0.2 },
  },
  {
    id: 'cone-tall',
    label: 'Highway Cone',
    blurb: 'A tall yellow cone built for speed and big ingredient stacks.',
    stats: { maxSpeed: 13.6, accel: 14, turnRate: 2.45, jumpPower: 9.4, bounce: 0.0, wobble: 1.45, height: 2.6 },
    display: { speed: 0.9, turning: 0.58, bounce: 0.15 },
  },
  {
    id: 'cone-wide',
    label: 'Barricade Cone',
    blurb: 'Wide blue work-zone cone with steady landings and extra bounce.',
    stats: { maxSpeed: 10.8, accel: 13, turnRate: 2.65, jumpPower: 10.4, bounce: 0.28, wobble: 0.75, height: 1.85 },
    display: { speed: 0.5, turning: 0.72, bounce: 0.8 },
  },
];

export function bodyTypeDef(id: BodyType): BodyTypeDef {
  return BODY_TYPES.find((b) => b.id === id)!;
}

export const BODY_COLORS: { id: string; label: string; hex: number }[] = [
  { id: 'orange', label: 'Orange', hex: 0xff7a1a },
  { id: 'yellow', label: 'Yellow', hex: 0xffd21f },
  { id: 'blue', label: 'Blue', hex: 0x3d8bff },
  { id: 'pink', label: 'Pink', hex: 0xff6bb8 },
  { id: 'green', label: 'Green', hex: 0x3fce5a },
  { id: 'black', label: 'Black', hex: 0x2b2b33 },
];

/**
 * Catalogs double as the SHOP: items with `price > 0` must be bought with
 * coins (Economy) before they can be equipped. price 0/absent = free.
 */
/** Hats (topper slot). Glasses are their own slot so you can wear both. */
export const ACCESSORIES: { id: AccessoryId; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'beanie', label: 'Beanie', price: 0 },
  { id: 'chef', label: 'Chef Toque', price: 60 },
  { id: 'party', label: 'Party Hat', price: 70 },
  { id: 'cowboy', label: 'Cowboy Hat', price: 80 },
  { id: 'tophat', label: 'Top Hat', price: 110 },
  { id: 'wizard', label: 'Wizard Hat', price: 120 },
  { id: 'propeller', label: 'Propeller Cap', price: 180 },
  { id: 'crown', label: 'Crown', price: 250 },
  { id: 'halo', label: 'Halo', price: 400 },
];

/** Glasses (eyewear slot). */
export const GLASSES: { id: GlassesId; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'sunglasses', label: 'Sunglasses', price: 60 },
  { id: 'round', label: 'Round Specs', price: 70 },
  { id: 'visor', label: 'Cyber Visor', price: 120 },
  { id: 'threed', label: '3D Glasses', price: 140 },
  { id: 'star', label: 'Star Shades', price: 200 },
];

export const BOARDS: { id: BoardId; label: string; price: number }[] = [
  { id: 'default', label: 'Default', price: 0 },
  { id: 'wood', label: 'Wood', price: 0 },
  { id: 'checkerboard', label: 'Checker', price: 60 },
  { id: 'neon', label: 'Neon', price: 120 },
  { id: 'pizza', label: 'Pizza', price: 150 },
  { id: 'galaxy', label: 'Galaxy', price: 220 },
  { id: 'gold', label: 'Solid Gold', price: 350 },
];

export const WHEEL_COLORS: { id: string; label: string; hex: number; price: number }[] = [
  { id: 'white', label: 'White', hex: 0xf2f2f2, price: 0 },
  { id: 'yellow', label: 'Yellow', hex: 0xffd21f, price: 0 },
  { id: 'red', label: 'Red', hex: 0xff4040, price: 40 },
  { id: 'cyan', label: 'Cyan', hex: 0x39d8e8, price: 40 },
  { id: 'purple', label: 'Purple', hex: 0xa46bff, price: 60 },
  { id: 'gold', label: 'Gold', hex: 0xd4af37, price: 200 },
];

export const TRAILS: { id: TrailId; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'sparkle', label: 'Sparkle', price: 0 },
  { id: 'smoke', label: 'Smoke', price: 50 },
  { id: 'streak', label: 'Speed Streak', price: 100 },
  { id: 'rainbow', label: 'Rainbow', price: 220 },
  { id: 'fire', label: 'Fire', price: 320 },
];

type Listener = () => void;

export class CustomizationState {
  bodyType: BodyType = 'burger';
  bodyColor: number = BODY_COLORS[0].hex;
  accessory: AccessoryId = 'none';
  glasses: GlassesId = 'none';
  board: BoardId = 'default';
  wheelColor: number = WHEEL_COLORS[0].hex;
  trail: TrailId = 'sparkle';

  private listeners: Listener[] = [];

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** Generic setter that notifies listeners (UI chips call this). */
  set<K extends 'bodyType' | 'bodyColor' | 'accessory' | 'glasses' | 'board' | 'wheelColor' | 'trail'>(
    key: K,
    value: this[K],
  ): void {
    if (this[key] === value) return;
    this[key] = value;
    for (const fn of this.listeners) fn();
  }

  get stats(): BodyStats {
    return bodyTypeDef(this.bodyType).stats;
  }
}
