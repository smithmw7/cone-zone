/**
 * Entry point: boot the game app (async because Rapier's WASM module
 * needs to initialize before the physics world exists).
 */
import './style.css';
import { GameApp } from './GameApp';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Mobile-browser hardening: kill the default gestures that fight a
// portrait touch game (long-press menus, double-tap zoom, pinch zoom).
// Scrollable UI panels keep working — their own touch-action allows it.
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch
document.addEventListener(
  'touchmove',
  (e) => {
    // Allow native touch scrolling inside the scrollable panels/rows:
    // the customization sheet, pause card, level carousel and jukebox grid.
    // Everything else stays locked so the game doesn't pan/zoom.
    const scrollable = '.customize-panel, .pause-card, .select-grid, .music-grid';
    if (!(e.target as HTMLElement).closest?.(scrollable)) e.preventDefault();
  },
  { passive: false },
);

const app = new GameApp(container);
// Debug handle for poking at the running game from the console.
(window as unknown as { coneZone: GameApp }).coneZone = app;

app.start().catch((err) => {
  console.error('Failed to start Cone Zone:', err);
  container.innerHTML = `<div style="color:#fff;font-family:sans-serif;padding:24px">
    Failed to start the game. Check the console for details.</div>`;
});
