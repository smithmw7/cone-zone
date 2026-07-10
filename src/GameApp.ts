/**
 * GameApp
 * -------
 * Top-level orchestrator. Owns the renderer, the screen state machine
 * (start → customize → levels → play → results), the game loop, and the
 * wiring between all the systems:
 *
 *   UIManager           DOM screens + touch input
 *   CustomizationState  the player's build (drives CharacterFactory)
 *   PhysicsWorld        Rapier world + ground raycasts
 *   SkateParkScene      level visuals, colliders, rails, collectibles
 *   PlayerController    arcade movement + character animation
 *   ScoreSystem         points, combos, run timer
 *   TrailSystem         customizable particle trail
 *
 * Two Three.js scenes share one renderer: a small "showroom" scene for the
 * select/customize preview, and the park for gameplay.
 */
import * as THREE from 'three';
import { CustomizationState, bodyTypeDef } from './CustomizationState';
import { buildCharacter, type CharacterRig } from './CharacterFactory';
import { PhysicsWorld } from './PhysicsWorld';
import { SkateParkScene, type LevelConfig } from './SkateParkScene';
import { levelById } from './Levels';
import { PlayerController, type ControllerEvents, type InputState } from './PlayerController';
import { ScoreSystem } from './ScoreSystem';
import { TrailSystem } from './TrailSystem';
import { UIManager } from './UIManager';
import { DebugView } from './DebugView';
import { Economy } from './Economy';
import { AudioSystem } from './AudioSystem';

type AppMode = 'start' | 'customize' | 'levels' | 'play' | 'results';

export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private mode: AppMode = 'start';
  private clock = new THREE.Clock();
  private elapsed = 0;

  private state = new CustomizationState();
  private economy = new Economy();
  private audio = new AudioSystem();
  private ui!: UIManager;
  private physics!: PhysicsWorld;
  private currentLevelId: string | null = null;

  // preview showroom
  private previewScene!: THREE.Scene;
  private previewRig: CharacterRig | null = null;
  private previewSpin = 0;

  // gameplay (rebuilt per level by loadLevel)
  private park!: SkateParkScene;
  private playerRig: CharacterRig | null = null;
  private controller!: PlayerController;
  private score!: ScoreSystem;
  private trails!: TrailSystem;
  private debug!: DebugView;

  // input
  private keys = new Set<string>();
  private input: InputState = { steer: 0, throttle: 0, jump: false, boost: false, launch: false };
  /** biggest stack built this run (layers incl. the base patty) */
  private tallestBurger = 1;
  private inDriveThrough = false;
  private paused = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // mobile perf cap
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('game-canvas');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 420);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  async start(): Promise<void> {
    this.buildPreviewScene();

    this.score = new ScoreSystem({
      onScore: (s) => this.ui.setScore(s),
      onCombo: (chain, frac) => this.ui.setCombo(chain, frac),
      onTrick: (label, pts) => this.ui.trickPopup(label, pts),
      onTimeUp: () => this.endRun(),
      onStack: (moves) => this.ui.setStack(moves),
      onStackConvert: (total) => {
        this.ui.stackConvertFx(total);
        this.audio.convert(total);
      },
      onStackVoid: () => this.ui.stackVoidFx(),
    });

    this.ui = new UIManager(this.container, this.state, this.economy, {
      onPlay: () => this.setMode('customize'),
      onSkate: () => this.setMode('levels'),
      onLevelPicked: (id) => {
        void this.loadLevel(levelById(id)).then(() => this.startRun());
      },
      onCustomize: () => this.setMode('customize'),
      onReset: () => this.respawnPlayer(),
      onRetry: () => this.startRun(),
      onExitToMenu: () => this.setMode('start'),
      onPause: () => this.pauseGame(),
      onResume: () => this.resumeGame(),
      onUiClick: () => this.audio.click(),
      getCurrentTrack: () => this.audio.trackId,
      onTrackPicked: (id) => this.audio.selectTrack(id),
      getMusicVolume: () => this.audio.musicVolume,
      setMusicVolume: (v) => this.audio.setMusicVolume(v),
      getSfxVolume: () => this.audio.sfxVolume,
      setSfxVolume: (v) => this.audio.setSfxVolume(v),
    });

    // Any customization change rebuilds the preview model instantly.
    this.state.onChange(() => {
      if (this.mode === 'customize') this.rebuildPreview();
      this.ui.syncCustomizeChips();
    });

    this.bindKeyboard();
    this.setMode('start');
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /**
   * Tear down the current level (if any) and build the picked one:
   * fresh physics world, scene, trails, debug overlay and controller.
   * Procedural generation is fast enough that there's no loading screen.
   */
  private async loadLevel(config: LevelConfig): Promise<void> {
    if (this.currentLevelId === config.id) return;
    this.playerRig?.dispose();
    this.playerRig = null;
    this.park?.dispose();
    this.physics?.dispose();

    this.physics = new PhysicsWorld();
    await this.physics.init();
    this.park = new SkateParkScene(this.physics, config);
    this.trails = new TrailSystem(this.park.scene);
    this.debug = new DebugView(this.park.scene, this.physics, this.park.rails);

    this.controller = new PlayerController(
      this.physics,
      buildCharacter(this.state), // placeholder rig; replaced in startRun()
      this.state.stats,
      this.park.rails,
      this.controllerEvents(),
    );
    this.controller.setSpecialHooks(
      () => this.score.specialReady,
      () => this.score.consumeSpecial(),
    );
    this.controller.bounds = config.bounds;
    this.controller.levelSpeedMul = config.physics?.speedMul ?? 1;
    this.controller.levelTurnMul = config.physics?.turnMul ?? 1;
    this.physics.createPlayerBody(this.park.spawnPoint);
    this.currentLevelId = config.id;
  }

  private controllerEvents(): ControllerEvents {
    return {
        onJump: () => this.audio.ollie(), // ollies make sound, not points
        onLand: () => {
          this.score.landed();
          this.audio.land();
        },
        onAirTick: (m) => this.score.liveAir(m),
        onSpinTick: (deg) => this.score.liveSpin(deg),
        onBackflipTick: (n) => this.score.liveBackflip(n),
        onGrindStart: (name) => {
          this.score.grindStart(name);
          this.audio.grindStart();
        },
        onGrindTick: (dt) => this.score.grindTick(dt),
        onGrindEnd: () => {
          this.score.grindEnd();
          this.audio.grindStop();
        },
        onGrabTick: (name, t) => this.score.grabTick(name, t),
        onGrab: (name) => {
          this.score.grabEnd(name);
          this.audio.grab();
        },
        onBounce: () => {
          this.score.bounce();
          this.audio.boing();
        },
        onFlip: (name) => {
          this.score.flip(name);
          this.audio.flip();
        },
        onSpecial: (name) => {
          this.score.specialMove(name);
          this.audio.special();
        },
        onBonk: () => {
          this.score.bonkVoid();
          // WIPEOUT: the burger crashes out — every collected topping flies
          // off as physics debris and you're back to a basic bun + patty.
          const flew = this.playerRig?.stack?.wipeout() ?? 0;
          if (flew > 0) {
            this.ui.trickPopup('🍔 BURGER DOWN!', 0);
            this.ui.setBurgerHeight(this.playerRig?.stack?.count ?? 1);
          }
          this.audio.bonk();
        },
    };
  }

  /* ------------------------------------------------------------ */
  /* Screen state machine                                          */
  /* ------------------------------------------------------------ */

  private setMode(mode: AppMode): void {
    this.mode = mode;
    this.paused = false; // pause never survives a screen change
    if (mode !== 'play') this.audio.stopLoops();
    switch (mode) {
      case 'start':
        this.score.stop();
        this.audio.stopMusic();
        this.ui.show('start');
        break;
      case 'customize':
        this.score.stop();
        this.rebuildPreview();
        this.ui.syncCustomizeChips(); // highlight the chips for the current state
        this.ui.show('customize');
        break;
      case 'levels':
        this.score.stop();
        this.ui.show('levels');
        break;
      case 'play':
        this.ui.show('hud');
        break;
      case 'results':
        break; // UI shown by showResults
    }
  }

  private startRun(): void {
    // Fresh rig from the current customization.
    this.playerRig?.dispose();
    this.playerRig = buildCharacter(this.state);
    this.park.scene.add(this.playerRig.root);
    this.controller.attachRig(this.playerRig, this.state.stats);
    this.controller.respawn(this.park.spawnPoint, this.park.spawnYaw);
    this.debug.applyWireframe(); // fresh rig materials need the current mode

    this.park.resetCollectibles();
    this.park.sky.applyRandom(this.park.config.theme.skyPresets); // per-level skies
    this.trails.setStyle(this.state.trail);
    this.trails.clear();
    this.controller.resetBoost();
    this.audio.startMusic();
    this.score.startRun();
    this.tallestBurger = 1;
    this.inDriveThrough = false;
    this.ui.setCoinCount(0, this.park.totalCollectibles);
    this.ui.setBurgerHeight(1);

    // Snap camera behind the player so the run doesn't start with a swoop.
    const fwd = this.controller.forward;
    this.camYaw = Math.atan2(fwd.x, fwd.z); // seed the smoothed follow yaw
    this.camera.position.copy(this.controller.pos).addScaledVector(fwd, -5.5).add(new THREE.Vector3(0, 2.1, 0));

    this.setMode('play');
  }

  private endRun(): void {
    this.mode = 'results';
    // Bank the run: collected coins + a score bonus go into the wallet.
    const runCoins = this.park.collectedCount;
    const bonus = Math.floor(this.score.score / 2500);
    this.economy.addCoins(runCoins + bonus);
    this.ui.showResults({
      score: this.score.score,
      bestCombo: this.score.bestChain,
      coins: runCoins,
      totalCoins: this.park.totalCollectibles,
      tricks: this.score.movesBanked,
      tallestBurger: this.tallestBurger,
      coinsBanked: runCoins + bonus,
      balance: this.economy.coins,
    });
  }

  private respawnPlayer(): void {
    this.controller.respawn(this.park.spawnPoint, this.park.spawnYaw);
    this.ui.trickPopup('Reset', 0);
  }

  /** Pause freezes gameplay updates (and the run timer) but keeps rendering. */
  private pauseGame(): void {
    if (this.mode !== 'play' || this.paused) return;
    this.paused = true;
    this.audio.pauseMusic();
    this.audio.stopLoops();
    this.ui.show('pause');
  }

  private resumeGame(): void {
    if (this.mode !== 'play') return;
    this.paused = false;
    this.audio.resumeMusic();
    this.ui.show('hud');
  }

  /* ------------------------------------------------------------ */
  /* Preview showroom                                              */
  /* ------------------------------------------------------------ */

  private buildPreviewScene(): void {
    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(0x7fc4ff);

    const hemi = new THREE.HemisphereLight(0xd6ecff, 0x9a8a68, 1.0);
    const key = new THREE.DirectionalLight(0xfff2d8, 1.3);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    this.previewScene.add(hemi, key);

    // Podium
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.35, 20),
      new THREE.MeshLambertMaterial({ color: 0xe8dfc8, flatShading: true }),
    );
    podium.position.y = -0.18;
    podium.receiveShadow = true;
    this.previewScene.add(podium);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 30, 0.2, 24),
      new THREE.MeshLambertMaterial({ color: 0x6cbf5a }),
    );
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.previewScene.add(floor);
  }

  private rebuildPreview(): void {
    this.previewRig?.dispose();
    this.previewRig = buildCharacter(this.state);
    this.previewRig.root.rotation.y = this.previewSpin;
    this.previewScene.add(this.previewRig.root);
  }

  /* ------------------------------------------------------------ */
  /* Input                                                         */
  /* ------------------------------------------------------------ */

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyR' && this.mode === 'play' && !this.paused) this.respawnPlayer();
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.mode === 'play') {
        this.paused ? this.resumeGame() : this.pauseGame();
      }
      if (e.code === 'KeyV' && this.mode === 'play' && this.debug) {
        const on = this.debug.toggle();
        this.ui.trickPopup(on ? 'Debug view ON' : 'Debug view OFF', 0);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Merge keyboard + touch into a single InputState each frame. */
  private pollInput(): void {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    steer += this.ui.touchSteer;
    this.input.steer = THREE.MathUtils.clamp(steer, -1, 1);

    // S/↓/▼ brakes (and backflips in the air); W/Shift boost/grab; ↑ ejects.
    this.input.throttle = k.has('KeyS') || k.has('ArrowDown') || this.ui.touchDown ? -1 : 0;
    this.input.jump = k.has('Space') || this.ui.touchJump;
    this.input.boost =
      k.has('KeyW') ||
      k.has('ShiftLeft') || k.has('ShiftRight') ||
      this.ui.touchBoost;
    this.input.launch = k.has('ArrowUp') || this.ui.touchLaunch;
  }

  /* ------------------------------------------------------------ */
  /* Main loop                                                     */
  /* ------------------------------------------------------------ */

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 30); // clamp tab-switch spikes
    this.elapsed += dt;

    if (this.mode === 'customize' || this.mode === 'levels') {
      // Showroom: slow turntable spin.
      this.previewSpin += dt * 0.7;
      if (this.previewRig) {
        this.previewRig.root.rotation.y = this.previewSpin;
        // idle wobble so it looks alive
        this.previewRig.body.rotation.z = Math.sin(this.elapsed * 2.4) * 0.06 * bodyTypeDef(this.state.bodyType).stats.wobble;
      }
      const h = bodyTypeDef(this.state.bodyType).stats.height;
      // On portrait screens the customize sheet covers the bottom, so aim
      // slightly lower to keep the character in the clear upper area.
      const portraitDrop = this.camera.aspect < 0.9 ? 0.7 : 0;
      this.camera.position.lerp(new THREE.Vector3(0, 1.0 + h * 0.45, 4.6), Math.min(1, dt * 4));
      this.camera.lookAt(0, h * 0.55 - portraitDrop, 0);
      this.renderer.render(this.previewScene, this.camera);
      return;
    }

    if (this.mode === 'play' || this.mode === 'results') {
      if (this.mode === 'play' && !this.paused) {
        this.pollInput();
        this.controller.update(dt, this.input, this.elapsed);
        this.physics.step(dt);
        this.score.update(dt);
        this.ui.setTimer(this.score.timeLeft);

        // Pickups: mystery boxes (topping + coin + score), orbs (boost).
        const got = this.park.update(dt, this.controller.pos);
        for (let i = 0; i < got.coins; i++) {
          this.score.coin();
          // The box spins, the reveal pops: a random topping joins the stack.
          const topping = this.playerRig?.stack?.addRandomTopping();
          if (topping) this.ui.trickPopup(`${topping.emoji} ${topping.label.toUpperCase()}!`, 0);
        }
        if (got.coins > 0) {
          const h = this.playerRig?.stack?.count ?? 1;
          this.tallestBurger = Math.max(this.tallestBurger, h);
          this.ui.setCoinCount(this.park.collectedCount, this.park.totalCollectibles);
          this.ui.setBurgerHeight(h);
          this.audio.coin();
        }
        if (got.orbs > 0) {
          this.controller.addBoost(0.4 * got.orbs);
          this.ui.trickPopup('Boost ⚡', 0);
          this.audio.orb();
        }

        // Burger Shack drive-through: driving through the glowing ring with a
        // stacked burger cashes it in for coins and resets to a bun + patty.
        {
          const zone = this.park.driveThrough;
          const stack = this.playerRig?.stack;
          if (zone && stack) {
            const near = this.controller.pos.distanceTo(zone.pos) < zone.radius;
            if (near && !this.inDriveThrough && stack.count > 1) {
              const layers = stack.cashIn();
              const coins = Math.round(layers * 25 + layers * layers * 4);
              this.economy.addCoins(coins);
              this.ui.setBurgerHeight(stack.count);
              this.ui.coinFlyout(coins);
              this.audio.convert(coins);
            }
            this.inDriveThrough = near;
          }
        }

        // Meters.
        this.ui.setBoost(this.controller.boostLevel);
        this.ui.setSpecial(this.score.special, this.score.specialReady);

        // Anchor the move stack above the player's head on screen.
        if (this.playerRig) {
          const head = this.controller.pos.clone();
          head.y += this.playerRig.height + 1.6;
          head.project(this.camera);
          this.ui.setStackPos(
            (head.x * 0.5 + 0.5) * window.innerWidth,
            (-head.y * 0.5 + 0.5) * window.innerHeight,
            head.z < 1,
          );
        }

        // Trails spawn from behind the board.
        if (this.playerRig) {
          const anchor = new THREE.Vector3();
          this.playerRig.trailAnchor.getWorldPosition(anchor);
          const speedNorm = Math.min(1, this.controller.horizontalSpeed / this.state.stats.maxSpeed);
          this.trails.emitFrom(anchor, speedNorm, this.controller.mode === 'ground', dt);
        }
        this.trails.update(dt);
        if (this.debug.enabled) this.debug.updatePlayer(this.controller.pos);

        this.updateChaseCamera(dt);
      }
      this.park.sky.update(this.camera.position); // keep the sky infinitely distant
      this.renderer.render(this.park.scene, this.camera);
      return;
    }

    // Start screen: gentle park flyby behind the UI gradient? Keep it cheap —
    // just render the showroom sky so the canvas isn't stale.
    this.renderer.render(this.previewScene ?? new THREE.Scene(), this.camera);
  }

  /**
   * PS2-style chase cam: low, slightly wide, smoothed — with occlusion
   * handling (the standard third-person technique, as used by the
   * `camera-controls` library): raycast from the player's head toward the
   * desired camera spot with a generous buffer, and shorten the boom when
   * something is in the way. The buffer means the camera starts easing in
   * BEFORE it would clip; asymmetric smoothing (pull in fast, relax out
   * slowly) prevents jittery false corrections. Thin rails are ignored.
   */
  private camDist = 5.5;
  private camYaw = 0; // smoothed follow yaw (eases 180° whips instead of snapping)

  private updateChaseCamera(dt: number): void {
    const c = this.controller;
    const boostFov = this.input.boost && c.horizontalSpeed > 6 ? 78 : 70;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, boostFov, 4, dt);
    this.camera.updateProjectionMatrix();

    const DIST = 5.5;         // a little further back than before
    const BUFFER = 1.0;       // start adjusting this far before contact
    const CAM_TURN_RATE = 4;  // how fast the boom swings to a new heading

    // Ease the follow heading toward the player's facing along the SHORTEST
    // arc, so flipping 180° (fakie, quick turnarounds) sweeps round smoothly
    // instead of jump-cutting to the other side.
    const targetYaw = Math.atan2(c.forward.x, c.forward.z);
    let dy = targetYaw - this.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.camYaw += dy * (1 - Math.exp(-dt * CAM_TURN_RATE));
    const fwd = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));

    const head = c.pos.clone();
    head.y += 1.2;
    const idealOffset = fwd.clone().multiplyScalar(-DIST);
    idealOffset.y = 0.8 + (2.15 - 1.2); // boom rises a touch higher behind the player
    const boomLen = idealOffset.length();
    const boomDir = idealOffset.clone().divideScalar(boomLen);

    // Occlusion probe (walls/ramps only — skip bonk-only rails/posts).
    const hit = this.physics.wallRay(head, boomDir, boomLen + BUFFER, false);
    const allowed = hit ? Math.max(1.4, hit.dist - BUFFER) : boomLen;
    // Pull in fast when blocked, relax back slowly when clear.
    this.camDist = THREE.MathUtils.damp(this.camDist, Math.min(allowed, boomLen), allowed < this.camDist ? 14 : 2.5, dt);

    const desired = head.clone().addScaledVector(boomDir, this.camDist);
    const t = 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(desired, t);
    // Never let the camera dip under the floor.
    this.camera.position.y = Math.max(this.camera.position.y, 0.6);

    const look = c.pos.clone().add(fwd.clone().multiplyScalar(2.2));
    look.y += 1.0;
    this.camera.lookAt(look);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
