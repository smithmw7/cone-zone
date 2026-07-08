/**
 * UIManager
 * ---------
 * Builds and owns every DOM layer that sits on top of the WebGL canvas:
 *
 *   start      — title screen
 *   select     — character select cards (+ locked "coming soon" slots)
 *   customize  — category chip grids that write into CustomizationState
 *   hud        — score / combo / timer / trick popups / touch controls
 *   results    — end-of-run summary
 *
 * The 3D canvas stays visible behind the select & customize screens so the
 * live preview model shows through the layout's empty side.
 *
 * Touch input: the on-screen buttons set `touchSteer` / `touchJump` /
 * `touchBoost`, which GameApp merges with keyboard state each frame.
 */
import {
  CustomizationState,
  BODY_TYPES,
  BODY_COLORS,
  ACCESSORIES,
  BOARDS,
  WHEEL_COLORS,
  TRAILS,
  type BodyType,
} from './CustomizationState';
import type { Economy } from './Economy';
import type { StackMoveView } from './ScoreSystem';

export type ScreenName = 'start' | 'select' | 'customize' | 'hud' | 'results' | 'pause';

export interface UICallbacks {
  onPlay(): void;                 // start → select
  onBodyPicked(type: BodyType): void; // select card tapped (updates preview)
  onSelectConfirm(): void;        // select → customize
  onSkate(): void;                // customize → game
  onBackToSelect(): void;
  onReset(): void;                // respawn player
  onRetry(): void;                // results/pause → new run
  onExitToMenu(): void;           // results/hud/pause → start
  onPause(): void;
  onResume(): void;
  /** toggles audio; returns the new muted state */
  onToggleSound(): boolean;
  /** small click for button presses */
  onUiClick(): void;
}

export interface ResultsData {
  score: number;
  bestCombo: number;
  coins: number;
  totalCoins: number;
  tricks: number;
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
  private selectCards = new Map<BodyType, HTMLElement>();
  private balanceEls: HTMLElement[] = [];
  private root: HTMLElement;

  constructor(
    container: HTMLElement,
    private state: CustomizationState,
    private economy: Economy,
    private cb: UICallbacks,
    private startMuted = false,
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
  }

  /* ---------------------------------------------------------- */
  /* Start screen                                                */
  /* ---------------------------------------------------------- */

  private buildStart(): void {
    const s = el('div', 'screen screen-start hidden', this.root);
    this.screens.set('start', s);

    const card = el('div', 'title-card', s);
    el('div', 'title-emoji', card, '🚧');
    el('h1', 'game-title', card, 'CONE ZONE');
    el('p', 'tagline', card, 'Totally radical traffic safety.');

    const best = Number(localStorage.getItem('coneZoneBest') ?? 0);
    if (best > 0) el('p', 'best-score', card, `Best score: ${best.toLocaleString()}`);
    this.balanceEls.push(el('p', 'coin-balance', card, ''));

    const play = el('button', 'btn btn-big btn-primary', card, 'PLAY');
    play.addEventListener('click', () => this.cb.onPlay());

    el('p', 'footer-note', s, 'Space = ollie · W/↑ = boost · air: tap jump = flips, hold boost = grabs');
  }

  /* ---------------------------------------------------------- */
  /* Character select                                            */
  /* ---------------------------------------------------------- */

  private buildSelect(): void {
    const s = el('div', 'screen screen-select hidden', this.root);
    this.screens.set('select', s);

    el('h2', 'screen-title', s, 'PICK YOUR SKATER');

    // Left half of the screen is intentionally empty — the live 3D preview
    // renders through from the canvas behind.
    const panel = el('div', 'select-panel', s);
    const grid = el('div', 'select-grid', panel);

    for (const def of BODY_TYPES) {
      const card = el('button', 'select-card', grid);
      el('div', 'card-name', card, def.label);
      el('div', 'card-blurb', card, def.blurb);
      const bars = el('div', 'stat-bars', card);
      const stat = (label: string, v: number) => {
        const row = el('div', 'stat-row', bars);
        el('span', 'stat-label', row, label);
        const track = el('div', 'stat-track', row);
        const fill = el('div', 'stat-fill', track);
        fill.style.width = `${Math.round(v * 100)}%`;
      };
      stat('Speed', def.display.speed);
      stat('Turning', def.display.turning);
      stat('Bounce', def.display.bounce);

      card.addEventListener('click', () => {
        this.state.set('bodyType', def.id);
        this.highlightSelectCard(def.id);
        this.cb.onBodyPicked(def.id);
      });
      this.selectCards.set(def.id, card);
    }

    // Locked teaser cards.
    for (const name of ['???', '???']) {
      const card = el('div', 'select-card locked', grid);
      el('div', 'locked-silhouette', card, '👤');
      el('div', 'card-name', card, name);
      el('div', 'card-blurb', card, 'More types coming soon');
    }

    const next = el('button', 'btn btn-big btn-primary', panel, 'CUSTOMIZE →');
    next.addEventListener('click', () => this.cb.onSelectConfirm());

    this.highlightSelectCard(this.state.bodyType);
  }

  private highlightSelectCard(id: BodyType): void {
    for (const [key, card] of this.selectCards) card.classList.toggle('selected', key === id);
  }

  /* ---------------------------------------------------------- */
  /* Customization                                               */
  /* ---------------------------------------------------------- */

  private buildCustomize(): void {
    const s = el('div', 'screen screen-customize hidden', this.root);
    this.screens.set('customize', s);

    const top = el('div', 'customize-top', s);
    const back = el('button', 'btn btn-small', top, '← Back');
    back.addEventListener('click', () => this.cb.onBackToSelect());
    el('h2', 'screen-title inline', top, 'MAKE IT YOURS');
    this.balanceEls.push(el('div', 'coin-balance pill', top, ''));

    // Middle of the screen left clear for the 3D preview.
    const panel = el('div', 'customize-panel', s);

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
      const section = el('div', 'chip-section', panel);
      el('div', 'chip-title', section, title);
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

    chipRow(
      'Body Type',
      BODY_TYPES.map((b) => ({ id: b.id, label: b.label, itemKey: `body:${b.id}`, price: 0 })),
      (id) => this.state.bodyType === id,
      (id) => this.state.set('bodyType', id),
    );
    chipRow(
      'Body Color',
      BODY_COLORS.map((c) => ({ id: c.hex, label: c.label, hex: c.hex, itemKey: `color:${c.id}`, price: 0 })),
      (hex) => this.state.bodyColor === hex,
      (hex) => this.state.set('bodyColor', hex),
    );
    chipRow(
      'Hat / Accessory',
      ACCESSORIES.map((a) => ({ id: a.id, label: a.label, itemKey: `acc:${a.id}`, price: a.price })),
      (id) => this.state.accessory === id,
      (id) => this.state.set('accessory', id),
    );
    chipRow(
      'Board Style',
      BOARDS.map((b) => ({ id: b.id, label: b.label, itemKey: `board:${b.id}`, price: b.price })),
      (id) => this.state.board === id,
      (id) => this.state.set('board', id),
    );
    chipRow(
      'Wheel Color',
      WHEEL_COLORS.map((c) => ({ id: c.hex, label: c.label, hex: c.hex, itemKey: `wheel:${c.id}`, price: c.price })),
      (hex) => this.state.wheelColor === hex,
      (hex) => this.state.set('wheelColor', hex),
    );
    chipRow(
      'Trail Effect',
      TRAILS.map((t) => ({ id: t.id, label: t.label, itemKey: `trail:${t.id}`, price: t.price })),
      (id) => this.state.trail === id,
      (id) => this.state.set('trail', id),
    );

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
    this.coinCountEl = el('div', 'hud-cones', topLeft, '🪙 0/0');
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

    const topRight = el('div', 'hud-topright', s);
    const sound = el('button', 'btn btn-small hud-btn', topRight, this.startMuted ? '🔇' : '🔊');
    sound.addEventListener('click', () => {
      sound.textContent = this.cb.onToggleSound() ? '🔇' : '🔊';
    });
    const pause = el('button', 'btn btn-small hud-btn', topRight, '⏸ Pause');
    pause.addEventListener('click', () => this.cb.onPause());
    const reset = el('button', 'btn btn-small hud-btn', topRight, '↺ Reset');
    reset.addEventListener('click', () => this.cb.onReset());

    this.popupLayer = el('div', 'popup-layer', s);

    // Live move stack: anchored above the player (GameApp projects the
    // position each frame). New moves append at the bottom and push the
    // rest of the stack upward; rows update their text IN PLACE.
    this.stackWrap = el('div', 'move-stack', s);

    // Touch controls — only shown on coarse-pointer devices (see CSS).
    const touch = el('div', 'touch-controls', s);
    const left = el('div', 'touch-cluster touch-left', touch);
    const btnL = el('button', 'touch-btn', left, '◀');
    const btnR = el('button', 'touch-btn', left, '▶');
    const right = el('div', 'touch-cluster touch-right', touch);
    const btnBoost = el('button', 'touch-btn touch-boost', right, '🔥');
    const btnJump = el('button', 'touch-btn touch-jump', right, '⬆');

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

  setCoinCount(collected: number, total: number): void {
    this.coinCountEl.textContent = `🪙 ${collected}/${total}`;
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

  private buildPause(): void {
    const s = el('div', 'screen screen-pause hidden', this.root);
    this.screens.set('pause', s);

    const card = el('div', 'title-card pause-card', s);
    el('h2', 'game-title small', card, 'PAUSED');

    // Full move list — the trick cheat-sheet (THPS-style verb grammar).
    const hints = el('div', 'controls-hint', card);
    const section = (title: string) => el('div', 'hint-section', hints, title);
    const hint = (action: string, how: string) => {
      const row = el('div', 'hint-row', hints);
      el('span', 'hint-action', row, action);
      el('span', 'hint-key', row, how);
    };
    section('RIDING');
    hint('Steer', 'A/D · ←/→ · ◀ ▶');
    hint('Ollie', 'Space · ⬆');
    hint('Boost (blue meter)', 'hold W/↑ · Shift · 🔥');
    hint('Brake', 'S / ↓');
    section('AIR TRICKS — tap jump again in the air');
    hint('Kickflip', 'tap jump');
    hint('Heelflip', '◀ + tap jump');
    hint('Pop Shove-It', '▶ + tap jump');
    hint('Impossible', 'S/↓ + tap jump');
    hint('Spin 180–720', 'steer while airborne');
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
    customize.addEventListener('click', () => this.cb.onBackToSelect());
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
    stat('Biggest chain', `${data.bestCombo} moves`);
    stat('Coins collected', `${data.coins}/${data.totalCoins}`);
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
