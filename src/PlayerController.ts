/**
 * PlayerController
 * ----------------
 * Kinematic-style arcade skater. We never simulate a real skateboard —
 * instead we move a point (the board's contact point) with hand-tuned
 * rules and let raycasts against the Rapier park colliders decide where
 * the ground is.
 *
 * Modes:
 *   ground — auto-forward cruising; velocity follows the slope under the
 *            board, so riding up a ramp naturally converts speed into a
 *            launch when the surface ends.
 *   air    — ballistic, with free yaw spinning for tricks.
 *   grind  — snapped to an analytic rail segment, sliding along it.
 *
 * The controller also drives all the character "juice": base-pivot wobble
 * (heavy bottom, floppy top), steering lean, squash & stretch, wheel spin
 * and grind stance.
 */
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { CharacterRig } from './CharacterFactory';
import { BodyStats } from './CustomizationState';
import { RailSegment } from './SkateParkScene';

export interface InputState {
  steer: number;     // -1 (left) .. 1 (right)
  throttle: number;  // -1 = brake (S / down)
  jump: boolean;
  boost: boolean;    // W / Shift — meter boost on ground, grab in air
  launch: boolean;   // ↑ / ⤴ — eject up-and-out off a curved ramp (vert lock)
}

export interface ControllerEvents {
  onJump(): void;
  onLand(airtime: number, spinDeg: number): void;
  /** live meters of flight path while airborne — drives the rolling AIR move */
  onAirTick(distance: number): void;
  /** live degrees of trick spin while airborne */
  onSpinTick(degrees: number): void;
  /** live count of completed backflips while airborne (hold down) */
  onBackflipTick(count: number): void;
  onGrindStart(name: string): void;
  onGrindTick(dt: number): void;
  onGrindEnd(duration: number): void;
  /** live grab hold time while airborne */
  onGrabTick(name: string, duration: number): void;
  onGrab(name: string, duration: number): void;
  onBounce(): void;
  onFlip(name: string): void;
  onSpecial(name: string): void;
  onBonk(): void;
}

type Mode = 'ground' | 'air' | 'grind';

const GRAVITY = 24;          // heavier than Earth = snappier arcs
const LAUNCH_BOOST = 1.28;   // extra pop when a ramp throws us airborne
const BOOST_DRAIN_TIME = 4.5;   // seconds of continuous boost from full
const BOOST_REGEN_TIME = 16;    // seconds to refill while cruising
const BOOST_REST_REGEN_TIME = 5; // much faster refill while resting
const SPECIAL_ANIM_TIME = 0.9;
const AIR_SPIN_RATE = 4.6;   // rad/s of trick spin while airborne
const BACKFLIP_RATE = 8.5;   // rad/s of backward pitch while holding down in the air
const FLIP_DURATION = 0.45;  // seconds for a kickflip board roll
const VERT_PULL_IN = 1.4;    // gentle into-pipe drift that keeps the vert lock
const VERT_LAUNCH_OUT = 9;   // outward pop when ↑ / ⤴ releases the ramp lock
const VERT_LAUNCH_UP = 6.5;  // extra lift on that pop so you clear the lip
const MAX_FALL_SPEED = 30;   // terminal velocity — also prevents tunneling
// Surfaces steeper than this can't be ridden — hitting one bonks you off.
// (Quarter-pipe segments max out at 68°, normal.y ≈ 0.37, still ridable.)
const BONK_NORMAL_Y_GROUND = 0.42;
const BONK_NORMAL_Y_AIR = 0.25;
const BONK_SKIN = 0.45;      // how far the board nose reaches ahead
const PERIMETER_RETURN = 0.82; // lively redirect without killing angled wall speed
const PERIMETER_MIN_SPEED = 4;

export class PlayerController {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  mode: Mode = 'air';
  /** per-level clamp half-extents + feel multipliers (set on level load) */
  bounds = { x: 67.5, z: 47.5 };
  /** Radius of the safety backstop's rounded corners (inside wall face). */
  boundaryCornerRadius = 15.5;
  levelSpeedMul = 1;
  levelTurnMul = 1;

  private speed = 0;               // signed scalar along facing
  private steerSmooth = 0;
  private groundNormal = new THREE.Vector3(0, 1, 0);

  // jump helpers
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private jumpHeld = false;
  // launch (vert eject) helpers — same buffered edge-trigger as jump
  private launchBuffer = 0;
  private launchHeld = false;

  // trick bookkeeping
  private airStart = 0;
  private airTime = 0;
  private airDistance = 0; // meters of flight path this air
  private spinAccum = 0;
  private backflipAccum = 0; // radians of backward pitch this air (hold down)
  private flipTime = -1;   // -1 = not flipping; else seconds into the flip
  private flipCount = 0;   // flips landed this air (for Double Kickflip)
  private flipTrick = 'Kickflip';
  private grabTime = 0;
  private grabName = 'Melon Grab';
  private grabbing = false;
  private grabEase = 0;

  // Boost meter (0..1): drains while boosting on the ground, refills while
  // resting, topped up by the glowing blue orbs in the park.
  boostLevel = 1;
  private boostingNow = false;

  // Special trick state — GameApp wires the meter hooks to ScoreSystem.
  private specialReadyFn: (() => boolean) | null = null;
  private specialConsumeFn: (() => void) | null = null;
  private specialAnimT = SPECIAL_ANIM_TIME; // done
  private specialSpin = 0; // extra auto-spin (The 900)

  // Vert lock: launching off a steep transition (quarter pipe / bowl /
  // half pipe wall) LOCKS you to that ramp — horizontal drift toward/over
  // the lip is always pulled back so you rise, peak, and drop the SAME
  // face. Jump and boost keep you in the pipe (pump + tricks); only the
  // launch button (↑ / ⤴) releases the lock and pops you out over the lip.
  // Drift ALONG the lip stays free, so you can still ride off the end.
  private vertAir = false;
  private vertNormal = new THREE.Vector3(); // horizontal, points into the park

  // grind state
  private grindRail: RailSegment | null = null;
  private grindT = 0;
  private grindDir = 1;
  private grindSpeed = 0;
  private grindTime = 0;
  // Re-attach lockout after leaving a rail. Without it, exiting at a rail
  // end re-triggers the attach check at the clamped endpoint next frame and
  // the player pogo-sticks forever on the rail tip.
  private grindCooldown = 0;
  private bonkEventCooldown = 0; // rate-limits the popup, not the physics
  private perimeterStallTime = 0;

  // animation state
  private wobbleT = 0;
  private squash = 1;
  private squashVel = 0;
  private grindLean = 0;
  private grindStance = 0; // 0 = 50-50, 1 = boardslide
  private tiltQuat = new THREE.Quaternion();

  constructor(
    private physics: PhysicsWorld,
    private rig: CharacterRig,
    private stats: BodyStats,
    private rails: RailSegment[],
    private events: ControllerEvents,
  ) {}

  /** Swap in a new rig (e.g. after re-customizing) without losing state. */
  attachRig(rig: CharacterRig, stats: BodyStats): void {
    this.rig = rig;
    this.stats = stats;
  }

  /** GameApp wires the special-trick meter (lives in ScoreSystem). */
  setSpecialHooks(ready: () => boolean, consume: () => void): void {
    this.specialReadyFn = ready;
    this.specialConsumeFn = consume;
  }

  /** Blue orb pickup. */
  addBoost(amount: number): void {
    this.boostLevel = Math.min(1, this.boostLevel + amount);
  }

  resetBoost(): void {
    this.boostLevel = 1;
  }

  respawn(point: THREE.Vector3, yaw: number): void {
    this.pos.copy(point);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.yaw = yaw;
    this.mode = 'air';
    this.grindRail = null;
    this.grindCooldown = 0;
    this.spinAccum = 0;
    this.airStart = 0;
    this.flipTime = -1;
    this.flipCount = 0;
    this.grabTime = 0;
    this.grabbing = false;
    this.perimeterStallTime = 0;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /* Handling shifts with the burger's WEIGHT. The base bun + patty is nimble
     (turns easier than the old cone); every stacked topping adds weight that
     stiffens and slows the steering — higher risk — while nudging up the top
     speed. Big towers are fast but a handful; small burgers carve. */
  private get stackLayers(): number {
    return Math.max(0, (this.rig.stack?.count ?? 1) - 1);
  }
  private get turnWeightMul(): number {
    return 1.35 / (1 + this.stackLayers * 0.07);
  }
  private get speedWeightMul(): number {
    return 1 + this.stackLayers * 0.014;
  }

  get isGrinding(): boolean {
    return this.mode === 'grind';
  }

  update(dt: number, input: InputState, elapsed: number): void {
    const frameStart = this.pos.clone();
    // Smooth steering so touch buttons don't feel binary. The base burger
    // responds crisply; weight makes the input lag (heavier = sluggish).
    const steerRate = Math.max(6, 14 - this.stackLayers * 0.6);
    this.steerSmooth += (input.steer - this.steerSmooth) * Math.min(1, dt * steerRate);

    // Jump buffering makes ollie timing forgiving.
    const jumpPressed = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    if (jumpPressed) this.jumpBuffer = 0.15;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const launchPressed = input.launch && !this.launchHeld;
    this.launchHeld = input.launch;
    if (launchPressed) this.launchBuffer = 0.15;
    this.launchBuffer = Math.max(0, this.launchBuffer - dt);
    this.grindCooldown = Math.max(0, this.grindCooldown - dt);
    this.bonkEventCooldown = Math.max(0, this.bonkEventCooldown - dt);

    if (this.mode === 'grind') {
      this.updateGrind(dt, elapsed);
    } else {
      this.updateSkating(dt, input, elapsed);
      this.recoverPerimeterStall(dt, input, frameStart);
    }

    this.physics.movePlayerBody(this.pos);
    this.updateVisuals(dt, input);
  }

  /* ------------------------------------------------------------ */
  /* Ground + air                                                  */
  /* ------------------------------------------------------------ */

  private updateSkating(dt: number, input: InputState, elapsed: number): void {
    // Boost meter: drains while boosting on the ground, refills otherwise —
    // quickly while resting, slowly while cruising.
    this.boostingNow = this.mode === 'ground' && input.boost && this.boostLevel > 0.02;
    if (this.boostingNow) {
      this.boostLevel = Math.max(0, this.boostLevel - dt / BOOST_DRAIN_TIME);
    } else {
      const regenTime = this.horizontalSpeed < 2 ? BOOST_REST_REGEN_TIME : BOOST_REGEN_TIME;
      this.boostLevel = Math.min(1, this.boostLevel + dt / regenTime);
    }
    const boost = this.boostingNow ? 1.6 : 1;

    if (this.mode === 'ground') {
      // Turning scales with speed a little so standing turns aren't twitchy,
      // and with the burger's weight (nimble base → stiff heavy stacks).
      const speedFactor = 0.45 + 0.55 * Math.min(1, Math.abs(this.speed) / 6);
      this.yaw -= this.steerSmooth * this.stats.turnRate * this.levelTurnMul * this.turnWeightMul * speedFactor * dt;

      // Auto-forward: cruise toward target speed; S brakes. Weight adds speed.
      const target = this.stats.maxSpeed * boost * this.levelSpeedMul * this.speedWeightMul;
      if (input.throttle < -0.1) {
        this.speed = THREE.MathUtils.damp(this.speed, 0, 4, dt);
      } else {
        this.speed = THREE.MathUtils.damp(this.speed, target, this.stats.accel / (this.boostingNow ? 5 : 8), dt);
      }

      // Project facing onto the ground plane → velocity follows ramps.
      let f = this.forward;
      let slopeF = f.clone().addScaledVector(this.groundNormal, -f.dot(this.groundNormal));

      // A nearly vertical perimeter face can make the projected forward
      // vector approach zero when the rider points straight outward. That
      // leaves the controller grounded with no horizontal velocity, so the
      // wall ray never runs and the rider can hang on the upper transition.
      // Before normalizing, recognize that exact perimeter-only dead zone and
      // roll the rider back downhill into the park with a small speed floor.
      const perimeterInward = this.perimeterInward();
      const surfaceInward = new THREE.Vector3(this.groundNormal.x, 0, this.groundNormal.z);
      const upperPerimeter = perimeterInward !== null
        && this.groundNormal.y < 0.5
        && surfaceInward.lengthSq() > 1e-4
        && surfaceInward.normalize().dot(perimeterInward) > 0.82;
      const facingOutward = perimeterInward !== null && f.dot(perimeterInward) < -0.65;
      if (upperPerimeter && facingOutward && slopeF.lengthSq() < 0.2) {
        this.yaw = Math.atan2(perimeterInward.x, perimeterInward.z);
        this.speed = Math.max(PERIMETER_MIN_SPEED, Math.abs(this.speed));
        f = this.forward;
        slopeF = f.clone().addScaledVector(this.groundNormal, -f.dot(this.groundNormal));
      }
      if (slopeF.lengthSq() < 1e-5 && perimeterInward !== null) slopeF.copy(perimeterInward);
      slopeF.normalize();
      // Slope gravity: uphill bleeds speed, downhill feeds it. The pull
      // fades on steep transitions (normal.y → 0) so quarter pipes and
      // bowls convert speed into launch instead of eating it.
      this.speed -= slopeF.y * 11 * Math.max(0.32, this.groundNormal.y) * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, -2, this.stats.maxSpeed * 2.2 * this.levelSpeedMul * this.speedWeightMul);
      this.vel.copy(slopeF).multiplyScalar(this.speed);

      this.coyoteTimer = 0.12;

      // Ollie (with coyote + buffer forgiveness).
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        this.coyoteTimer = 0; // so an air-tap right after this reads as a flip
        this.vel.y = Math.max(this.vel.y, 0) + this.stats.jumpPower;
        this.beginAir(elapsed);
        // Ollie off a steep transition → stay LOCKED to the ramp (pump in
        // the pipe) instead of clearing the lock like a flat-ground ollie.
        if (this.groundNormal.y < 0.62) {
          this.vertNormal.set(this.groundNormal.x, 0, this.groundNormal.z);
          if (this.vertNormal.lengthSq() > 1e-4) {
            this.vertNormal.normalize();
            this.vertAir = true;
          }
        }
        this.squashVel = 4.5;
        this.events.onJump();
      }
    } else {
      // AIR: gravity + trick spin. Horizontal velocity is preserved;
      // landing forgivingly re-aims it along the new facing.
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -MAX_FALL_SPEED);

      // Vert lock: locked to the ramp you launched off. The across-lip
      // velocity is always pulled back so you rise and drop the SAME face —
      // jump and boost no longer eject you, they just pump and trick in the
      // pipe. Tapping launch (↑ / ⤴) is the ONLY way out: it releases the
      // lock and pops you up-and-out over the lip. Drift ALONG the lip is
      // untouched, so you can still ride off the end of the ramp.
      if (this.vertAir) {
        const vn = this.vel.dot(this.vertNormal);
        if (this.launchBuffer > 0) {
          this.launchBuffer = 0;
          this.vertAir = false;
          this.vel.addScaledVector(this.vertNormal, -VERT_LAUNCH_OUT - vn); // reverse → outward
          this.vel.y = Math.max(this.vel.y, 0) + VERT_LAUNCH_UP;
          this.events.onJump();
        } else {
          const adjusted = THREE.MathUtils.damp(vn, VERT_PULL_IN, 7, dt);
          this.vel.addScaledVector(this.vertNormal, adjusted - vn);
        }
      }
      const spinDelta = -this.steerSmooth * AIR_SPIN_RATE * dt / (1 + this.stackLayers * 0.05);
      this.yaw += spinDelta;
      this.spinAccum += spinDelta;
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

      // Backflip: holding down in the air pitches the whole rig backward.
      // Each full 360° is a scored backflip; keep holding on a big air for
      // doubles/triples. An incomplete rotation on landing scores nothing.
      if (input.throttle < -0.1) {
        this.backflipAccum += BACKFLIP_RATE * dt;
        this.events.onBackflipTick(Math.floor(this.backflipAccum / (Math.PI * 2)));
      }

      // Jump button in the air (standard skate-game trick grammar):
      //   coyote window       → late ollie
      //   + held direction    → flip trick variant (heelflip/shove-it/…)
      //   + grab held, meter  → SPECIAL trick
      if (this.jumpBuffer > 0) {
        if (this.coyoteTimer > 0 && this.vel.y <= 0.5) {
          this.jumpBuffer = 0;
          this.coyoteTimer = 0;
          this.vel.y = this.stats.jumpPower;
          this.beginAir(elapsed);
          this.events.onJump();
        } else if (input.boost && this.specialReadyFn?.() && this.specialAnimT >= SPECIAL_ANIM_TIME) {
          this.jumpBuffer = 0;
          this.specialConsumeFn?.();
          this.specialAnimT = 0;
          let name = 'Rocket Air';
          if (Math.abs(this.steerSmooth) > 0.3) {
            name = 'The 900';
            this.specialSpin = Math.sign(-this.steerSmooth) * 9; // huge auto-spin
          } else if (input.throttle < -0.5) {
            name = 'Christ Air';
          }
          this.vel.y += 2.5; // specials float a little for showtime
          this.events.onSpecial(name);
        } else if (this.flipTime < 0) {
          this.jumpBuffer = 0;
          this.flipTime = 0;
          this.flipCount++;
          this.flipTrick =
            input.throttle < -0.5 ? 'Impossible'
            : this.steerSmooth < -0.3 ? 'Heelflip'
            : this.steerSmooth > 0.3 ? 'Pop Shove-It'
            : 'Kickflip';
        }
      }

      // Special anim timeline (backflip pose + optional 900 auto-spin).
      if (this.specialAnimT < SPECIAL_ANIM_TIME) {
        this.specialAnimT += dt;
        if (this.specialSpin !== 0) {
          const spinDelta = this.specialSpin * dt;
          this.yaw += spinDelta;
          this.spinAccum += spinDelta;
        }
        if (this.specialAnimT >= SPECIAL_ANIM_TIME) this.specialSpin = 0;
      }

      // Flip completes only if we're still airborne when the roll ends.
      if (this.flipTime >= 0) {
        this.flipTime += dt;
        if (this.flipTime >= FLIP_DURATION) {
          this.flipTime = -1;
          this.events.onFlip(this.flipCount > 1 ? `Double ${this.flipTrick}` : this.flipTrick);
        }
      }

      // Grab: hold boost while airborne; the held direction picks the grab.
      const wasGrabbing = this.grabbing;
      this.grabbing = input.boost && this.specialAnimT >= SPECIAL_ANIM_TIME;
      if (this.grabbing && !wasGrabbing) {
        this.grabName =
          this.steerSmooth > 0.3 ? 'Indy Grab'
          : this.steerSmooth < -0.3 ? 'Stalefish'
          : input.throttle < -0.5 ? 'Tail Grab'
          : 'Melon Grab';
      }
      if (this.grabbing) this.grabTime += dt;
      else this.finishGrab();

      // Live move feed: the score system rolls these values up on screen
      // in-place (AIR 12m… SPIN 180°…) until the move ends.
      this.airDistance += this.vel.length() * dt;
      if (elapsed - this.airStart > 0.25) this.events.onAirTick(this.airDistance);
      const degAbs = Math.abs(THREE.MathUtils.radToDeg(this.spinAccum));
      if (degAbs >= 85) this.events.onSpinTick(degAbs);
      if (this.grabbing && this.grabTime > 0.25) this.events.onGrabTick(this.grabName, this.grabTime);

      // Try to catch a rail while descending — but NOT while we're just
      // riding a halfpipe transition up and floating back down (vertAir).
      // That natural pop shouldn't snag the lip; grinds only latch from a
      // deliberate ollie/jump onto the rail (which clears vertAir).
      if (this.vel.y < 1 && !this.vertAir && this.tryStartGrind(elapsed)) return;
    }

    // Integrate + keep inside the park. Airborne motion is SWEPT (raycast
    // along the motion vector) so no speed can ever cross a surface in a
    // single frame — the root cause of falling through ramps.
    if (this.mode === 'air') {
      this.sweepMove(dt);
    } else {
      this.pos.addScaledVector(this.vel, dt);
    }
    this.clampToBounds();

    // Bonk: bounce off walls / rails / anything too steep to ride.
    this.resolveWalls(dt);

    // Failsafe: if we somehow ended up inside geometry, bump back out.
    this.unstick();

    // Ground resolution via multi-hit raycast. While grounded, the stick
    // tolerance grows with speed on steep surfaces so the board HUGS curved
    // transitions continuously (the old code micro-hopped up ramps, and a
    // missed hop at speed could tunnel into them).
    const speedMag = this.vel.length();
    const stick = 0.5 + (1 - this.groundNormal.y) * speedMag * dt * 3.5;
    const ground = this.physics.groundRay(this.pos, this.mode === 'ground' ? stick : 0.5);

    if (this.mode === 'ground') {
      const gap = ground ? this.pos.y - ground.y : Infinity; // + = ground below us
      // Sticking DOWN is only allowed when we aren't flying upward — if the
      // surface falls away while we're climbing fast (kicker crest, ramp
      // lip), that's a LAUNCH, not something to glue ourselves over.
      const launching = gap > 0.05 && this.vel.y > 1.5;
      if (ground && ground.normal.y > 0.28 && Math.abs(gap) <= stick && !launching) {
        this.pos.y = ground.y;
        this.vel.y = 0; // recomputed from the slope next frame
        this.groundNormal.copy(ground.normal);
      } else {
        // Left the ground: rode off a ramp lip or an edge.
        if (this.vel.y > 1.2) this.vel.y *= LAUNCH_BOOST; // ramps throw you
        const steepLaunch = this.groundNormal.y < 0.55 && this.vel.y > 4;
        this.beginAir(elapsed);
        if (steepLaunch) {
          this.vertNormal.set(this.groundNormal.x, 0, this.groundNormal.z);
          if (this.vertNormal.lengthSq() > 1e-4) {
            this.vertNormal.normalize();
            this.vertAir = true;
          }
        }
      }
    } else {
      const falling = this.vel.y <= 0.15;
      const snapDist = Math.max(0.18, -this.vel.y * dt * 2 + 0.08);
      if (ground && ground.normal.y > 0.3 && falling && this.pos.y - ground.y <= snapDist) {
        // land() may bounce us back into the air (ducky) — only snap if not.
        if (!this.land(ground.y, elapsed)) {
          this.pos.y = ground.y;
          this.vel.y = 0;
          this.groundNormal.copy(ground.normal);
          this.mode = 'ground';
          this.vertAir = false;
          // Landing on a ramp transition while still headed UP it (into the
          // wall) would just re-launch you. Flip to roll back DOWN into the
          // pipe instead (the fakie save) so a half-pipe pendulums you the
          // other way. Only kicks in when you're actually facing uphill — a
          // clean downhill landing keeps its own line.
          if (ground.normal.y < 0.85) {
            const downhill = new THREE.Vector3(ground.normal.x, 0, ground.normal.z);
            if (downhill.lengthSq() > 1e-4) {
              downhill.normalize();
              if (this.forward.dot(downhill) < 0.35) {
                this.yaw = Math.atan2(downhill.x, downhill.z);
                this.speed = Math.max(this.speed, 4);
              }
            }
          }
        }
      }
    }

    // Smoothly relax ground normal in air for the visual tilt.
    if (this.mode === 'air') {
      this.groundNormal.lerp(new THREE.Vector3(0, 1, 0), Math.min(1, dt * 4));
    }
  }

  /**
   * Tunneling-proof air integration: raycast along this frame's motion and
   * stop just short of the first surface instead of teleporting past it.
   * Rideable surfaces absorb the into-surface velocity (slide) so the
   * ground snap can land us; steep walls are left for the bonk resolver.
   * One extra raycast per airborne frame — robust AND cheap.
   */
  private sweepMove(dt: number): void {
    const step = this.vel.clone().multiplyScalar(dt);
    const dist = step.length();
    if (dist < 1e-5) return;
    const dir = step.divideScalar(dist);
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const hit = this.physics.wallRay(origin, dir, dist + 0.35, false);
    if (hit && hit.dist < dist + 0.3) {
      this.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.35));
      const up = hit.normal.y >= 0 ? hit.normal : hit.normal.clone().negate();
      if (up.y <= 0.3 && this.isPerimeterImpact(hit.normal)) {
        // A high-speed airborne landing on the near-vertical perimeter does
        // not qualify for the ground snap. Previously the sweep stopped at
        // the face but left the same into-wall velocity intact, so every
        // following frame hit the identical point and AIR distance climbed
        // forever. Remove the into-surface component, give the rider a small
        // inward peel, and keep them dropping so they slide off and land.
        const inward = this.perimeterInward();
        if (inward) {
          const intoSurface = this.vel.dot(hit.normal);
          if (intoSurface < 0) this.vel.addScaledVector(hit.normal, -intoSurface);
          const inwardSpeed = this.vel.x * inward.x + this.vel.z * inward.z;
          if (inwardSpeed < 3) {
            this.vel.x += inward.x * (3 - inwardSpeed);
            this.vel.z += inward.z * (3 - inwardSpeed);
          }
          this.vel.y = Math.min(this.vel.y, -2);
          this.pos.addScaledVector(inward, 0.08);
          this.yaw = Math.atan2(inward.x, inward.z);
          this.speed = Math.max(PERIMETER_MIN_SPEED, this.horizontalSpeed);
          this.vertAir = false;
        }
      } else if (up.y > 0.3) {
        const into = this.vel.dot(up);
        if (into < 0) this.vel.addScaledVector(up, -into); // slide along it
      }
    } else {
      this.pos.addScaledVector(dir, dist);
    }
  }

  private beginAir(elapsed: number): void {
    if (this.mode !== 'air') {
      this.mode = 'air';
      this.airStart = elapsed;
      this.airDistance = 0;
      this.spinAccum = 0;
      this.backflipAccum = 0;
      this.vertAir = false; // launch code re-arms it for steep transitions
    }
  }

  /** Award a held grab (called on release, landing, or rail catch). */
  private finishGrab(): void {
    if (this.grabTime > 0.3) this.events.onGrab(this.grabName, this.grabTime);
    this.grabTime = 0;
  }

  /**
   * Anti-embed failsafe: the park has no legit overhangs, so any solid
   * surface directly overhead means we tunneled INSIDE something (curved
   * ramps were the usual suspect). Pop up onto its top surface.
   */
  private unstick(): void {
    const ceiling = this.physics.ceilingRay(this.pos);
    if (ceiling !== null) {
      this.pos.y = ceiling + 0.15;
      this.vel.y = Math.max(this.vel.y, 0);
      this.speed *= 0.5;
    }
  }

  /** Returns true if the landing turned into a bounce (still airborne). */
  private land(groundY: number, elapsed: number): boolean {
    this.airTime = elapsed - this.airStart;
    const impact = -this.vel.y;
    const spinDeg = Math.abs(THREE.MathUtils.radToDeg(this.spinAccum));

    // A flip that hasn't finished rolling when we touch down scores nothing.
    this.flipTime = -1;
    this.flipCount = 0;
    this.specialAnimT = SPECIAL_ANIM_TIME;
    this.specialSpin = 0;
    this.backflipAccum = 0; // snap the rig upright on touchdown
    this.finishGrab();

    // Ducky bounce: fast landings give a bonus hop instead of sticking.
    if (this.stats.bounce > 0 && impact > 7) {
      this.pos.y = groundY + 0.02;
      this.vel.y = impact * this.stats.bounce * 0.55;
      this.airStart = elapsed; // bounce air counts as new (tiny) air
      this.spinAccum = 0;
      this.squashVel = -6;
      this.events.onBounce();
      this.events.onLand(this.airTime, spinDeg);
      return true;
    }

    // Forgiving landing: keep horizontal speed, re-aim along facing.
    this.speed = Math.max(this.horizontalSpeed * 0.92, this.speed * 0.5);
    this.squashVel = -5 - Math.min(4, impact * 0.3);
    if (this.airTime > 0.25) this.events.onLand(this.airTime, spinDeg);
    this.spinAccum = 0;
    return false;
  }

  /**
   * Wall collision ("bonk"): cast short rays along the horizontal velocity
   * at a few heights. Hitting a surface too steep to ride pushes the player
   * out, reflects + damps the velocity (bounce off and slow down), and
   * turns the character away so auto-forward doesn't drive back in.
   *
   * Ray heights start ABOVE the step-up limit (0.5) so curbs, manual pads
   * and stairs are stepped onto instead of bonked.
   */
  private resolveWalls(dt: number): void {
    const hs = this.horizontalSpeed;
    if (hs < 0.6) return;
    const dir = new THREE.Vector3(this.vel.x / hs, 0, this.vel.z / hs);
    const reach = hs * dt + BONK_SKIN;
    const steepLimit = this.mode === 'ground' ? BONK_NORMAL_Y_GROUND : BONK_NORMAL_Y_AIR;

    for (const h of [0.55, 1.05, 1.7]) {
      const origin = new THREE.Vector3(this.pos.x, this.pos.y + h, this.pos.z);
      const hit = this.physics.wallRay(origin, dir, reach);
      if (!hit) continue;
      // |y| because wallRay flips normals against the ray — a rideable
      // slope hit "from behind" (lathe/trimesh winding) must stay rideable.
      if (Math.abs(hit.normal.y) > steepLimit) continue;
      // Riding along a curve: the next-steeper face of the same transition
      // isn't a wall. Skip when it's close in orientation to our ground.
      if (this.mode === 'ground' && Math.abs(hit.normal.dot(this.groundNormal)) > 0.7) continue;

      const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z);
      if (n.lengthSq() < 1e-4) continue;
      n.normalize();
      if (dir.dot(n) > -0.15) continue; // grazing pass, let it slide

      // The retaining perimeter deliberately finishes in a vertical face.
      // Reaching that face should turn the rider back into the park, but it
      // is part of the rideable transition rather than a wipeout obstacle.
      const perimeterImpact = this.isPerimeterImpact(hit.normal);

      // Push back out to skin distance.
      const depth = BONK_SKIN - hit.dist;
      if (depth > 0) this.pos.addScaledVector(n, depth);

      const vDotN = this.vel.x * n.x + this.vel.z * n.z;

      if (perimeterImpact) {
        // The retaining wall is the continuation of the rideable transition,
        // not an obstacle. Preserve the along-wall component at an angle and
        // redirect only the outward component back into the park. Damping the
        // whole vector here caused repeated contacts to stop riders halfway
        // up the wall; the inward redirect clears the face immediately while
        // the rounded safety boundary remains the absolute no-escape guard.
        if (vDotN < 0) {
          this.vel.x -= (1 + PERIMETER_RETURN) * vDotN * n.x;
          this.vel.z -= (1 + PERIMETER_RETURN) * vDotN * n.z;
        }
        const redirectedSpeed = Math.hypot(this.vel.x, this.vel.z);
        this.speed = Math.max(PERIMETER_MIN_SPEED, redirectedSpeed);
        this.yaw = Math.atan2(this.vel.x, this.vel.z);
        this.squashVel = -2;
        break;
      }

      // True obstacles reflect and remove most of the rider's speed.
      this.vel.x = (this.vel.x - 2 * vDotN * n.x) * 0.35;
      this.vel.z = (this.vel.z - 2 * vDotN * n.z) * 0.35;
      this.speed *= 0.3;

      // Face where we bounced so we ride away from the wall.
      const nhs = Math.hypot(this.vel.x, this.vel.z);
      if (nhs > 0.8) this.yaw = Math.atan2(this.vel.x, this.vel.z);

      this.squashVel = -4; // impact squash
      if (this.bonkEventCooldown <= 0) {
        this.bonkEventCooldown = 0.6;
        this.events.onBonk();
      }
      break;
    }
  }

  /**
   * The controller bounds match the rendered wall path. Detect the shared
   * three-metre transition/wall band (including rounded corners) and
   * make sure the hit normal points inward, so nearby interior obstacles still
   * produce normal burger-down bonks.
   */
  private isPerimeterImpact(hitNormal: THREE.Vector3): boolean {
    const inward = this.perimeterInward();
    if (!inward) return false;
    const horizontalHit = new THREE.Vector3(hitNormal.x, 0, hitNormal.z);
    if (horizontalHit.lengthSq() < 1e-4) return false;
    horizontalHit.normalize();
    return horizontalHit.dot(inward) > 0.82;
  }

  /** Inward horizontal normal while inside the shared 3m perimeter profile. */
  private perimeterInward(): THREE.Vector3 | null {
    const r = Math.max(0, Math.min(this.boundaryCornerRadius, this.bounds.x, this.bounds.z));
    const ax = Math.abs(this.pos.x);
    const az = Math.abs(this.pos.z);
    const cx = this.bounds.x - r;
    const cz = this.bounds.z - r;
    const inward = new THREE.Vector3();
    let inset = Infinity;

    if (r > 0 && ax > cx && az > cz) {
      const dx = ax - cx;
      const dz = az - cz;
      const radialDistance = Math.hypot(dx, dz);
      if (radialDistance > 1e-4) {
        inward.set(-Math.sign(this.pos.x) * dx / radialDistance, 0, -Math.sign(this.pos.z) * dz / radialDistance);
        inset = r - radialDistance;
      }
    } else {
      const insetX = this.bounds.x - ax;
      const insetZ = this.bounds.z - az;
      if (insetX <= insetZ) {
        inward.set(-Math.sign(this.pos.x || 1), 0, 0);
        inset = insetX;
      } else {
        inward.set(0, 0, -Math.sign(this.pos.z || 1));
        inset = insetZ;
      }
    }

    // The physical quarter-circle profile begins three metres inside its wall.
    if (inset < -0.1 || inset > 3.15) return null;
    return inward;
  }

  /**
   * Absolute perimeter failsafe. Collision branches handle normal wall rides,
   * but a mesh seam or a pathological landing can still leave the controller
   * reporting velocity while its actual position remains fixed. Detect the
   * real symptom instead of guessing another collision state: if an active
   * rider has made virtually no positional progress on the elevated wall for
   * a quarter second, peel them inward and downward without a burger-down.
   */
  private recoverPerimeterStall(dt: number, input: InputState, frameStart: THREE.Vector3): void {
    const inward = this.perimeterInward();
    const movement = this.pos.distanceTo(frameStart);
    const movementFloor = Math.max(0.003, dt * 0.25);
    const active = this.mode === 'air' || Math.abs(this.speed) > 1 || this.horizontalSpeed > 1;
    const braking = input.throttle < -0.1;
    const elevatedOnWall = inward !== null && this.pos.y > 0.65;

    if (elevatedOnWall && active && !braking && movement < movementFloor) {
      this.perimeterStallTime += dt;
    } else {
      this.perimeterStallTime = 0;
      return;
    }

    if (this.perimeterStallTime < 0.25 || !inward) return;
    this.pos.addScaledVector(inward, 0.75);
    this.vel.set(inward.x * 6, Math.min(this.vel.y, -2), inward.z * 6);
    this.yaw = Math.atan2(inward.x, inward.z);
    this.speed = 6;
    this.mode = 'air';
    this.vertAir = false;
    this.groundNormal.set(0, 1, 0);
    this.squashVel = -1;
    this.perimeterStallTime = 0;
  }

  private clampToBounds(): void {
    const softBounce = 0.4;
    const r = Math.max(0, Math.min(this.boundaryCornerRadius, this.bounds.x, this.bounds.z));
    const ax = Math.abs(this.pos.x), az = Math.abs(this.pos.z);
    const cx = this.bounds.x - r, cz = this.bounds.z - r;
    let nx = 0, nz = 0;

    if (ax > cx && az > cz && r > 0) {
      // Rounded corner: project onto the actual inset wall arc and reflect
      // across its radial normal. This closes the square-clamp escape pocket.
      const dx = ax - cx, dz = az - cz;
      const dist = Math.hypot(dx, dz);
      if (dist > r) {
        const sx = Math.sign(this.pos.x), sz = Math.sign(this.pos.z);
        nx = -sx * dx / dist;
        nz = -sz * dz / dist;
        this.pos.x = sx * (cx + dx * r / dist);
        this.pos.z = sz * (cz + dz * r / dist);
      }
    } else if (ax > this.bounds.x) {
      nx = -Math.sign(this.pos.x);
      this.pos.x = Math.sign(this.pos.x) * this.bounds.x;
    } else if (az > this.bounds.z) {
      nz = -Math.sign(this.pos.z);
      this.pos.z = Math.sign(this.pos.z) * this.bounds.z;
    }

    if (nx !== 0 || nz !== 0) {
      const into = this.vel.x * nx + this.vel.z * nz;
      if (into < 0) {
        this.vel.x -= (1 + softBounce) * into * nx;
        this.vel.z -= (1 + softBounce) * into * nz;
      }
      this.speed *= 0.5;
      this.yaw = Math.atan2(this.vel.x || nx, this.vel.z || nz);
    }
  }

  /* ------------------------------------------------------------ */
  /* Grinding                                                      */
  /* ------------------------------------------------------------ */

  private tryStartGrind(elapsed: number): boolean {
    if (this.grindCooldown > 0) return false;
    for (const rail of this.rails) {
      // Closest point on the segment to the player, in the horizontal plane.
      const ap = this.pos.clone().sub(rail.a);
      const t = THREE.MathUtils.clamp(ap.dot(rail.dir) / rail.length, 0, 1);
      const point = rail.a.clone().lerp(rail.b, t);
      const horiz = Math.hypot(this.pos.x - point.x, this.pos.z - point.z);
      const dy = this.pos.y - point.y;
      if (horiz < 0.7 && dy > -0.15 && dy < 0.85) {
        // Award any spin done on the way in, then lock on.
        const spinDeg = Math.abs(THREE.MathUtils.radToDeg(this.spinAccum));
        this.events.onLand(elapsed - this.airStart, spinDeg);

        this.mode = 'grind';
        this.vertAir = false;
        this.grindRail = rail;
        this.grindT = t;
        const along = this.vel.dot(rail.dir);
        this.grindDir = along >= 0 ? 1 : -1;
        this.grindSpeed = Math.max(Math.abs(along), this.horizontalSpeed * 0.9, 5.5);
        this.grindTime = 0;
        this.spinAccum = 0;
        this.backflipAccum = 0;
        this.flipTime = -1;
        this.flipCount = 0;
        this.finishGrab();
        this.pos.copy(point);
        this.pos.y = point.y + 0.1;
        // Name the grind by approach: straight = 50-50, sideways =
        // boardslide, quarter-pipe lips get their own callout.
        const alongFacing = Math.abs(this.forward.dot(rail.dir));
        this.grindStance = alongFacing < 0.5 ? 1 : 0;
        const name = rail.label === 'lip' ? 'Lip Grind' : this.grindStance ? 'Boardslide' : '50-50 Grind';
        this.events.onGrindStart(name);
        return true;
      }
    }
    return false;
  }

  private updateGrind(dt: number, elapsed: number): void {
    const rail = this.grindRail!;
    this.grindTime += dt;
    this.grindT += (this.grindDir * this.grindSpeed * dt) / rail.length;
    this.events.onGrindTick(dt);

    const railYaw = Math.atan2(rail.dir.x * this.grindDir, rail.dir.z * this.grindDir);
    // Face along the rail (shortest angular path).
    let dy = railYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);

    this.vel.copy(rail.dir).multiplyScalar(this.grindDir * this.grindSpeed);
    this.vel.y = 0;
    this.speed = this.grindSpeed;

    const endGrind = (popY: number) => {
      this.events.onGrindEnd(this.grindTime);
      this.grindRail = null;
      this.grindCooldown = 0.35; // clear the rail before re-attaching
      this.vel.y = popY;
      this.beginAir(elapsed);
    };

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      endGrind(this.stats.jumpPower * 0.95);
      this.events.onJump();
      return;
    }

    if (this.grindT <= 0 || this.grindT >= 1) {
      this.grindT = THREE.MathUtils.clamp(this.grindT, 0, 1);
      endGrind(2.2);
      return;
    }

    const point = rail.a.clone().lerp(rail.b, this.grindT);
    this.pos.set(point.x, point.y + 0.1, point.z);
  }

  /* ------------------------------------------------------------ */
  /* Character animation ("the juice")                             */
  /* ------------------------------------------------------------ */

  private updateVisuals(dt: number, input: InputState): void {
    const rig = this.rig;
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;

    // Skate Burger: sway/settle the topping tower + fly wipeout debris.
    rig.stack?.update(dt, this.vel, this.yaw);

    // Tilt the whole rig to match the ground slope (in local yaw space).
    const localNormal = this.groundNormal
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const targetTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localNormal);
    this.tiltQuat.slerp(targetTilt, Math.min(1, dt * 8));
    rig.tilt.quaternion.copy(this.tiltQuat);
    // Backflip: pitch the whole rig backward around its local X axis.
    if (this.backflipAccum > 0.0001) {
      rig.tilt.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.backflipAccum),
      );
    }

    // Wobble: pivot at the base so the light top flops around.
    const speedNorm = Math.min(1, this.horizontalSpeed / this.stats.maxSpeed);
    this.wobbleT += dt * (3 + this.horizontalSpeed * 0.9);
    const wob = this.stats.wobble;
    rig.body.rotation.x = Math.sin(this.wobbleT * 1.7) * 0.055 * wob * (0.3 + speedNorm);
    rig.body.rotation.z =
      Math.sin(this.wobbleT) * 0.085 * wob * (0.3 + speedNorm) - this.steerSmooth * 0.32;

    // Grind stance: sideways lean; boardslide turns the deck crossways.
    const targetLean = this.mode === 'grind' ? 0.38 : 0;
    this.grindLean += (targetLean - this.grindLean) * Math.min(1, dt * 10);
    rig.body.rotation.z += this.grindLean;
    const deckYaw = this.mode === 'grind' ? (this.grindStance ? 1.35 : 0.25) : 0;
    rig.board.rotation.y = THREE.MathUtils.damp(rig.board.rotation.y, deckYaw, 10, dt);

    // Flip trick animations — each variant moves the deck differently.
    rig.board.rotation.z = 0;
    rig.board.rotation.x = 0;
    if (this.flipTime >= 0) {
      const p = this.flipTime / FLIP_DURATION;
      switch (this.flipTrick) {
        case 'Heelflip':
          rig.board.rotation.z = Math.PI * 2 * p; // opposite roll
          break;
        case 'Pop Shove-It':
          rig.board.rotation.y += Math.PI * 2 * p; // deck spins flat
          break;
        case 'Impossible':
          rig.board.rotation.x = -Math.PI * 2 * p; // vertical loop
          break;
        default:
          rig.board.rotation.z = -Math.PI * 2 * p; // kickflip roll
      }
    }

    // Special trick pose: full backflip + a proud little rise.
    if (this.specialAnimT < SPECIAL_ANIM_TIME) {
      const p = this.specialAnimT / SPECIAL_ANIM_TIME;
      rig.body.rotation.x += -Math.PI * 2 * p;
      rig.body.position.y = 0.16 + Math.sin(p * Math.PI) * 0.45;
    } else {
      rig.body.position.y = 0.16;
    }

    // Grab: lean back and tip the board while held in the air.
    const grabTarget = this.mode === 'air' && this.grabbing ? 1 : 0;
    this.grabEase += (grabTarget - this.grabEase) * Math.min(1, dt * 8);
    rig.body.rotation.x += -0.5 * this.grabEase;
    rig.board.rotation.x += -0.3 * this.grabEase;

    // Accessory spinners (propeller cap, halo shimmer).
    for (const s of rig.spinners) s.rotation.y += dt * (6 + this.horizontalSpeed * 0.6);

    // Squash & stretch spring (jump stretches, landing squashes).
    this.squashVel += (1 - this.squash) * 90 * dt;
    this.squashVel *= Math.exp(-dt * 9);
    this.squash += this.squashVel * dt;
    this.squash = THREE.MathUtils.clamp(this.squash, 0.55, 1.45);
    rig.body.scale.set(2 - this.squash, this.squash, 2 - this.squash);

    // Wheels spin with speed; float them still during air for style.
    if (this.mode !== 'air') {
      const spin = (this.horizontalSpeed * dt) / 0.075;
      for (const w of rig.wheels) w.rotation.x += spin;
    }

    void input;
  }
}
