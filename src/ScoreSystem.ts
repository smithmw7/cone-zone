/**
 * ScoreSystem
 * -----------
 * Chain/combo MOVE-STACK scoring (replaces one-shot trick popups).
 *
 * Moves are LIVE while being performed and roll their value up in place:
 *   AIR 8m → AIR 14m…   SPIN 90° → SPIN 180°…   50-50 1.2s → 2.4s…
 *
 * Rules:
 *  - Moves performed at the same time are a COMBO (they share the stack).
 *  - A new move started within 1s of the last move ending CHAINS the stack.
 *  - Repeating the SAME move within one stack shows ×2/×3/×4 (capped) and
 *    multiplies that move's value.
 *  - 1s after the last move ends with nothing new, the whole stack CONVERTS:
 *    all values sum into one "+X POINTS" flyout that feeds the score.
 *  - Bonking a wall VOIDS the pending stack — unbanked points are lost.
 *
 * Points economy (anti-farm by design):
 *   Ollie                 0        (it's a verb, not a trick)
 *   Air                   6/m beyond the first 4m  (flat hops are worthless)
 *   Spin                  60 @ 90°, +80 per extra 90°
 *   Kickflip              120   Heelflip / Pop Shove-It  140   Impossible 180
 *                         (only score if the full rotation lands — short
 *                          hops cancel the flip, so hop-flick spam = 0)
 *   Grab                  40 + 120/s of hold
 *   50-50 grind           30 + 60/s     Boardslide 40 + 70/s   Lip 50 + 80/s
 *   Boing (ducky bounce)  30
 *   Special trick         1000 flat (meter-gated; its own points don't
 *                          refill the meter it just spent)
 *   Gold coin             50 (instant, outside the stack — it's currency)
 *   Air is exempt from ×2/×3/×4 repeats (every jump would qualify).
 */

export interface StackMoveView {
  id: number;
  text: string;
  active: boolean;
}

export interface ScoreEvents {
  onScore(score: number): void;
  /** chain indicator: number of moves in the open stack + close-window frac */
  onCombo(chainSize: number, windowFrac: number): void;
  /** system popups (Bonk!, etc.) */
  onTrick(label: string, points: number): void;
  onTimeUp(): void;
  onStack(moves: StackMoveView[]): void;
  onStackConvert(total: number): void;
  onStackVoid(): void;
}

const CHAIN_WINDOW = 1.0; // seconds to keep the stack open after a move ends
const MAX_REPEAT = 4;
export const RUN_DURATION = 120;

interface LiveMove {
  id: number;
  key: string;
  base: number;   // current value before the repeat multiplier
  repeat: number; // ×1..×4
  text: string;
  active: boolean;
}

export class ScoreSystem {
  score = 0;
  timeLeft = RUN_DURATION;
  /** Special-trick meter (0..1): fills as stacks convert. */
  special = 0;
  bestChain = 0;    // most moves in one converted stack
  movesBanked = 0;  // total moves converted this run

  private stack: LiveMove[] = [];
  private closeTimer = 0;
  private nextId = 1;
  private running = false;
  private grindName = '';
  private grindSeconds = 0;
  private lastStackSig = '';

  constructor(private events: ScoreEvents) {}

  startRun(): void {
    this.score = 0;
    this.timeLeft = RUN_DURATION;
    this.special = 0;
    this.bestChain = 0;
    this.movesBanked = 0;
    this.stack = [];
    this.closeTimer = 0;
    this.grindName = '';
    this.running = true;
    this.emitStack();
    this.events.onScore(0);
    this.events.onCombo(0, 0);
  }

  stop(): void {
    this.running = false;
  }

  get specialReady(): boolean {
    return this.special >= 1;
  }

  consumeSpecial(): void {
    this.special = 0;
  }

  /* ------------------------------------------------------------ */
  /* Live-move plumbing                                            */
  /* ------------------------------------------------------------ */

  /** Start a move, or roll an already-active one up IN PLACE (same row). */
  private startOrUpdate(key: string, text: string, basePoints: number, allowRepeat = true): void {
    if (!this.running) return;
    let m = this.stack.find((v) => v.active && v.key === key);
    if (!m) {
      const priors = this.stack.filter((v) => v.key === key).length;
      m = {
        id: this.nextId++,
        key,
        base: 0,
        repeat: allowRepeat ? Math.min(MAX_REPEAT, priors + 1) : 1,
        text: '',
        active: true,
      };
      this.stack.push(m);
      this.closeTimer = 0; // a new move keeps the chain open
    }
    m.base = basePoints;
    m.text = m.repeat > 1 ? `${text} ×${m.repeat}` : text;
    this.emitStack();
  }

  private endMove(keyPrefix: string): void {
    let changed = false;
    for (const m of this.stack) {
      if (m.active && m.key.startsWith(keyPrefix)) {
        m.active = false;
        changed = true;
      }
    }
    if (!changed) return;
    if (!this.anyActive) this.closeTimer = CHAIN_WINDOW;
    this.emitStack();
  }

  private get anyActive(): boolean {
    return this.stack.some((m) => m.active);
  }

  private instant(key: string, text: string, points: number, allowRepeat = true): void {
    this.startOrUpdate(key, text, points, allowRepeat);
    this.endMove(key);
  }

  private convert(): void {
    const n = this.stack.length;
    let total = 0;
    for (const m of this.stack) total += Math.round(m.base * m.repeat);
    this.stack = [];
    this.emitStack();
    this.events.onCombo(0, 0);
    if (n === 0) return;
    this.bestChain = Math.max(this.bestChain, n);
    this.movesBanked += n;
    if (total <= 0) return;
    this.score += total;
    this.special = Math.min(1, this.special + total / 3500);
    this.events.onScore(this.score);
    this.events.onStackConvert(total);
  }

  private emitStack(): void {
    const view = this.stack.map((m) => ({ id: m.id, text: m.text, active: m.active }));
    const sig = view.map((v) => `${v.id}:${v.text}:${v.active}`).join('|');
    if (sig === this.lastStackSig) return;
    this.lastStackSig = sig;
    this.events.onStack(view);
  }

  /* ------------------------------------------------------------ */
  /* Controller-facing move API                                    */
  /* ------------------------------------------------------------ */

  liveAir(meters: number): void {
    const pts = Math.max(0, Math.round((meters - 4) * 6));
    this.startOrUpdate('air', `AIR ${Math.floor(meters)}m`, pts, false);
  }

  liveSpin(degrees: number): void {
    const snapped = Math.floor(degrees / 90) * 90;
    if (snapped < 90) return;
    this.startOrUpdate('spin', `SPIN ${snapped}°`, (snapped / 90) * 80 - 20);
  }

  liveBackflip(count: number): void {
    if (count < 1) return;
    const label = count === 1 ? 'BACKFLIP' : count === 2 ? 'DOUBLE BACKFLIP' : `${count}× BACKFLIP`;
    this.startOrUpdate('backflip', label, count * 150);
  }

  /** Landing (or catching a rail) closes the aerial moves. */
  landed(): void {
    this.endMove('air');
    this.endMove('spin');
    this.endMove('backflip');
    this.endMove('grab:');
  }

  grabTick(name: string, seconds: number): void {
    this.startOrUpdate(`grab:${name}`, `${name.toUpperCase()} ${seconds.toFixed(1)}s`, Math.round(40 + seconds * 120));
  }

  grabEnd(name: string): void {
    this.endMove(`grab:${name}`);
  }

  grindStart(name: string): void {
    this.grindName = name;
    this.grindSeconds = 0;
    this.startOrUpdate(`grind:${name}`, name.toUpperCase(), this.grindBase(name));
  }

  grindTick(dt: number): void {
    if (!this.grindName) return;
    this.grindSeconds += dt;
    const rate = this.grindName === 'Lip Grind' ? 80 : this.grindName === 'Boardslide' ? 70 : 60;
    this.startOrUpdate(
      `grind:${this.grindName}`,
      `${this.grindName.toUpperCase()} ${this.grindSeconds.toFixed(1)}s`,
      Math.round(this.grindBase(this.grindName) + rate * this.grindSeconds),
    );
  }

  grindEnd(): void {
    if (!this.grindName) return;
    this.endMove(`grind:${this.grindName}`);
    this.grindName = '';
  }

  private grindBase(name: string): number {
    return name === 'Lip Grind' ? 50 : name === 'Boardslide' ? 40 : 30;
  }

  flip(name: string): void {
    const pts = name.includes('Impossible') ? 180
      : name.includes('Heelflip') || name.includes('Shove') ? 140
      : 120;
    this.instant(`flip:${name}`, name.toUpperCase(), pts);
  }

  bounce(): void {
    this.instant('boing', 'BOING', 30);
  }

  specialMove(name: string): void {
    this.instant(`special:${name}`, `${name.toUpperCase()}!!`, 1000, false);
  }

  /** Gold coin: straight to score, outside the move stack. */
  coin(): void {
    if (!this.running) return;
    this.score += 50;
    this.events.onScore(this.score);
  }

  /** Wall slam: the open stack is VOIDED — unbanked points are lost. */
  bonkVoid(): void {
    if (this.stack.length > 0) {
      this.stack = [];
      this.emitStack();
      this.events.onStackVoid();
    }
    this.special *= 0.4;
    this.events.onCombo(0, 0);
    this.events.onTrick('Bonk!', 0);
  }

  /* ------------------------------------------------------------ */
  /* Per-frame update: chain window + run timer                    */
  /* ------------------------------------------------------------ */

  update(dt: number): void {
    if (!this.running) return;

    if (this.stack.length > 0) {
      if (this.anyActive) {
        this.events.onCombo(this.stack.length, 1);
      } else {
        this.closeTimer -= dt;
        this.events.onCombo(this.stack.length, Math.max(0, this.closeTimer) / CHAIN_WINDOW);
        if (this.closeTimer <= 0) this.convert();
      }
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      if (this.stack.length > 0) this.convert(); // bank whatever's pending
      this.running = false;
      this.events.onTimeUp();
    }
  }
}
