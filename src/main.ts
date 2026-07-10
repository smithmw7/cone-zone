/**
 * Entry point: boot the game app (async because Rapier's WASM module
 * needs to initialize before the physics world exists).
 */
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-900.css';
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
// Debug/test handles used by the deterministic web-game validation loop.
const debugWindow = window as unknown as {
  skateBurger: GameApp;
  render_game_to_text: () => string;
  advanceTime: (ms: number) => void;
};
debugWindow.skateBurger = app;
debugWindow.render_game_to_text = () => app.renderToText();
debugWindow.advanceTime = (ms) => app.advanceTime(ms);

app.start().catch((err) => {
  console.error('Failed to start Skate Burger:', err);
  container.innerHTML = `<div style="color:#fff;font-family:sans-serif;padding:24px">
    Failed to start the game. Check the console for details.</div>`;
});
