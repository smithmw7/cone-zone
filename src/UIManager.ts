/**
 * UIManager
 * ---------
 * Builds and owns every DOM layer that sits on top of the WebGL canvas:
 *
 *   start      — title screen
 *   customize  — category chip grids that write into CustomizationState
 *                (body type is just another chip row here)
 *   levels     — level select cards
 *   hud        — score / combo / timer / trick popups / touch controls
 *   results    — end-of-run summary
 *
 * The 3D canvas stays visible behind the customize & level screens so the
 * live preview model shows through the layout's empty side.
 *
 * Touch input: the on-screen buttons set `touchSteer` / `touchJump` /
 * `touchBoost`, which GameApp merges with keyboard state each frame.
 */
import {
  CustomizationState,
  ACCESSORIES,
  BOARDS,
  WHEEL_COLORS,
  TRAILS,
} from './CustomizationState';
import type { Economy } from './Economy';
import type { StackMoveView } from './ScoreSystem';
import { LEVELS } from './Levels';
import { MUSIC_TRACKS } from './AudioSystem';

export type ScreenName = 'start' | 'customize' | 'levels' | 'hud' | 'results' | 'pause';

export interface UICallbacks {
  onPlay(): void;                 // start → customize
  onSkate(): void;                // customize → level select
  onLevelPicked(id: string): void; // level select → game
  onCustomize(): void;            // results → customize
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
    this.buildCustomize();
    this.buildLevels();
    this.buildHUD();
    this.buildPause();
    this.buildResults();

    // Every button clicks audibly (delegated so new buttons count too).
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest?.('button')) this.cb.onUiClick();
    });
  }

  show(name: ScreenName): void {
    for (const [key, node] of this.screens) node.classList.toggle('hidden', key !== name);
    this.refreshBalances();
    if (name === 'pause') this.refreshPausePanel();
  }

  /** Sync the pause panel's now-playing label + volume sliders to live state. */
  private refreshPausePanel(): void {
    const id = this.cb.getCurrentTrack();
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    this.pauseTrackName.textContent = track ? track.title : '—';
    this.musicSlider.value = String(this.cb.getMusicVolume());
    this.sfxSlider.value = String(this.cb.getSfxVolume());
  }

  /* ---------------------------------------------------------- */
  /* Start screen                                                */
  /* ---------------------------------------------------------- */

  private buildStart(): void {
    const s = el('div', 'screen screen-start hidden', this.root);
    this.screens.set('start', s);

    const card = el('div', 'title-card', s);
    el('div', 'title-emoji', card, '🍔');
    el('h1', 'game-title', card, 'SKATE BURGER');
    el('p', 'tagline', card, 'Stack it. Shred it. Don’t drop it.');

    const best = Number(localStorage.getItem('coneZoneBest') ?? 0);
    if (best > 0) el('p', 'best-score', card, `Best score: ${best.toLocaleString()}`);
    this.balanceEls.push(el('p', 'coin-balance', card, ''));

    const play = el('button', 'btn btn-big btn-primary', card, 'PLAY');
    play.addEventListener('click', () => this.cb.onPlay());

    el('p', 'footer-note', s, 'Space = ollie · W = boost · ↑ = launch off ramps · air: tap jump = flips, hold boost = grabs');
  }

  /* ---------------------------------------------------------- */
  /* Customization                                               */
  /* ---------------------------------------------------------- */

  private buildCustomize(): void {
    const s = el('div', 'screen screen-customize hidden', this.root);
    this.screens.set('customize', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small', top, '← Back');
    back.addEventListener('click', () => this.cb.onExitToMenu());
    el('h2', 'screen-title inline', top, 'MAKE IT YOURS');
    this.balanceEls.push(el('div', 'coin-balance pill', top, ''));

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
      const tab = el('button', 'tab', tabBar, title);
      tab.addEventListener('click', () => selectTab(title));
      tabs.push({ name: title, btn: tab, section });
      const row = el('div', 'chip-row', section);
      const chips: { id: T; node: HTMLElement; opt: (typeof options)[number] }[] = [];

      const renderChip = (chip: HTMLElement, opt: (typeof options)[number]) => {
        const owned = this.economy.isOwned(opt.itemKey, opt.price);
        if (opt.hex !== undefined) {
          chip.style.background = `#${opt.hex.toString(16).padStart(6, '0')}`;
          chip.title = owned ? opt.label ?? '' : `${opt.label} — ${opt.price} coins`;
          chip.textContent = owned ? '' : '🔒';
        } else {
          chip.textContent = owned ? opt.label ?? '' : `🔒 ${opt.label} · ${opt.price}🪙`;
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
              chip.classList.remove('deny');
              void chip.offsetWidth; // restart the animation
              chip.classList.add('deny');
              for (const b of this.balanceEls) {
                b.classList.remove('flash');
                void b.offsetWidth;
                b.classList.add('flash');
              }
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
    const skate = el('button', 'btn btn-big btn-primary skate-btn', panel, 'SKATE! 🛹');
    skate.addEventListener('click', () => this.cb.onSkate());
  }

  private customizeSyncs: (() => void)[] = [];

  /** Re-highlight chips after state changed elsewhere (e.g. select screen). */
  syncCustomizeChips(): void {
    for (const fn of this.customizeSyncs) fn();
    this.refreshBalances();
  }

  refreshBalances(): void {
    for (const b of this.balanceEls) b.textContent = `🪙 ${this.economy.coins.toLocaleString()}`;
  }

  /* ---------------------------------------------------------- */
  /* Level select                                                */
  /* ---------------------------------------------------------- */

  private buildLevels(): void {
    const s = el('div', 'screen screen-levels hidden', this.root);
    this.screens.set('levels', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small', top, '← Back');
    back.addEventListener('click', () => this.show('customize'));
    el('h2', 'screen-title inline', top, 'PICK A SPOT');

    const panel = el('div', 'select-panel', s);
    const grid = el('div', 'select-grid', panel);
    for (const lvl of LEVELS) {
      const card = el('button', 'select-card level-card', grid);
      el('div', 'level-icon', card, lvl.icon);
      el('div', 'card-name', card, lvl.name);
      el('div', 'card-blurb', card, lvl.blurb);
      el('div', 'level-size', card, `${lvl.bounds.x * 2}×${lvl.bounds.z * 2}m${lvl.physics?.speedMul ? ' · fast & drifty' : ''}`);
      card.addEventListener('click', () => this.cb.onLevelPicked(lvl.id));
    }
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
    this.scoreEl = el('div', 'hud-score', topLeft, '0');
    this.comboEl = el('div', 'hud-combo hidden', topLeft, 'x1');
    const barTrack = el('div', 'combo-track', topLeft);
    this.comboBar = el('div', 'combo-fill', barTrack);
    this.coinCountEl = el('div', 'hud-cones', topLeft, '📦 0/0 · 🍔 1');
    // Special-trick meter: fills with tricks; full = specials unlocked.
    this.specialWrap = el('div', 'special-wrap', topLeft);
    el('div', 'special-label', this.specialWrap, 'SPECIAL');
    const specialTrack = el('div', 'special-track', this.specialWrap);
    this.specialBar = el('div', 'special-fill', specialTrack);

    this.timerEl = el('div', 'hud-timer', s, '2:00');

    // Boost meter: blue bar top-center under the timer.
    const boostWrap = el('div', 'boost-wrap', s);
    el('div', 'boost-icon', boostWrap, '⚡');
    const boostTrack = el('div', 'boost-track', boostWrap);
    this.boostBar = el('div', 'boost-fill', boostTrack);

    // Minimal top-right: just two icon buttons. Reset (↺) and Pause (‖).
    // Audio + music now live in the pause screen, so they're gone from here.
    const topRight = el('div', 'hud-topright', s);
    const reset = el('button', 'hud-icon-btn', topRight);
    reset.setAttribute('aria-label', 'Reset');
    el('span', 'icon-reset', reset, '↺');
    reset.addEventListener('click', () => this.cb.onReset());
    const pause = el('button', 'hud-icon-btn', topRight);
    pause.setAttribute('aria-label', 'Pause');
    el('span', 'icon-pause', pause); // two vertical bars drawn in CSS
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
    const btnLaunch = el('button', 'touch-btn touch-dir touch-launch', left, '▲');
    const dirRow = el('div', 'touch-dirrow', left);
    const btnL = el('button', 'touch-btn touch-dir', dirRow, '◀');
    const btnR = el('button', 'touch-btn touch-dir', dirRow, '▶');
    const btnDown = el('button', 'touch-btn touch-dir', left, '▼');

    // RIGHT: the two primary actions, each an icon with a subtle label.
    const right = el('div', 'touch-cluster touch-right', touch);
    const btnBoost = el('button', 'touch-btn touch-boost touch-labeled', right);
    el('span', 'tb-icon', btnBoost, '🔥');
    el('span', 'tb-label', btnBoost, 'boost');
    const btnJump = el('button', 'touch-btn touch-jump touch-labeled', right);
    el('span', 'tb-icon', btnJump, '▲');
    el('span', 'tb-label', btnJump, 'jump');

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
    el('h2', 'music-title', head, '🎵 JUKEBOX');
    const close = el('button', 'btn btn-small music-close', head, '✕');
    close.addEventListener('click', () => this.closeMusicPlayer());

    const grid = el('div', 'music-grid', sheet);
    MUSIC_TRACKS.forEach((track, i) => {
      const card = el('button', 'album-card', grid);
      // Placeholder square "album art": a deterministic two-tone gradient
      // derived from the track's position, with a music glyph on top.
      const hue = (i * 47) % 360;
      const art = el('div', 'album-art', card);
      art.style.background = `linear-gradient(135deg, hsl(${hue} 75% 58%), hsl(${(hue + 40) % 360} 75% 42%))`;
      el('span', 'album-glyph', art, '♪');
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
    for (const [key, card] of this.musicCards) card.classList.toggle('playing', key === id);
  }

  private openMusicPlayer(): void {
    this.highlightTrack(this.cb.getCurrentTrack());
    this.musicOverlay.classList.remove('hidden');
  }

  private closeMusicPlayer(): void {
    this.musicOverlay.classList.add('hidden');
  }

  setScore(score: number): void {
    this.scoreEl.textContent = score.toLocaleString();
  }

  setTimer(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = Math.max(0, Math.ceil(seconds % 60));
    this.timerEl.textContent = s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
    this.timerEl.classList.toggle('urgent', seconds < 15);
  }

  setCombo(chainSize: number, windowFrac: number): void {
    const active = chainSize >= 2;
    this.comboEl.classList.toggle('hidden', !active);
    this.comboEl.textContent = `CHAIN ×${chainSize}`;
    this.comboBar.style.width = `${Math.round(windowFrac * 100)}%`;
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
    setTimeout(() => fly.remove(), 1200);
    this.scoreEl.classList.remove('bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('bump');
  }

  /** Bonked mid-chain: the pending points are lost. */
  stackVoidFx(): void {
    const fly = el('div', 'points-fly void', this.popupLayer, 'CHAIN LOST');
    fly.style.left = this.stackWrap.style.left;
    fly.style.top = this.stackWrap.style.top;
    setTimeout(() => fly.remove(), 900);
  }

  private boxesLine = { collected: 0, total: 0, burger: 1 };

  setCoinCount(collected: number, total: number): void {
    this.boxesLine.collected = collected;
    this.boxesLine.total = total;
    this.renderBoxesLine();
  }

  /** Current burger stack height (layers incl. the base patty). */
  setBurgerHeight(layers: number): void {
    this.boxesLine.burger = layers;
    this.renderBoxesLine();
  }

  private renderBoxesLine(): void {
    const b = this.boxesLine;
    this.coinCountEl.textContent = `📦 ${b.collected}/${b.total} · 🍔 ${b.burger}`;
  }

  setBoost(frac: number): void {
    this.boostBar.style.width = `${Math.round(frac * 100)}%`;
    this.boostBar.classList.toggle('low', frac < 0.25);
  }

  setSpecial(frac: number, ready: boolean): void {
    this.specialBar.style.width = `${Math.round(frac * 100)}%`;
    this.specialWrap.classList.toggle('ready', ready);
  }

  /** Floating trick text, e.g. "360 Spin! +400". */
  trickPopup(label: string, points: number): void {
    const node = el('div', 'trick-popup', this.popupLayer);
    node.textContent = points > 0 ? `${label} +${points.toLocaleString()}` : label;
    node.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    node.style.setProperty('--tilt', `${(Math.random() - 0.5) * 10}deg`);
    setTimeout(() => node.remove(), 1100);
  }

  /* ---------------------------------------------------------- */
  /* Pause                                                       */
  /* ---------------------------------------------------------- */

  private pauseTrackName!: HTMLElement;
  private musicSlider!: HTMLInputElement;
  private sfxSlider!: HTMLInputElement;

  private buildPause(): void {
    const s = el('div', 'screen screen-pause hidden', this.root);
    this.screens.set('pause', s);

    const card = el('div', 'title-card pause-card', s);
    el('h2', 'game-title small', card, 'PAUSED');

    // --- Music player: now-playing + open the jukebox grid ---
    const music = el('div', 'pause-music', card);
    const np = el('div', 'pause-nowplaying', music);
    el('span', 'pause-note', np, '🎵');
    this.pauseTrackName = el('span', 'pause-trackname', np, '');
    const change = el('button', 'btn btn-small', music, 'Tracks');
    change.addEventListener('click', () => this.openMusicPlayer());

    // --- Volume sliders ---
    const volWrap = el('div', 'pause-vols', card);
    const slider = (label: string, get: () => number, set: (v: number) => void): HTMLInputElement => {
      const rowEl = el('div', 'vol-row', volWrap);
      el('span', 'vol-label', rowEl, label);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = String(get());
      input.className = 'vol-slider';
      input.addEventListener('input', () => set(parseFloat(input.value)));
      rowEl.appendChild(input);
      return input;
    };
    this.musicSlider = slider('Music', () => this.cb.getMusicVolume(), (v) => this.cb.setMusicVolume(v));
    this.sfxSlider = slider('Sound', () => this.cb.getSfxVolume(), (v) => this.cb.setSfxVolume(v));

    // --- Controls: tucked behind a toggle so the pause card stays clean ---
    const ctrlToggle = el('button', 'btn btn-small pause-controls-toggle', card, '🎮 Controls');
    const hints = el('div', 'controls-hint hidden', card);
    ctrlToggle.addEventListener('click', () => {
      const open = hints.classList.toggle('hidden');
      ctrlToggle.textContent = open ? '🎮 Controls' : '🎮 Hide controls';
    });
    const section = (title: string) => el('div', 'hint-section', hints, title);
    const hint = (action: string, how: string) => {
      const row = el('div', 'hint-row', hints);
      el('span', 'hint-action', row, action);
      el('span', 'hint-key', row, how);
    };
    section('RIDING');
    hint('Steer', 'A/D · ←/→ · ◀ ▶');
    hint('Ollie', 'Space · ⬆');
    hint('Boost (blue meter)', 'hold W · Shift · 🔥');
    hint('Launch off ramps', '↑ · ⤴');
    hint('Brake', 'S / ↓');
    section('AIR TRICKS — tap jump again in the air');
    hint('Kickflip', 'tap jump');
    hint('Heelflip', '◀ + tap jump');
    hint('Pop Shove-It', '▶ + tap jump');
    hint('Impossible', 'S/↓ + tap jump');
    hint('Spin 180–720', 'steer while airborne');
    hint('Backflip (×2, ×3…)', 'hold S / ↓ / ▼ in the air');
    section('GRABS — hold boost in the air');
    hint('Melon Grab', 'hold boost');
    hint('Indy Grab', '▶ + hold boost');
    hint('Stalefish', '◀ + hold boost');
    hint('Tail Grab', 'S/↓ + hold boost');
    section('GRINDS — land on rails, ledges & lips');
    hint('50-50 Grind', 'land along the rail');
    hint('Boardslide', 'land across the rail');
    hint('Lip Grind', 'land on a quarter-pipe lip');
    section('SPECIALS — fill the SPECIAL meter, then in the air:');
    hint('Rocket Air', 'hold boost + tap jump');
    hint('The 900', '◀/▶ + hold boost + tap jump');
    hint('Christ Air', 'S/↓ + hold boost + tap jump');
    section('VERT — curved ramps & bowls lock you in');
    hint('Pump & trick', 'jump / boost stay in the pipe');
    hint('Launch out', 'tap ↑ / ⤴ to fly out over the lip');
    hint('Or ride off', 'drift along the lip to exit sideways');
    section('OTHER');
    hint('Refill boost', 'rest, or grab blue orbs');
    hint('Reset / Pause / Debug', 'R · Esc/P · V');

    const row = el('div', 'results-buttons', card);
    const resume = el('button', 'btn btn-big btn-primary', row, 'RESUME');
    resume.addEventListener('click', () => this.cb.onResume());
    const restart = el('button', 'btn btn-big', row, 'RESTART');
    restart.addEventListener('click', () => this.cb.onRetry());
    const quit = el('button', 'btn btn-big', row, 'QUIT');
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
    el('h2', 'game-title small', card, "TIME'S UP!");
    this.resultsBody = el('div', 'results-body', card);

    const row = el('div', 'results-buttons', card);
    const retry = el('button', 'btn btn-big btn-primary', row, 'RETRY');
    retry.addEventListener('click', () => this.cb.onRetry());
    const customize = el('button', 'btn btn-big', row, 'CUSTOMIZE');
    customize.addEventListener('click', () => this.cb.onCustomize());
    const menu = el('button', 'btn btn-big', row, 'MENU');
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
    stat('Tallest burger', `🍔 ${data.tallestBurger} layers`);
    stat('Biggest chain', `${data.bestCombo} moves`);
    stat('Mystery boxes', `📦 ${data.coins}/${data.totalCoins}`);
    stat('Moves banked', String(data.tricks));
    stat('Banked', `+${data.coinsBanked} 🪙`);
    stat('Wallet', `🪙 ${data.balance.toLocaleString()}`);

    const best = Number(localStorage.getItem('coneZoneBest') ?? 0);
    if (data.score > best) {
      localStorage.setItem('coneZoneBest', String(data.score));
      stat('', '🏆 NEW BEST!');
    }
    this.show('results');
  }
}
