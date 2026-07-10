const screens = [
  'home',
  'onboarding',
  'looks',
  'spots',
  'hud',
  'pause',
  'settings',
  'tricks',
  'shop',
  'jukebox',
  'results',
];

const labels = {
  home: '01 · HOME',
  onboarding: '02 · FIRST RUN',
  looks: '03 · LOOKS',
  spots: '04 · SPOT SELECT',
  hud: '05 · GAMEPLAY HUD',
  pause: '06 · PAUSE',
  settings: '07 · SETTINGS',
  tricks: '08 · TRICK BOOK',
  shop: '09 · SHOP',
  jukebox: '10 · JUKEBOX',
  results: '11 · RESULTS',
};

const screenNodes = [...document.querySelectorAll('[data-screen]')];
const targetButtons = [...document.querySelectorAll('[data-screen-target]')];
const navButtons = [...document.querySelectorAll('.screen-nav [data-screen-target]')];
const label = document.querySelector('#current-screen-label');

let current = screens.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';

function showScreen(name, updateHash = true) {
  if (!screens.includes(name)) return;
  current = name;
  screenNodes.forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === name));
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.screenTarget === name));
  if (label) label.textContent = labels[name];
  if (updateHash) history.replaceState(null, '', `#${name}`);
}

targetButtons.forEach((button) => {
  button.addEventListener('click', () => showScreen(button.dataset.screenTarget));
});

document.querySelector('#previous-screen')?.addEventListener('click', () => {
  const index = screens.indexOf(current);
  showScreen(screens[(index - 1 + screens.length) % screens.length]);
});

document.querySelector('#next-screen')?.addEventListener('click', () => {
  const index = screens.indexOf(current);
  showScreen(screens[(index + 1) % screens.length]);
});

document.querySelector('[data-tutorial-next]')?.addEventListener('click', () => {
  const title = document.querySelector('.tutorial-step h2');
  const copy = document.querySelector('.tutorial-step p');
  const count = document.querySelector('.step-count');
  const dots = [...document.querySelectorAll('.tutorial-dots i')];
  const next = document.querySelector('[data-tutorial-next]');
  const step = Number(next.dataset.step ?? 1) + 1;

  next.dataset.step = String(step);
  dots.forEach((dot, index) => dot.classList.toggle('active', index === step - 1));

  if (step === 2) {
    count.textContent = '2 / 3';
    title.textContent = 'POP';
    copy.textContent = 'Tap the big button to ollie.';
    next.textContent = 'NEXT';
  } else if (step === 3) {
    count.textContent = '3 / 3';
    title.textContent = 'LAND IT';
    copy.textContent = 'Stay level to keep your toppings.';
    next.textContent = 'LET’S RIDE';
  } else {
    showScreen('hud');
    next.dataset.step = '1';
    count.textContent = '1 / 3';
    title.textContent = 'STEER';
    copy.textContent = 'Drag anywhere on the left side.';
    next.textContent = 'NEXT';
    dots.forEach((dot, index) => dot.classList.toggle('active', index === 0));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const index = screens.indexOf(current);
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  showScreen(screens[(index + delta + screens.length) % screens.length]);
});

window.addEventListener('hashchange', () => showScreen(location.hash.slice(1), false));
showScreen(current, false);
