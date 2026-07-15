import { gsap } from 'gsap';

/** GSAP owns DOM presentation motion; frame-coupled world simulation stays in the game loop. */

function removeAnimatedNode(node: HTMLElement): void {
  gsap.killTweensOf([node, ...node.querySelectorAll('*')]);
  node.remove();
}

export function makeMeterTween(target: HTMLElement, initial: number): (value: number) => void {
  gsap.set(target, { scaleX: initial, transformOrigin: 'left center' });
  const quickTo = gsap.quickTo(target, 'scaleX', { duration: 0.12, ease: 'none' });
  return (value: number) => quickTo(Math.min(1, Math.max(0, value)));
}

export function animateOverlay(overlay: HTMLElement, open: boolean): void {
  const sheet = overlay.firstElementChild as HTMLElement | null;
  gsap.killTweensOf([overlay, sheet].filter(Boolean));
  if (open) {
    overlay.classList.remove('hidden');
    gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, ease: 'power1.out' });
    if (sheet) {
      gsap.fromTo(
        sheet,
        { autoAlpha: 0, scale: 0.94, y: 8 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.2, ease: 'back.out(1.35)' },
      );
    }
    return;
  }

  const timeline = gsap.timeline({
    onComplete: () => {
      overlay.classList.add('hidden');
      gsap.set([overlay, sheet].filter(Boolean), { clearProps: 'opacity,visibility,transform' });
    },
  });
  if (sheet) timeline.to(sheet, { autoAlpha: 0, scale: 0.96, y: 6, duration: 0.12, ease: 'power1.in' });
  timeline.to(overlay, { autoAlpha: 0, duration: 0.12, ease: 'power1.in' }, sheet ? '<' : 0);
}

export function animateEqualizer(card: HTMLElement, active: boolean): void {
  const bars = [...card.querySelectorAll<HTMLElement>('.album-eq i')];
  gsap.killTweensOf(bars);
  if (!active) {
    gsap.set(bars, { scaleY: 0.35 });
    return;
  }
  bars.forEach((bar, index) => {
    gsap.fromTo(
      bar,
      { scaleY: 0.35 },
      { scaleY: 1, duration: 0.45, delay: index * 0.15, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    );
  });
}

export function animateDenied(chip: HTMLElement, balances: HTMLElement[]): void {
  gsap.killTweensOf(chip);
  gsap.timeline({ onComplete: () => gsap.set(chip, { clearProps: 'transform' }) })
    .to(chip, { x: -5, duration: 0.08 })
    .to(chip, { x: 5, duration: 0.08 })
    .to(chip, { x: -3, duration: 0.08 })
    .to(chip, { x: 0, duration: 0.08 });

  for (const balance of balances) {
    gsap.killTweensOf(balance);
    gsap.timeline({ onComplete: () => gsap.set(balance, { clearProps: 'transform,color' }) })
      .to(balance, { color: '#ff2b2b', scale: 1.15, duration: 0.22, ease: 'power2.out' })
      .to(balance, { scale: 1, duration: 0.22, ease: 'power2.in' });
  }
}

export function setPulse(target: HTMLElement, active: boolean, scale = 1.1, opacity = 1): void {
  gsap.killTweensOf(target);
  if (active) {
    gsap.to(target, { scale, opacity, duration: 0.55, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  } else {
    gsap.set(target, { scale: 1, opacity: 1, clearProps: 'transform,opacity' });
  }
}

export function animateToast(node: HTMLElement): void {
  gsap.timeline({ onComplete: () => removeAnimatedNode(node) })
    .fromTo(node, { autoAlpha: 0, xPercent: -50, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'back.out(1.8)' })
    .to(node, { autoAlpha: 0, y: -18, duration: 0.25, ease: 'power2.in' }, '+=0.9');
}

export function animateMoveRow(row: HTMLElement): void {
  gsap.fromTo(row, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'back.out(1.7)', clearProps: 'opacity,visibility,transform' });
}

export function animatePointsFly(node: HTMLElement, voided: boolean): void {
  const duration = voided ? 0.85 : 1.15;
  const timeline = gsap.timeline({ onComplete: () => removeAnimatedNode(node) });
  timeline
    .set(node, { autoAlpha: 0, xPercent: -50, yPercent: -100, y: 0, scale: 0.5 })
    .to(node, { autoAlpha: 1, scale: 1.2, duration: duration * 0.15, ease: 'power2.out' })
    .to(node, { scale: 1, duration: duration * 0.15, ease: 'power1.out' })
    .to(node, { autoAlpha: 0, y: -110, scale: 0.95, duration: duration * 0.7, ease: 'power2.in' });
}

export function animateScoreBump(node: HTMLElement): void {
  gsap.killTweensOf(node);
  gsap.timeline({ onComplete: () => gsap.set(node, { clearProps: 'transform,color' }) })
    .to(node, { scale: 1.25, color: '#ffce3d', duration: 0.14, ease: 'power2.out' })
    .to(node, { scale: 1, duration: 0.21, ease: 'power2.in' });
}

export function animateTrickPopup(node: HTMLElement, drift: number, tilt: number): void {
  gsap.timeline({ onComplete: () => removeAnimatedNode(node) })
    .set(node, { autoAlpha: 0, xPercent: -50, x: 0, y: 20, scale: 0.5, rotation: tilt })
    .to(node, { autoAlpha: 1, y: 0, scale: 1.15, duration: 0.17, ease: 'back.out(1.8)' })
    .to(node, { y: -8, scale: 1, duration: 0.16, ease: 'power1.out' })
    .to(node, { autoAlpha: 0, x: drift, y: -90, scale: 0.9, duration: 0.77, ease: 'power2.in' });
}

export function spinCoin(coin: HTMLElement): void {
  const inner = coin.querySelector<HTMLElement>('.coin-3d-inner');
  if (!inner) return;
  gsap.set(inner, { rotationY: -16, rotationZ: -8, transformOrigin: '50% 50%' });
  gsap.to(inner, { rotationZ: 352, duration: 2.2, repeat: -1, ease: 'none' });
  gsap.to(inner, { rotationY: 16, duration: 0.62, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

export function animateCoinCallout(node: HTMLElement): void {
  gsap.timeline({ onComplete: () => removeAnimatedNode(node) })
    .set(node, { autoAlpha: 0, xPercent: -50, y: 0, scale: 0.5 })
    .to(node, { autoAlpha: 1, scale: 1.2, duration: 0.2, ease: 'back.out(1.8)' })
    .to(node, { scale: 1, duration: 0.2, ease: 'power1.out' })
    .to(node, { autoAlpha: 0, y: -130, scale: 0.95, duration: 0.9, ease: 'power2.in' });
}

export function animateCoinFly(node: HTMLElement, arc: number, durationMs: number, delayMs: number): void {
  const source = node.getBoundingClientRect();
  const hudCoin = node.closest('.hud')?.querySelector('.hud-cones .ui-icon');
  const target = hudCoin?.getBoundingClientRect();
  const targetX = target
    ? target.left + target.width / 2 - (source.left + source.width / 2)
    : -window.innerWidth * 0.45;
  const targetY = target
    ? target.top + target.height / 2 - (source.top + source.height / 2)
    : -window.innerHeight * 0.44;
  const duration = durationMs / 1000;

  gsap.timeline({ delay: delayMs / 1000, onComplete: () => removeAnimatedNode(node) })
    .set(node, { autoAlpha: 0, x: 0, y: 0, scale: 0.4 })
    .to(node, { autoAlpha: 1, scale: 1.08, duration: duration * 0.18, ease: 'back.out(1.7)' })
    .to(node, { x: targetX * 0.55 + arc, y: targetY * 0.45, scale: 1, duration: duration * 0.3, ease: 'power2.out' }, 0)
    .to(node, { x: targetX, y: targetY, scale: 0.82, autoAlpha: 0, duration: duration * 0.7, ease: 'power3.in' }, duration * 0.3);
}
