/**
 * UIManager
 * ---------
 * Builds and owns every DOM layer that sits on top of the WebGL canvas:
 *
 *   start      — title screen
 *   customize  — category chip grids that write into CustomizationState
 *                (body type is just another chip row here)
 *   levels     — level select cards
 *   hud        — score / combo / trick popups / touch controls
 *   results    — end-of-run summary
 *
 * The 3D canvas stays visible behind the customize & level screens so the
 * live preview model shows through the layout's empty side.
 *
 * Touch input: the on-screen buttons set `touchSteer` / `touchJump` /
 * `touchBoost`, which GameApp merges with keyboard state each frame.
 */
import * as THREE from 'three';
import {
  CustomizationState,
  BODY_TYPES,
  ACCESSORIES,
  GLASSES,
  BOARDS,
  WHEEL_COLORS,
  TRAILS,
  type BodyType,
} from './CustomizationState';
import { buildCharacter } from './CharacterFactory';
import { COIN_PACKS, type CoinPack } from './Economy';
import type { Economy } from './Economy';
import type { StackMoveView } from './ScoreSystem';
import { LEVELS } from './Levels';
import { MUSIC_TRACKS } from './AudioSystem';
import {
  animateCoinCallout,
  animateCoinFly,
  animateDenied,
  animateEqualizer,
  animateMoveRow,
  animateOverlay,
  animatePointsFly,
  animateScoreBump,
  animateToast,
  animateTrickPopup,
  makeMeterTween,
  setPulse,
  spinCoin,
} from './UIAnimations';

export type ScreenName = 'start' | 'select' | 'customize' | 'levels' | 'hud' | 'results' | 'pause';

const LEVEL_THUMBNAILS: Record<string, string> = {
  'cone-park': 'grill-yard.webp',
  'mega-canyon': 'mega-canyon.webp',
  'powder-peak': 'powder-peak.webp',
  'sunny-cove': 'sunny-cove.webp',
  'canopy-run': 'canopy-run.webp',
  'redwood-coast': 'redwood-coast.webp',
  'aqueduct-city': 'aqueduct-city.webp',
  'sunset-harbor': 'sunset-harbor.webp',
};

export interface UICallbacks {
  onPlay(): void;                 // start → player select
  onBodyPicked(type: BodyType): void;
  onSelectConfirm(): void;        // player select → customize
  onSkate(): void;                // customize → level select
  onLevelPicked(id: string): void; // level select → game
  onCustomize(): void;            // results → customize
  onBackToSelect(): void;
  onReset(): void;                // respawn player
  onRetry(): void;                // results/pause → new run
  onExitToMenu(): void;           // results/hud/pause → start
  onPause(): void;
  onResume(): void;
  /** small click for button presses */
  onUiClick(): void;
  /** the currently-selected music track id */
  getCurrentTrack(): string;
  /** user picked a track in the music player */
  onTrackPicked(id: string): void;
  /** music / SFX volume, 0..1 */
  getMusicVolume(): number;
  setMusicVolume(v: number): void;
  getSfxVolume(): number;
  setSfxVolume(v: number): void;
  previewSfx(): void;
}

export interface ResultsData {
  score: number;
  bestCombo: number;
  coins: number;
  totalCoins: number;
  tricks: number;
  tallestBurger: number; // layers, incl. the base patty
  coinsBanked: number; // coins + score bonus added to the wallet
  balance: number;     // wallet after banking
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** External SVG symbols keep functional UI art crisp, themeable and text-free. */
function uiIcon(name: string, parent?: HTMLElement, className = 'ui-icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add(...className.split(' ').filter(Boolean));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${import.meta.env.BASE_URL}ui/ui-icons.svg#icon-${name}`);
  svg.appendChild(use);
  parent?.appendChild(svg);
  return svg;
}

function setCoinBalance(node: HTMLElement, amount: number): void {
  node.replaceChildren();
  uiIcon('token', node);
  el('span', 'coin-balance-value', node, amount.toLocaleString());
}

function coin3d(parent: HTMLElement, className = 'coin-3d'): HTMLElement {
  const coin = el('span', className, parent);
  const inner = el('span', 'coin-3d-inner', coin);
  el('span', 'coin-3d-mark', inner, 'S');
  spinCoin(coin);
  return coin;
}

/**
 * Render the actual gameplay rigs once for the player picker. Keeping these as
 * images gives every card the real 3D silhouette without leaving four extra
 * WebGL contexts running behind the UI.
 */
function renderPlayerModels(): Map<BodyType, string> {
  const images = new Map<BodyType, string>();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = 300;
  const height = 220;
  const aspect = width / height;
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1.25);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x617249, 2.4));
  const key = new THREE.DirectionalLight(0xfff1ce, 3.2);
  key.position.set(4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x81cfff, 1.5);
  fill.position.set(-5, 3, 2);
  scene.add(fill);

  for (const def of BODY_TYPES) {
    const previewState = new CustomizationState();
    previewState.bodyType = def.id;
    const rig = buildCharacter(previewState);
    rig.root.rotation.y = -0.34;
    scene.add(rig.root);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(rig.root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const halfHeight = Math.max(size.y * 0.57, (size.x / aspect) * 0.62);
    const camera = new THREE.OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.01,
      100,
    );
    camera.position.set(center.x + 3.2, center.y + size.y * 0.04, center.z + 7.8);
    camera.lookAt(center.x, center.y + size.y * 0.04, center.z);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    images.set(def.id, renderer.domElement.toDataURL('image/png'));
    rig.dispose();
  }

  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}

/** Keep horizontal carousels usable with a mouse as well as touch swipes. */
function enableHorizontalDrag(scroller: HTMLElement): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startScrollLeft = 0;
  let dragged = false;
  let suppressClick = false;

  scroller.addEventListener('pointerdown', (e) => {
    // Touch gets smoother native momentum scrolling via `touch-action: pan-x`.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScrollLeft = scroller.scrollLeft;
    dragged = false;
  });

  scroller.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return;
    const distance = e.clientX - startX;
    if (!dragged && Math.abs(distance) < 5) return;
    if (!dragged) {
      dragged = true;
      scroller.classList.add('is-dragging');
      scroller.setPointerCapture(e.pointerId);
    }
    scroller.scrollLeft = startScrollLeft - distance;
    e.preventDefault();
  });

  const finishDrag = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    if (dragged) {
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 150);
    }
    pointerId = null;
    dragged = false;
    scroller.classList.remove('is-dragging');
  };

  scroller.addEventListener('pointerup', finishDrag);
  scroller.addEventListener('pointercancel', finishDrag);
  scroller.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    },
    true,
  );
}

export class UIManager {
  // touch input flags, read by GameApp every frame
  touchSteer = 0;
  touchJump = false;
  touchBoost = false;
  touchLaunch = false;
  touchDown = false;

  private screens = new Map<ScreenName, HTMLElement>();
  private scoreEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboBar!: HTMLElement;
  private coinCountEl!: HTMLElement;
  private boostBar!: HTMLElement;
  private specialBar!: HTMLElement;
  private specialWrap!: HTMLElement;
  private popupLayer!: HTMLElement;
  private balanceEls: HTMLElement[] = [];
  private root: HTMLElement;
  private selectCards = new Map<BodyType, HTMLElement>();
  private setComboMeter!: (value: number) => void;
  private setBoostMeter!: (value: number) => void;
  private setSpecialMeter!: (value: number) => void;
  private timerUrgent = false;
  private specialReady = false;

  constructor(
    container: HTMLElement,
    private state: CustomizationState,
    private economy: Economy,
    private cb: UICallbacks,
  ) {
    this.root = el('div', 'ui-root', container);
    // Belt-and-braces touch detection alongside the CSS pointer:coarse query:
    // static capability checks up front, plus a live listener so the controls
    // appear the moment a real finger touches the screen (hybrid laptops).
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('has-touch');
    }
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') document.body.classList.add('has-touch');
      },
      { passive: true },
    );
    this.buildStart();
    this.buildSelect();
    this.buildCustomize();
    this.buildLevels();
    this.buildHUD();
    this.buildPause();
    this.buildResults();
    this.buildShop();

    // Every button clicks audibly (delegated so new buttons count too).
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest?.('button')) this.cb.onUiClick();
    });
  }

  /* ---------------------------------------------------------- */
  /* Player select                                               */
  /* ---------------------------------------------------------- */

  private buildSelect(): void {
    const s = el('div', 'screen screen-select hidden', this.root);
    this.screens.set('select', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small icon-text-btn', top);
    uiIcon('back', back);
    el('span', '', back, 'BACK');
    back.addEventListener('click', () => this.cb.onExitToMenu());
    el('h2', 'screen-title inline', top, 'PICK YOUR PLAYER');

    const panel = el('div', 'player-select-panel', s);
    const grid = el('div', 'player-select-grid', panel);
    const playerModels = renderPlayerModels();
    for (const def of BODY_TYPES) {
      const card = el('button', `player-select-card player-${def.id}`, grid);
      card.setAttribute('aria-label', `Choose ${def.label}`);
      const art = el('div', 'player-card-art', card);
      const model = document.createElement('img');
      model.className = 'player-model-render';
      model.src = playerModels.get(def.id) ?? '';
      model.alt = `${def.label} 3D player model`;
      model.draggable = false;
      art.appendChild(model);

      el('div', 'card-name', card, def.label);
      el('div', 'card-blurb', card, def.blurb);
      const bars = el('div', 'stat-bars', card);
      const stat = (label: string, value: number) => {
        const row = el('div', 'stat-row', bars);
        el('span', 'stat-label', row, label);
        const track = el('div', 'stat-track', row);
        const fill = el('div', 'stat-fill', track);
        fill.style.width = `${Math.round(value * 100)}%`;
      };
      stat('SPEED', def.display.speed);
      stat('TURN', def.display.turning);
      stat('BOUNCE', def.display.bounce);

      card.addEventListener('click', () => {
        this.state.set('bodyType', def.id);
        this.highlightSelectCard(def.id);
        this.cb.onBodyPicked(def.id);
      });
      this.selectCards.set(def.id, card);
    }

    const next = el('button', 'btn btn-big btn-primary player-select-next', panel, 'DRESS YOUR PLAYER');
    next.addEventListener('click', () => this.cb.onSelectConfirm());
    this.highlightSelectCard(this.state.bodyType);
  }

  private highlightSelectCard(id: BodyType): void {
    for (const [key, card] of this.selectCards) card.classList.toggle('selected', key === id);
  }

  show(name: ScreenName): void {
    for (const [key, node] of this.screens) node.classList.toggle('hidden', key !== name);
    const hudVisible = name === 'hud';
    setPulse(this.timerEl, hudVisible && this.timerUrgent, 1.12);
    const specialLabel = this.specialWrap.querySelector<HTMLElement>('.special-label');
    if (specialLabel) setPulse(specialLabel, hudVisible && this.specialReady, 1.08, 0.6);
    this.refreshBalances();
    if (name === 'pause') this.refreshPausePanel();
  }

  /** Sync the pause panel's now-playing label + volume sliders to live state. */
  private refreshPausePanel(): void {
    const id = this.cb.getCurrentTrack();
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    this.pauseTrackName.textContent = track ? track.title : '—';
    this.syncVolumeControl(this.musicSlider, this.musicMuteButton, this.cb.getMusicVolume());
    this.syncVolumeControl(this.sfxSlider, this.sfxMuteButton, this.cb.getSfxVolume());
  }

  /* ---------------------------------------------------------- */
  /* Start screen                                                */
  /* ---------------------------------------------------------- */

  private buildStart(): void {
    const s = el('div', 'screen screen-start hidden', this.root);
    this.screens.set('start', s);

    el('div', 'shack-awning', s);
    const top = el('div', 'home-topbar', s);
    const music = el('button', 'hud-icon-btn home-music', top);
    music.setAttribute('aria-label', 'Open jukebox');
    uiIcon('music', music);
    music.addEventListener('click', () => this.openMusicPlayer());
    const wallet = el('button', 'wallet-ticket', top);
    wallet.setAttribute('aria-label', 'Open Grill Shop');
    this.balanceEls.push(el('span', 'coin-balance', wallet, ''));
    wallet.addEventListener('click', () => this.openShop());

    const card = el('div', 'home-hero', s);
    const logo = document.createElement('img');
    logo.className = 'game-logo';
    logo.src = `${import.meta.env.BASE_URL}ui/skate-burger-logo.webp`;
    logo.alt = 'Skate Burger';
    card.appendChild(logo);
    el('p', 'tagline', card, 'FLIP. STACK. SHRED.');

    const best = Number(localStorage.getItem('coneZoneBest') ?? 0);
    const bestTicket = el('div', 'best-score', card);
    el('small', '', bestTicket, 'BEST ORDER');
    el('strong', '', bestTicket, best.toLocaleString());

    // Keep the primary action outside the transformed hero container so its
    // fixed safe-area position is relative to the viewport on every screen.
    const play = el('button', 'btn btn-big btn-primary home-primary', s, 'DROP IN');
    play.addEventListener('click', () => this.cb.onPlay());
  }

  /* ---------------------------------------------------------- */
  /* Customization                                               */
  /* ---------------------------------------------------------- */

  private buildCustomize(): void {
    const s = el('div', 'screen screen-customize hidden', this.root);
    this.screens.set('customize', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small icon-text-btn', top);
    uiIcon('back', back);
    el('span', '', back, 'BACK');
    back.addEventListener('click', () => this.cb.onBackToSelect());
    el('h2', 'screen-title inline', top, 'DRESS YOUR PLAYER');
    // Balance pill doubles as the shop button — tap it to buy more coins.
    const balPill = el('button', 'coin-balance pill shop-open', top, '');
    balPill.addEventListener('click', () => this.openShop());
    this.balanceEls.push(balPill);

    // Middle of the screen left clear for the 3D preview. The panel is a
    // compact bottom sheet: tab bar → one horizontally-scrolling chip row
    // at a time → SKATE pinned at the bottom. No vertical scrolling.
    const panel = el('div', 'customize-panel', s);
    const tabBar = el('div', 'tab-bar', panel);
    const content = el('div', 'tab-content', panel);
    const tabs: { name: string; btn: HTMLElement; section: HTMLElement }[] = [];
    const selectTab = (name: string) => {
      for (const t of tabs) {
        const active = t.name === name;
        t.btn.classList.toggle('active', active);
        t.section.classList.toggle('hidden', !active);
        if (active) t.btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    };

    /**
     * A row of chips that doubles as the SHOP: priced items show a lock +
     * price until bought. Tapping a locked chip buys it (if affordable)
     * and equips it in one go — instant arcade shopping.
     */
    const chipRow = <T>(
      title: string,
      options: { id: T; label?: string; hex?: number; itemKey: string; price: number }[],
      isActive: (id: T) => boolean,
      pick: (id: T) => void,
    ) => {
      const section = el('div', 'chip-section hidden', content);
      const tab = el('button', 'tab', tabBar);
      const iconName = title === 'Hat' ? 'hat' : title === 'Glasses' ? 'glasses' : title === 'Board' ? 'board' : title === 'Wheels' ? 'wheel' : 'trail';
      uiIcon(iconName, tab);
      el('span', '', tab, title);
      tab.addEventListener('click', () => selectTab(title));
      tabs.push({ name: title, btn: tab, section });
      const row = el('div', 'chip-row', section);
      const chips: { id: T; node: HTMLElement; opt: (typeof options)[number] }[] = [];

      const renderChip = (chip: HTMLElement, opt: (typeof options)[number]) => {
        const owned = this.economy.isOwned(opt.itemKey, opt.price);
        if (opt.hex !== undefined) {
          chip.style.background = `#${opt.hex.toString(16).padStart(6, '0')}`;
          chip.title = owned ? opt.label ?? '' : `${opt.label} — ${opt.price} coins`;
          chip.replaceChildren();
          if (!owned) {
            const lock = document.createElement('img');
            lock.className = 'chip-lock-icon';
            lock.src = `${import.meta.env.BASE_URL}ui/icons/lock.png`;
            lock.alt = '';
            lock.setAttribute('aria-hidden', 'true');
            chip.appendChild(lock);
          }
        } else {
          chip.textContent = owned ? opt.label ?? '' : `${opt.label} · ${opt.price}`;
        }
        chip.classList.toggle('locked', !owned);
      };

      for (const opt of options) {
        const chip = el('button', opt.hex !== undefined ? 'chip swatch' : 'chip', row);
        renderChip(chip, opt);
        chip.addEventListener('click', () => {
          if (!this.economy.isOwned(opt.itemKey, opt.price)) {
            if (!this.economy.buy(opt.itemKey, opt.price)) {
              // Can't afford: shake the chip + flash the balance.
              animateDenied(chip, this.balanceEls);
              return;
            }
            renderChip(chip, opt); // unlocked!
            this.refreshBalances();
          }
          pick(opt.id);
          for (const c of chips) c.node.classList.toggle('active', isActive(c.id));
        });
        chips.push({ id: opt.id, node: chip, opt });
      }
      const sync = () => {
        for (const c of chips) {
          renderChip(c.node, c.opt);
          c.node.classList.toggle('active', isActive(c.id));
        }
      };
      sync();
      this.customizeSyncs.push(sync);
    };

    // SKATE BURGER era: the Body/Color rows are hidden — everyone rides as
    // the Burger for now (the classic crew lives on in CharacterFactory).
    chipRow(
      'Hat',
      ACCESSORIES.map((a) => ({ id: a.id, label: a.label, itemKey: `acc:${a.id}`, price: a.price })),
      (id) => this.state.accessory === id,
      (id) => this.state.set('accessory', id),
    );
    chipRow(
      'Glasses',
      GLASSES.map((g) => ({ id: g.id, label: g.label, itemKey: `glasses:${g.id}`, price: g.price })),
      (id) => this.state.glasses === id,
      (id) => this.state.set('glasses', id),
    );
    chipRow(
      'Board',
      BOARDS.map((b) => ({ id: b.id, label: b.label, itemKey: `board:${b.id}`, price: b.price })),
      (id) => this.state.board === id,
      (id) => this.state.set('board', id),
    );
    chipRow(
      'Wheels',
      WHEEL_COLORS.map((c) => ({ id: c.hex, label: c.label, hex: c.hex, itemKey: `wheel:${c.id}`, price: c.price })),
      (hex) => this.state.wheelColor === hex,
      (hex) => this.state.set('wheelColor', hex),
    );
    chipRow(
      'Trail',
      TRAILS.map((t) => ({ id: t.id, label: t.label, itemKey: `trail:${t.id}`, price: t.price })),
      (id) => this.state.trail === id,
      (id) => this.state.set('trail', id),
    );
    selectTab('Hat');

    // Pinned to the bottom of the sheet, always visible.
    const skate = el('button', 'btn btn-big btn-primary skate-btn', panel, 'RIDE');
    skate.addEventListener('click', () => this.cb.onSkate());
  }

  private customizeSyncs: (() => void)[] = [];

  /** Re-highlight chips after state changed elsewhere (e.g. select screen). */
  syncCustomizeChips(): void {
    for (const fn of this.customizeSyncs) fn();
    this.refreshBalances();
  }

  refreshBalances(): void {
    for (const b of this.balanceEls) setCoinBalance(b, this.economy.coins);
  }

  /* ---------------------------------------------------------- */
  /* Level select                                                */
  /* ---------------------------------------------------------- */

  private buildLevels(): void {
    const s = el('div', 'screen screen-levels hidden', this.root);
    this.screens.set('levels', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small icon-text-btn', top);
    uiIcon('back', back);
    el('span', '', back, 'BACK');
    // Route through setMode so the preview rebuilds (plain show() left the
    // app in 'levels' mode, so customize edits didn't update the preview).
    back.addEventListener('click', () => this.cb.onCustomize());
    el('h2', 'screen-title inline', top, 'PICK A SPOT');

    const panel = el('div', 'select-panel', s);
    const grid = el('div', 'select-grid', panel);
    enableHorizontalDrag(grid);
    LEVELS.forEach((lvl, index) => {
      const card = el('button', 'select-card level-card', grid);
      card.dataset.level = lvl.id;
      const preview = el('div', 'level-preview', card);
      const thumbnail = el('img', 'level-thumbnail', preview);
      thumbnail.src = `${import.meta.env.BASE_URL}ui/levels/${LEVEL_THUMBNAILS[lvl.id]}`;
      thumbnail.alt = '';
      thumbnail.draggable = false;
      el('span', 'level-number', preview, String(index + 1).padStart(2, '0'));
      el('div', 'card-name', card, lvl.id === 'cone-park' ? 'Grill Yard' : lvl.name);
      card.addEventListener('click', () => this.cb.onLevelPicked(lvl.id));
    });
    // A mouse wheel won't scroll a horizontal overflow (and macOS hides the
    // scrollbar), which left the last spot looking cropped with no way to
    // reach it. Translate vertical wheel movement into horizontal scroll.
    grid.addEventListener(
      'wheel',
      (e) => {
        if (grid.scrollWidth <= grid.clientWidth) return;
        const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (delta) {
          grid.scrollLeft += delta;
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  /* ---------------------------------------------------------- */
  /* HUD                                                         */
  /* ---------------------------------------------------------- */

  private buildHUD(): void {
    const s = el('div', 'screen hud hidden', this.root);
    this.screens.set('hud', s);

    const topLeft = el('div', 'hud-topleft', s);
    el('div', 'hud-score-label', topLeft, 'SCORE');
    this.scoreEl = el('div', 'hud-score', topLeft, '0');
    this.comboEl = el('div', 'hud-combo hidden', topLeft, 'x1');
    const barTrack = el('div', 'combo-track', topLeft);
    this.comboBar = el('div', 'combo-fill', barTrack);
    this.coinCountEl = el('div', 'hud-cones', topLeft);
    uiIcon('token', this.coinCountEl);
    el('span', 'coin-count', this.coinCountEl, '0/0');
    uiIcon('burger', this.coinCountEl);
    el('span', 'burger-count', this.coinCountEl, '×1');
    // Special-trick meter: fills with tricks; full = specials unlocked.
    this.specialWrap = el('div', 'special-wrap', topLeft);
    el('div', 'special-label', this.specialWrap, 'SPECIAL');
    const specialTrack = el('div', 'special-track', this.specialWrap);
    this.specialBar = el('div', 'special-fill', specialTrack);

    this.timerEl = el('div', 'hud-timer hidden', s);

    // Boost meter: blue bar top-center under the timer.
    const boostWrap = el('div', 'boost-wrap', s);
    uiIcon('boost', boostWrap, 'ui-icon boost-icon');
    const boostTrack = el('div', 'boost-track', boostWrap);
    this.boostBar = el('div', 'boost-fill', boostTrack);
    this.setComboMeter = makeMeterTween(this.comboBar, 0);
    this.setBoostMeter = makeMeterTween(this.boostBar, 1);
    this.setSpecialMeter = makeMeterTween(this.specialBar, 0);

    // Minimal top-right: pause only. Reset lives in the pause menu.
    const topRight = el('div', 'hud-topright', s);
    const pause = el('button', 'hud-icon-btn', topRight);
    pause.setAttribute('aria-label', 'Pause');
    uiIcon('pause', pause);
    pause.addEventListener('click', () => this.cb.onPause());

    this.buildMusicPlayer();

    this.popupLayer = el('div', 'popup-layer', s);

    // Live move stack: anchored above the player (GameApp projects the
    // position each frame). New moves append at the bottom and push the
    // rest of the stack upward; rows update their text IN PLACE.
    this.stackWrap = el('div', 'move-stack', s);

    // Touch controls — only shown on coarse-pointer devices (see CSS).
    const touch = el('div', 'touch-controls', s);

    // LEFT: a light d-pad — launch (▲, up-and-out off a ramp) on top, steer
    // (◀ ▶) in the middle, down (▼, brake / hold in air = backflip) at the
    // bottom. Small + translucent so they stay out of the way.
    const left = el('div', 'touch-cluster touch-left', touch);
    const btnLaunch = el('button', 'touch-btn touch-dir touch-launch', left);
    btnLaunch.setAttribute('aria-label', 'Launch');
    uiIcon('up', btnLaunch);
    const dirRow = el('div', 'touch-dirrow', left);
    const btnL = el('button', 'touch-btn touch-dir', dirRow);
    btnL.setAttribute('aria-label', 'Steer left');
    uiIcon('left', btnL);
    const btnR = el('button', 'touch-btn touch-dir', dirRow);
    btnR.setAttribute('aria-label', 'Steer right');
    uiIcon('right', btnR);
    const btnDown = el('button', 'touch-btn touch-dir', left);
    btnDown.setAttribute('aria-label', 'Brake');
    uiIcon('down', btnDown);

    // RIGHT: the two primary actions, each an icon with a subtle label.
    const right = el('div', 'touch-cluster touch-right', touch);
    const btnBoost = el('button', 'touch-btn touch-boost touch-labeled', right);
    btnBoost.setAttribute('aria-label', 'Boost');
    uiIcon('boost', btnBoost, 'ui-icon tb-icon');
    el('span', 'tb-label', btnBoost, 'BOOST');
    const btnJump = el('button', 'touch-btn touch-jump touch-labeled', right);
    btnJump.setAttribute('aria-label', 'Jump');
    uiIcon('jump', btnJump, 'ui-icon tb-icon');
    el('span', 'tb-label', btnJump, 'JUMP');

    const bindHold = (btn: HTMLElement, down: () => void, up: () => void) => {
      const start = (e: Event) => {
        e.preventDefault();
        down();
      };
      const end = (e: Event) => {
        e.preventDefault();
        up();
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', end);
    };
    bindHold(btnL, () => (this.touchSteer = -1), () => {
      if (this.touchSteer === -1) this.touchSteer = 0;
    });
    bindHold(btnR, () => (this.touchSteer = 1), () => {
      if (this.touchSteer === 1) this.touchSteer = 0;
    });
    bindHold(btnJump, () => (this.touchJump = true), () => (this.touchJump = false));
    bindHold(btnBoost, () => (this.touchBoost = true), () => (this.touchBoost = false));
    bindHold(btnLaunch, () => (this.touchLaunch = true), () => (this.touchLaunch = false));
    bindHold(btnDown, () => (this.touchDown = true), () => (this.touchDown = false));
  }

  /* ---------------------------------------------------------- */
  /* Music player                                                */
  /* ---------------------------------------------------------- */

  private musicOverlay!: HTMLElement;
  private musicCards = new Map<string, HTMLElement>();

  private buildMusicPlayer(): void {
    // Full-screen dim backdrop; click outside the sheet closes it.
    const overlay = el('div', 'music-overlay hidden', this.root);
    this.musicOverlay = overlay;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeMusicPlayer();
    });

    const sheet = el('div', 'music-sheet', overlay);
    const head = el('div', 'music-head', sheet);
    const musicHeading = el('div', 'overlay-heading', head);
    uiIcon('music', musicHeading);
    el('h2', 'music-title', musicHeading, 'JUKEBOX');
    const close = el('button', 'btn btn-small music-close', head);
    close.setAttribute('aria-label', 'Close jukebox');
    uiIcon('close', close);
    close.addEventListener('click', () => this.closeMusicPlayer());

    const grid = el('div', 'music-grid', sheet);
    MUSIC_TRACKS.forEach((track, i) => {
      const card = el('button', 'album-card', grid);
      const art = el('div', 'album-art', card);
      art.dataset.variant = String(i % 4);
      uiIcon('music', art, 'ui-icon album-glyph');
      const eq = el('div', 'album-eq', card); // "now playing" bars (CSS-animated)
      el('i', '', eq);
      el('i', '', eq);
      el('i', '', eq);
      el('div', 'album-name', card, track.title);
      card.addEventListener('click', () => {
        this.cb.onTrackPicked(track.id);
        this.highlightTrack(track.id);
        this.pauseTrackName.textContent = track.title;
      });
      this.musicCards.set(track.id, card);
    });
  }

  private highlightTrack(id: string): void {
    for (const [key, card] of this.musicCards) {
      const active = key === id;
      card.classList.toggle('playing', active);
      animateEqualizer(card, active);
    }
  }

  private openMusicPlayer(): void {
    this.highlightTrack(this.cb.getCurrentTrack());
    animateOverlay(this.musicOverlay, true);
  }

  private closeMusicPlayer(): void {
    animateOverlay(this.musicOverlay, false);
    for (const card of this.musicCards.values()) animateEqualizer(card, false);
  }

  /* ---------------------------------------------------------- */
  /* Coin shop (buy coin packs for USD)                          */
  /* ---------------------------------------------------------- */

  private shopOverlay!: HTMLElement;

  private buildShop(): void {
    const overlay = el('div', 'shop-overlay hidden', this.root);
    this.shopOverlay = overlay;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeShop();
    });

    const sheet = el('div', 'shop-sheet', overlay);
    const head = el('div', 'shop-head', sheet);
    const shopHeading = el('div', 'overlay-heading', head);
    uiIcon('shop', shopHeading);
    el('h2', 'shop-title', shopHeading, 'GRILL SHOP');
    const close = el('button', 'btn btn-small', head);
    close.setAttribute('aria-label', 'Close shop');
    uiIcon('close', close);
    close.addEventListener('click', () => this.closeShop());

    // Live wallet balance (registered so refreshBalances keeps it current).
    this.balanceEls.push(el('div', 'shop-balance', sheet, ''));

    const grid = el('div', 'shop-grid', sheet);
    for (const pack of COIN_PACKS) {
      const card = el('div', 'coinpack', grid);
      if (pack.bonus) el('div', 'coinpack-badge', card, pack.bonus);
      const packIcon = el('div', 'coinpack-icon', card);
      uiIcon('token', packIcon);
      el('div', 'coinpack-coins', card, pack.coins.toLocaleString());
      const buy = el('button', 'btn btn-small coinpack-buy', card, `$${pack.usd.toFixed(2)}`);
      buy.addEventListener('click', () => this.purchase(pack));
    }

    el('p', 'shop-note', sheet, 'Prototype store. No real charge.');
  }

  private purchase(pack: CoinPack): void {
    // A static build has no payment processor, so the checkout is stubbed:
    // grant the coins immediately and confirm. Swap this for a real
    // provider (Stripe Checkout, etc.) when there's a backend.
    this.economy.addCoins(pack.coins);
    this.refreshBalances();
    const toast = el('div', 'shop-toast', this.shopOverlay);
    uiIcon('token', toast);
    el('span', '', toast, `+${pack.coins.toLocaleString()}`);
    animateToast(toast);
  }

  private openShop(): void {
    this.refreshBalances();
    animateOverlay(this.shopOverlay, true);
  }

  private closeShop(): void {
    animateOverlay(this.shopOverlay, false);
  }

  setScore(score: number): void {
    this.scoreEl.textContent = score.toLocaleString();
  }

  setTimer(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const m = Math.floor(seconds / 60);
    const s = Math.max(0, Math.ceil(seconds % 60));
    this.timerEl.textContent = s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
    const urgent = seconds < 15;
    this.timerEl.classList.toggle('urgent', urgent);
    if (urgent !== this.timerUrgent) {
      this.timerUrgent = urgent;
      setPulse(this.timerEl, urgent, 1.12);
    }
  }

  setCombo(chainSize: number, windowFrac: number): void {
    const active = chainSize >= 2;
    this.comboEl.classList.toggle('hidden', !active);
    this.comboEl.textContent = `COMBO ×${chainSize}`;
    this.setComboMeter(windowFrac);
  }

  /* ---- live move stack ---- */

  private stackWrap!: HTMLElement;
  private stackRows = new Map<number, HTMLElement>();

  setStackPos(x: number, y: number, visible: boolean): void {
    this.stackWrap.style.left = `${Math.round(Math.min(Math.max(x, 90), window.innerWidth - 90))}px`;
    this.stackWrap.style.top = `${Math.round(Math.min(Math.max(y, 70), window.innerHeight - 40))}px`;
    this.stackWrap.style.visibility = visible ? 'visible' : 'hidden';
  }

  /** Reconcile rows by move id so a rolling move reuses the SAME element. */
  setStack(moves: StackMoveView[]): void {
    const seen = new Set<number>();
    for (const m of moves) {
      seen.add(m.id);
      let row = this.stackRows.get(m.id);
      if (!row) {
        row = el('div', 'move-row', this.stackWrap);
        this.stackRows.set(m.id, row);
        animateMoveRow(row);
      }
      if (row.textContent !== m.text) row.textContent = m.text;
      row.classList.toggle('done', !m.active);
    }
    for (const [id, row] of this.stackRows) {
      if (!seen.has(id)) {
        row.remove();
        this.stackRows.delete(id);
      }
    }
  }

  /** The whole chain banks: one gold "+X POINTS" flies up from the stack. */
  stackConvertFx(total: number): void {
    const fly = el('div', 'points-fly', this.popupLayer, `+${total.toLocaleString()} POINTS`);
    fly.style.left = this.stackWrap.style.left;
    fly.style.top = this.stackWrap.style.top;
    animatePointsFly(fly, false);
    animateScoreBump(this.scoreEl);
  }

  /** Bonked mid-chain: the pending points are lost. */
  stackVoidFx(): void {
    const fly = el('div', 'points-fly void', this.popupLayer, 'BEEFED IT');
    fly.style.left = this.stackWrap.style.left;
    fly.style.top = this.stackWrap.style.top;
    animatePointsFly(fly, true);
  }

  private coinLine = { collected: 0, total: 0, burger: 1 };

  setCoinCount(collected: number, total: number): void {
    this.coinLine.collected = collected;
    this.coinLine.total = total;
    this.renderCoinLine();
  }

  /** Current burger stack height (layers incl. the base patty). */
  setBurgerHeight(layers: number): void {
    this.coinLine.burger = layers;
    this.renderCoinLine();
  }

  private renderCoinLine(): void {
    const b = this.coinLine;
    const coin = this.coinCountEl.querySelector('.coin-count');
    const burger = this.coinCountEl.querySelector('.burger-count');
    if (coin) coin.textContent = b.collected.toLocaleString();
    if (burger) burger.textContent = `×${b.burger}`;
  }

  setBoost(frac: number): void {
    this.setBoostMeter(frac);
    this.boostBar.classList.toggle('low', frac < 0.25);
  }

  setSpecial(frac: number, ready: boolean): void {
    this.setSpecialMeter(frac);
    this.specialWrap.classList.toggle('ready', ready);
    if (ready !== this.specialReady) {
      this.specialReady = ready;
      const label = this.specialWrap.querySelector<HTMLElement>('.special-label');
      if (label) setPulse(label, ready, 1.08, 0.6);
    }
  }

  /** Floating trick text, e.g. "360 Spin! +400". */
  trickPopup(label: string, points: number): void {
    const node = el('div', 'trick-popup', this.popupLayer);
    node.textContent = points > 0 ? `${label} +${points.toLocaleString()}` : label;
    animateTrickPopup(node, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 10);
  }

  /** Cash-in celebration: a burst of coins flies up to the top HUD + a callout. */
  coinFlyout(amount: number): void {
    const layer = this.popupLayer;
    const callout = el('div', 'coin-callout', layer);
    coin3d(callout, 'coin-3d coin-3d-callout');
    el('span', '', callout, `+${amount.toLocaleString()}`);
    animateCoinCallout(callout);
    const n = Math.min(16, 7 + Math.round(amount / 50));
    for (let i = 0; i < n; i++) {
      const c = el('div', 'coin-fly', layer);
      coin3d(c);
      c.style.left = `${44 + Math.random() * 12}%`;
      c.style.top = `${52 + Math.random() * 12}%`;
      animateCoinFly(c, (Math.random() - 0.5) * 60, 1700, i * 45);
    }
  }

  /** Pickup sparkle: collected coins flip upward toward the top-left HUD. */
  coinPickupFlyout(count: number): void {
    const layer = this.popupLayer;
    const n = Math.min(8, Math.max(1, count));
    for (let i = 0; i < n; i++) {
      const c = el('div', 'coin-fly coin-fly-pickup', layer);
      coin3d(c);
      c.style.left = `${54 + Math.random() * 8}%`;
      c.style.top = `${35 + Math.random() * 8}%`;
      animateCoinFly(c, (Math.random() - 0.5) * 42, 1700, i * 45);
    }
  }

  /* ---------------------------------------------------------- */
  /* Pause                                                       */
  /* ---------------------------------------------------------- */

  private pauseTrackName!: HTMLElement;
  private musicSlider!: HTMLInputElement;
  private sfxSlider!: HTMLInputElement;
  private musicMuteButton!: HTMLButtonElement;
  private sfxMuteButton!: HTMLButtonElement;

  private syncVolumeControl(input: HTMLInputElement, button: HTMLButtonElement, value: number): void {
    const normalized = Math.min(1, Math.max(0, value));
    input.value = String(normalized);
    input.style.setProperty('--volume-fill', `${Math.round(normalized * 100)}%`);
    const muted = normalized <= 0.001;
    const icon = button.querySelector('img');
    if (icon) icon.setAttribute('src', `${import.meta.env.BASE_URL}ui/icons/${muted ? 'volume-muted' : 'volume-on'}.png`);
    button.classList.toggle('muted', muted);
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Restore volume' : 'Mute');
  }

  private buildPause(): void {
    const s = el('div', 'screen screen-pause hidden', this.root);
    this.screens.set('pause', s);

    el('div', 'shack-awning pause-awning', s);
    const card = el('div', 'title-card pause-card', s);
    el('span', 'pause-kicker', card, 'TAKE FIVE');
    el('h2', 'game-title small', card, 'ON BREAK');

    // --- Music player: now-playing + open the jukebox grid ---
    const music = el('div', 'pause-music', card);
    const np = el('div', 'pause-nowplaying', music);
    uiIcon('music', np, 'ui-icon pause-note');
    this.pauseTrackName = el('span', 'pause-trackname', np, '');
    const change = el('button', 'btn btn-small', music, 'JUKEBOX');
    change.addEventListener('click', () => this.openMusicPlayer());

    // --- Volume sliders ---
    const volWrap = el('div', 'pause-vols', card);
    const slider = (
      label: string,
      get: () => number,
      set: (v: number) => void,
      fallback: number,
      preview?: () => void,
    ): { input: HTMLInputElement; mute: HTMLButtonElement } => {
      const rowEl = el('div', 'vol-row', volWrap);
      el('span', 'vol-label', rowEl, label);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = String(get());
      input.className = 'vol-slider';
      input.setAttribute('aria-label', `${label} volume`);
      rowEl.appendChild(input);
      const mute = el('button', 'volume-mute', rowEl);
      const icon = document.createElement('img');
      icon.className = 'volume-icon';
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      mute.appendChild(icon);
      let restoreVolume = get() > 0 ? get() : fallback;
      const apply = (value: number) => {
        const normalized = Math.min(1, Math.max(0, value));
        if (normalized > 0) restoreVolume = normalized;
        set(normalized);
        this.syncVolumeControl(input, mute, normalized);
      };
      input.addEventListener('input', () => apply(parseFloat(input.value)));
      if (preview) input.addEventListener('change', preview);
      mute.addEventListener('click', () => apply(get() > 0 ? 0 : restoreVolume));
      this.syncVolumeControl(input, mute, get());
      return { input, mute };
    };
    const musicControl = slider('Music', () => this.cb.getMusicVolume(), (v) => this.cb.setMusicVolume(v), 0.35);
    this.musicSlider = musicControl.input;
    this.musicMuteButton = musicControl.mute;
    const sfxControl = slider('Sound', () => this.cb.getSfxVolume(), (v) => this.cb.setSfxVolume(v), 0.8, () => this.cb.previewSfx());
    this.sfxSlider = sfxControl.input;
    this.sfxMuteButton = sfxControl.mute;

    // --- Controls: tucked behind a toggle so the pause card stays clean ---
    const ctrlToggle = el('button', 'btn btn-small pause-controls-toggle', card, 'TRICK BOOK');
    const hints = el('div', 'controls-hint hidden', card);
    ctrlToggle.addEventListener('click', () => {
      const open = hints.classList.toggle('hidden');
      ctrlToggle.textContent = open ? 'TRICK BOOK' : 'HIDE TRICKS';
    });
    const section = (title: string) => el('div', 'hint-section', hints, title);
    const hint = (action: string, how: string) => {
      const row = el('div', 'hint-row', hints);
      el('span', 'hint-action', row, action);
      el('span', 'hint-key', row, how);
    };
    section('RIDING');
    hint('Steer', 'A/D · Left/Right');
    hint('Ollie', 'Space · Jump');
    hint('Boost', 'hold W · Shift · BOOST');
    hint('Launch off ramps', 'Up · Launch');
    hint('Brake', 'S · Down');
    section('AIR TRICKS — tap jump again in the air');
    hint('Kickflip', 'tap jump');
    hint('Heelflip', 'Left + tap jump');
    hint('Pop Shove-It', 'Right + tap jump');
    hint('Impossible', 'S/Down + tap jump');
    hint('Spin 180–720', 'steer while airborne');
    hint('Backflip (×2, ×3…)', 'hold S / Down in the air');
    section('GRABS — hold boost in the air');
    hint('Melon Grab', 'hold boost');
    hint('Indy Grab', 'Right + hold boost');
    hint('Stalefish', 'Left + hold boost');
    hint('Tail Grab', 'S/Down + hold boost');
    section('GRINDS — land on rails, ledges & lips');
    hint('50-50 Grind', 'land along the rail');
    hint('Boardslide', 'land across the rail');
    hint('Lip Grind', 'land on a quarter-pipe lip');
    section('SPECIALS — fill the SPECIAL meter, then in the air:');
    hint('Rocket Air', 'hold boost + tap jump');
    hint('The 900', 'Left/Right + hold boost + tap jump');
    hint('Christ Air', 'S/Down + hold boost + tap jump');
    section('VERT — curved ramps & bowls lock you in');
    hint('Pump & trick', 'jump / boost stay in the pipe');
    hint('Launch out', 'tap Up / Launch to clear the lip');
    hint('Or ride off', 'drift along the lip to exit sideways');
    section('OTHER');
    hint('Refill boost', 'rest, or grab blue orbs');
    hint('Reset / Pause / Debug', 'R · Esc/P · V');

    const row = el('div', 'results-buttons pause-actions', card);
    const resume = el('button', 'btn btn-big btn-primary', row, 'BACK TO IT');
    resume.addEventListener('click', () => this.cb.onResume());
    const restart = el('button', 'btn btn-big', row, 'RESTART RUN');
    restart.addEventListener('click', () => this.cb.onRetry());
    const reset = el('button', 'btn btn-big', row, 'RESET POSITION');
    reset.addEventListener('click', () => this.cb.onReset());
    const quit = el('button', 'btn btn-big btn-quiet', row, 'QUIT TO SHACK');
    quit.addEventListener('click', () => this.cb.onExitToMenu());
  }

  /* ---------------------------------------------------------- */
  /* Results                                                     */
  /* ---------------------------------------------------------- */

  private resultsBody!: HTMLElement;

  private buildResults(): void {
    const s = el('div', 'screen screen-results hidden', this.root);
    this.screens.set('results', s);

    const card = el('div', 'title-card results-card', s);
    el('span', 'results-kicker', card, 'RUN COMPLETE');
    el('h2', 'game-title small', card, 'ORDER UP!');
    this.resultsBody = el('div', 'results-body', card);

    const row = el('div', 'results-buttons', card);
    const retry = el('button', 'btn btn-big btn-primary', row, 'AGAIN!');
    retry.addEventListener('click', () => this.cb.onRetry());
    const customize = el('button', 'btn btn-big', row, 'LOOKS');
    customize.addEventListener('click', () => this.cb.onCustomize());
    const menu = el('button', 'btn btn-big btn-quiet', row, 'HOME');
    menu.addEventListener('click', () => this.cb.onExitToMenu());
  }

  showResults(data: ResultsData): void {
    this.resultsBody.innerHTML = '';
    const stat = (label: string, value: string, big = false) => {
      const row = el('div', big ? 'result-row big' : 'result-row', this.resultsBody);
      el('span', 'result-label', row, label);
      el('span', 'result-value', row, value);
    };
    stat('SCORE', data.score.toLocaleString(), true);
    stat('TALLEST STACK', `×${data.tallestBurger}`);
    stat('BEST COMBO', `×${data.bestCombo}`);
    const receipt = el('div', 'results-receipt-details', this.resultsBody);
    const detail = (label: string, value: string) => {
      const row = el('div', 'receipt-detail', receipt);
      el('span', '', row, label);
      el('strong', '', row, value);
    };
    detail('COINS FOUND', `${data.coins}/${data.totalCoins}`);
    detail('MOVES BANKED', String(data.tricks));
    detail('TOKENS BANKED', `+${data.coinsBanked}`);
    detail('WALLET', data.balance.toLocaleString());

    const best = Number(localStorage.getItem('coneZoneBest') ?? 0);
    if (data.score > best) {
      localStorage.setItem('coneZoneBest', String(data.score));
      stat('', 'NEW BEST!');
    }
    this.show('results');
  }
}
