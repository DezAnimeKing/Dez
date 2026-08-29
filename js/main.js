/* Boot: the cover, the router, and the saved indicator. */

import * as store from './store.js';
import * as router from './router.js';
import { el, toast } from './ui.js';
import * as contents from './views/contents.js';
import * as collection from './views/collection.js';
import * as pageView from './views/page.js';
import * as settings from './views/settings.js';

const $ = (id) => document.getElementById(id);
const view = () => $('view');

/* ------------------------------------------------------- saved indicator */

const SAVER_TEXT = { idle: 'Ready', saving: 'Saving…', saved: 'Saved', error: 'Not saved' };
let savedTimer;

store.on('save-state', (state) => {
  const saver = $('saver');
  saver.dataset.state = state;
  $('saver-text').textContent = SAVER_TEXT[state] || state;
  clearTimeout(savedTimer);
  if (state === 'saved') {
    savedTimer = setTimeout(() => {
      saver.dataset.state = 'idle';
      $('saver-text').textContent = SAVER_TEXT.idle;
    }, 2200);
  }
});

store.on('error', (err) => toast(`Storage error: ${err.message}`, { duration: 12000 }));

/* ------------------------------------------------------------------ cover */

async function paintCover() {
  const world = store.getWorld();
  $('cover-title').textContent = world.title || 'The Compendium';
  $('cover-subtitle').textContent = world.subtitle || '';
  document.title = world.title || 'The Compendium';
  const cover = $('cover');
  const url = world.coverImageId ? await store.imageUrl(world.coverImageId) : null;
  cover.style.backgroundImage = url ? `url("${url}")` : '';
  cover.classList.toggle('cover--imageless', !url);
}

/* The cover is the app's front door: routes render behind it and are only
 * revealed once it has been opened, so landing on the book's first screen
 * does not skip past the cover. */
let bookOpen = false;

function openBook() {
  bookOpen = true;
  $('cover').hidden = true;
  $('app').hidden = false;
  if (!location.hash || location.hash === '#/') router.resolve();
  else router.go(location.hash.slice(1));
}

function showCover() {
  bookOpen = false;
  $('cover').hidden = false;
  $('app').hidden = true;
}

addEventListener('cover-changed', paintCover);

/* ----------------------------------------------------------------- routes */

/* Views clear the container and then await their data, so two renders that
 * overlap would interleave and paint the page twice. Renders are therefore
 * queued, and a render that has been superseded before it starts is
 * dropped rather than drawn. */
let navSeq = 0;
let rendering = Promise.resolve();

const withChrome = (fn) => (params) => {
  const mine = ++navSeq;
  // .catch first: one failed render must never freeze every later one.
  rendering = rendering.catch(() => {}).then(async () => {
    if (mine !== navSeq) return;
    if (bookOpen) { $('cover').hidden = true; $('app').hidden = false; }
    window.scrollTo({ top: 0 });
    try {
      await fn(view(), params);
    } catch (err) {
      console.error(err);
      view().replaceChildren(el('div', 'sheet', `This view failed to render: ${err.message}`));
    }
  });
  return rendering;
};

router.route('/', withChrome((container) => contents.render(container)));
router.route('/characters', withChrome((container) => collection.render(container, 'character')));
router.route('/regions', withChrome((container) => collection.render(container, 'region')));
router.route('/systems', withChrome((container) => collection.render(container, 'system')));
router.route('/timeline', withChrome((container) => collection.renderPlaceholder(container, 'event')));
router.route('/story', withChrome((container) => collection.renderPlaceholder(container, 'scene')));
router.route('/gallery', withChrome((container) => collection.renderPlaceholder(container, 'image')));
router.route('/settings', withChrome((container) => settings.render(container)));
router.route('/page/:id', withChrome((container, params) => pageView.render(container, params.id)));
// [[Page#Heading]] arrives here: the same page, scrolled to that heading.
router.route('/page/:id/:anchor', withChrome((container, params) => pageView.render(container, params.id, params.anchor)));
router.fallback(() => router.go('/', { replace: true }));

/* ------------------------------------------------------------------- boot */

async function boot() {
  try {
    await store.init();
    await paintCover();
  } catch (err) {
    document.body.prepend(el('div', 'banner', `The Compendium could not open its storage: ${err.message}`));
    return;
  }

  $('open-book').addEventListener('click', openBook);
  $('to-cover').addEventListener('click', () => { store.flush(); showCover(); });
  $('to-settings').addEventListener('click', () => router.go('/settings'));
  $('to-contents').addEventListener('click', () => router.go('/'));

  // A deep link — a bookmarked page — opens the book at that page. The
  // chrome is revealed directly: router.start() does the one resolve.
  if (location.hash && location.hash !== '#/') {
    bookOpen = true;
    $('cover').hidden = true;
    $('app').hidden = false;
  }
  router.start();
}

addEventListener('pagehide', () => { store.flush(); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

boot();
