/**
 * AudioSystem
 * -----------
 * Music + sound effects.
 *
 * MUSIC: streams the author's own tracks (public/audio/*.mp3) through an
 * <audio> element — no decode-into-memory cost, loops, random pick per run.
 *
 * SFX: synthesized on the fly with the Web Audio API (oscillators + filtered
 * noise). Zero asset downloads, no licensing worries, and each effect is
 * tuned in code. The AudioContext is created/resumed on the first user
 * gesture (browser autoplay policy), so construction is safe at boot.
 */

const MUSIC_TRACKS = ['audio/sun.mp3', 'audio/driving.mp3', 'audio/weekdays.mp3'];
const MUTE_KEY = 'coneZoneMuted';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private grindLoop: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private music = new Audio();
  private musicStarted = false;
  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.music.loop = true;
    this.music.volume = 0.35;
    this.music.muted = this.muted;
    // Autoplay policy: the context can only start after a user gesture.
    const unlock = () => this.ensureCtx();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    this.music.muted = this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        // Shared 1s white-noise buffer for all noise-based effects.
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /* ---------------- music ---------------- */

  startMusic(): void {
    const track = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    if (!this.musicStarted || this.music.src.indexOf(track) === -1) {
      this.music.src = track;
    }
    this.musicStarted = true;
    void this.music.play().catch(() => {/* blocked until a gesture; fine */});
  }

  pauseMusic(): void {
    this.music.pause();
  }

  resumeMusic(): void {
    if (this.musicStarted) void this.music.play().catch(() => {});
  }

  stopMusic(): void {
    this.music.pause();
    this.music.currentTime = 0;
    this.musicStarted = false;
  }

  /* ---------------- synth building blocks ---------------- */

  /** Simple tone with attack/decay envelope and optional pitch slide. */
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst — thuds, scrapes, whooshes. */
  private noise(dur: number, vol: number, filterFreq: number, filterType: BiquadFilterType = 'lowpass', slideTo?: number): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (slideTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ---------------- game events ---------------- */

  ollie(): void {
    this.tone(280, 0.1, 'square', 0.12, 640);
    this.noise(0.06, 0.1, 3000, 'highpass');
  }

  land(): void {
    this.noise(0.13, 0.22, 500, 'lowpass', 120);
    this.tone(95, 0.09, 'sine', 0.18, 55);
  }

  flip(): void {
    this.noise(0.16, 0.12, 900, 'bandpass', 3400);
  }

  grab(): void {
    this.tone(440, 0.12, 'triangle', 0.07, 520);
  }

  coin(): void {
    this.tone(1318, 0.06, 'square', 0.08);
    this.tone(1760, 0.16, 'square', 0.08, undefined, 0.055);
  }

  orb(): void {
    this.tone(240, 0.22, 'sine', 0.14, 720);
    this.tone(480, 0.18, 'sine', 0.07, 960, 0.05);
  }

  bonk(): void {
    this.tone(130, 0.14, 'sawtooth', 0.16, 60);
    this.noise(0.1, 0.2, 700, 'lowpass', 150);
  }

  boing(): void {
    this.tone(160, 0.28, 'sine', 0.16, 520);
  }

  special(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, 'square', 0.09, undefined, i * 0.07));
  }

  /** Chain banked — little cha-ching scaled slightly by size. */
  convert(total: number): void {
    this.tone(880, 0.08, 'triangle', 0.12);
    this.tone(1320, 0.2, 'triangle', 0.12, undefined, 0.07);
    if (total >= 1000) this.tone(1760, 0.26, 'triangle', 0.1, undefined, 0.14);
  }

  click(): void {
    this.tone(700, 0.045, 'square', 0.06, 500);
  }

  grindStart(): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || !this.noiseBuf || this.grindLoop) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.05);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.grindLoop = { src, gain };
    this.tone(1900, 0.07, 'square', 0.06); // clack on
  }

  grindStop(): void {
    if (!this.grindLoop || !this.ctx) return;
    const { src, gain } = this.grindLoop;
    this.grindLoop = null;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    src.stop(this.ctx.currentTime + 0.2);
  }

  /** Stop any continuous effects (pause, quit, respawn). */
  stopLoops(): void {
    this.grindStop();
  }
}
