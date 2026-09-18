import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './style.css';

/* ─────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────── */
const TOTAL_FRAMES = 300;
// Minimum % of frames loaded before we unlock scrolling
const MIN_LOADED_PERCENT = 0.25; // 25% = 75 frames
// Max frames the animation can jump per RAF tick (prevents freeze-frame skip)
const MAX_FRAME_JUMP = 6;

/* ─────────────────────────────────────────────────────────
   CANVAS SETUP
───────────────────────────────────────────────────────── */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
const header = document.querySelector('.site-header');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderCount = document.getElementById('loader-count');

const images = new Array(TOTAL_FRAMES).fill(null);
const loaded = new Array(TOTAL_FRAMES).fill(false);
let loadedCount = 0;

let currentFrame = 0;
let targetFrame = 0;
let lastRenderedFrame = -1;
let scrollUnlocked = false;

/* ─────────────────────────────────────────────────────────
   URL HELPER
───────────────────────────────────────────────────────── */
function getFrameUrl(index) {
  const n = String(index + 1).padStart(3, '0');
  return `/frames/ezgif-frame-${n}.png`;
}

/* ─────────────────────────────────────────────────────────
   DRAW FRAME  (cover + nearest-loaded fallback)
───────────────────────────────────────────────────────── */
function drawFrame(frameIdx) {
  let img = images[frameIdx];

  if (!img || !loaded[frameIdx]) {
    // Walk outward to find closest loaded frame
    for (let delta = 1; delta < TOTAL_FRAMES; delta++) {
      const lo = frameIdx - delta;
      const hi = frameIdx + delta;
      if (lo >= 0 && loaded[lo]) { img = images[lo]; break; }
      if (hi < TOTAL_FRAMES && loaded[hi]) { img = images[hi]; break; }
    }
  }

  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = cw / ch;

  let rw, rh, ox, oy;
  if (cr > ir) {
    rw = cw; rh = cw / ir; ox = 0; oy = (ch - rh) / 2;
  } else {
    rh = ch; rw = ch * ir; oy = 0; ox = (cw - rw) / 2;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, ox, oy, rw, rh);
  lastRenderedFrame = frameIdx;
}

/* ─────────────────────────────────────────────────────────
   CANVAS RESIZE
───────────────────────────────────────────────────────── */
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawFrame(Math.round(currentFrame));
}

/* ─────────────────────────────────────────────────────────
   LOADER UI
───────────────────────────────────────────────────────── */
function updateLoader() {
  const pct = loadedCount / TOTAL_FRAMES;
  const display = Math.round(pct * 100);
  if (loaderBar) loaderBar.style.width = `${display}%`;
  if (loaderCount) loaderCount.textContent = `${display}%`;

  // Unlock scroll once threshold met
  if (!scrollUnlocked && pct >= MIN_LOADED_PERCENT) {
    scrollUnlocked = true;
    lenis.start();
    // Fade out loader
    if (loader) {
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
      setTimeout(() => { if (loader) loader.style.display = 'none'; }, 600);
    }
  }

  // Fully hide loader when all done
  if (pct >= 1 && loader) {
    loader.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────────────────
   SEQUENTIAL PRELOADER
   Loads frames in strict order: 0,1,2,3… so early frames
   are always ready for the user's first scroll.
───────────────────────────────────────────────────────── */
const CONCURRENT = 6; // parallel requests at a time
let nextToLoad = 0;

function loadNext() {
  if (nextToLoad >= TOTAL_FRAMES) return;
  const index = nextToLoad++;

  const img = new Image();
  img.decoding = 'async';
  img.src = getFrameUrl(index);
  images[index] = img;

  img.onload = () => {
    loaded[index] = true;
    loadedCount++;
    updateLoader();
    // If this is the frame we're currently showing, redraw
    if (Math.round(currentFrame) === index) drawFrame(index);
    // Queue next
    loadNext();
  };

  img.onerror = () => {
    // Skip broken frame, still count it so we don't hang
    loaded[index] = false;
    loadedCount++;
    updateLoader();
    loadNext();
  };
}

function preloadImages() {
  // Spawn CONCURRENT parallel loading pipelines
  for (let i = 0; i < CONCURRENT; i++) loadNext();
}

/* ─────────────────────────────────────────────────────────
   LENIS SMOOTH SCROLL  (paused until threshold loaded)
───────────────────────────────────────────────────────── */
const lenis = new Lenis({
  duration: 1.4,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  smoothTouch: false,      // touch scroll can be jerky on mobile
  touchMultiplier: 1.2,
});

// Start paused — will be resumed by updateLoader() once threshold met
lenis.stop();

function handleScrollProgress(scrollY) {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
  targetFrame = progress * (TOTAL_FRAMES - 1);

  if (header) {
    header.classList.toggle('scrolled', scrollY > 40);
  }
}

lenis.on('scroll', (e) => handleScrollProgress(e.scroll));

window.addEventListener('scroll', () => {
  handleScrollProgress(window.scrollY || window.pageYOffset);
}, { passive: true });

/* ─────────────────────────────────────────────────────────
   ANIMATION LOOP
   - Lerp towards target frame
   - Clamp max jump to MAX_FRAME_JUMP so unloaded gaps don't
     cause a massive skip leaving a blank canvas
───────────────────────────────────────────────────────── */
function animate(time) {
  lenis.raf(time);

  const diff = targetFrame - currentFrame;

  if (Math.abs(diff) > 0.05) {
    // Clamp the per-frame movement so we never jump past unloaded frames
    const step = Math.sign(diff) * Math.min(Math.abs(diff) * 0.14, MAX_FRAME_JUMP);
    currentFrame += step;
  } else {
    currentFrame = targetFrame;
  }

  currentFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, currentFrame));

  const frameToRender = Math.round(currentFrame);
  if (frameToRender !== lastRenderedFrame) {
    drawFrame(frameToRender);
  }

  requestAnimationFrame(animate);
}

/* ─────────────────────────────────────────────────────────
   NAV ANCHOR SCROLL
───────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const id = anchor.getAttribute('href');
    if (id && id !== '#') {
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el, { offset: -64, duration: 1.5 });
      }
    }
  });
});

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
preloadImages();
requestAnimationFrame(animate);
