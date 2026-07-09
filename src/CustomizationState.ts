/**
 * CustomizationState
 * ------------------
 * Single source of truth for everything the player picked on the
 * character-select and customization screens. The UI writes into it,
 * and anything that renders the character (preview + gameplay) rebuilds
 * from it via a change listener.
 */

export type BodyType = 'cone' | 'tube' | 'ducky' | 'finger' | 'teddy' | 'goat';
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
    id: 'cone',
    label: 'Classic Cone',
    blurb: 'Certified road hero. Balanced, dependable, 100% cone.',
    stats: { maxSpeed: 12, accel: 15, turnRate: 2.6, jumpPower: 9.6, bounce: 0.0, wobble: 1.0, height: 1.15 },
    display: { speed: 0.6, turning: 0.65, bounce: 0.2 },
  },
  {
    id: 'tube',
    label: 'Tall Tube',
    blurb: 'Long boi. Faster and twirlier, wobbles like a noodle.',
    stats: { maxSpeed: 13.8, accel: 14, turnRate: 2.9, jumpPower: 9.2, bounce: 0.0, wobble: 1.7, height: 1.75 },
    display: { speed: 0.85, turning: 0.8, bounce: 0.15 },
  },
  {
    id: 'ducky',
    label: 'Big Ducky',
    blurb: 'Bath time legend. Slower, but lands with a bonus BOING.',
    stats: { maxSpeed: 10.5, accel: 13, turnRate: 2.4, jumpPower: 10.4, bounce: 0.45, wobble: 0.8, height: 1.25 },
    display: { speed: 0.4, turning: 0.5, bounce: 0.95 },
  },
  {
    id: 'finger',
    label: 'The Finger',
    blurb: 'A big ol\' pointer. Fully opposable, mostly unstoppable.',
    stats: { maxSpeed: 12.8, accel: 14, turnRate: 2.7, jumpPower: 10.8, bounce: 0.0, wobble: 1.3, height: 1.6 },
    display: { speed: 0.8, turning: 0.7, bounce: 0.1 },
  },
  {
    id: 'teddy',
    label: 'Teddy',
    blurb: 'Stuffed with courage (and fluff). Nice soft landings.',
    stats: { maxSpeed: 10, accel: 12, turnRate: 2.5, jumpPower: 9.4, bounce: 0.3, wobble: 0.9, height: 1.3 },
    display: { speed: 0.45, turning: 0.55, bounce: 0.7 },
  },
  {
    id: 'goat',
    label: 'The G.O.A.T.',
    blurb: 'Literally a goat. Jumps like nobody\'s business.',
    stats: { maxSpeed: 13, accel: 15, turnRate: 3.0, jumpPower: 11.2, bounce: 0.0, wobble: 1.1, height: 1.35 },
    display: { speed: 0.9, turning: 0.85, bounce: 0.15 },
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
  bodyType: BodyType = 'cone';
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
