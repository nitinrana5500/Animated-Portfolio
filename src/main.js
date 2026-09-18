import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './style.css';

const TOTAL_FRAMES = 300;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const header = document.querySelector('.site-header');

const images = new Array(TOTAL_FRAMES);
const loaded = new Array(TOTAL_FRAMES).fill(false);

let currentFrame = 0;
let targetFrame = 0;
let lastRenderedFrame = -1;

// Format frame URL: /frames/ezgif-frame-001.png to /frames/ezgif-frame-300.png
function getFrameUrl(index) {
  const frameNum = String(index + 1).padStart(3, '0');
  return `/frames/ezgif-frame-${frameNum}.png`;
}

// Draw the specified frame maintaining aspect ratio (cover mode)
function drawFrame(frameIdx) {
  let img = images[frameIdx];

  // If target frame is not loaded yet, find the nearest loaded frame
  if (!img || !loaded[frameIdx]) {
    let nearestIdx = -1;
    let minDiff = Infinity;
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (loaded[i]) {
        const diff = Math.abs(i - frameIdx);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      }
    }
    if (nearestIdx !== -1) {
      img = images[nearestIdx];
    } else {
      return;
    }
  }

  if (!img || !img.complete || img.naturalWidth === 0) return;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const imgWidth = img.naturalWidth;
  const imgHeight = img.naturalHeight;

  const canvasRatio = canvasWidth / canvasHeight;
  const imgRatio = imgWidth / imgHeight;

  let renderWidth, renderHeight, offsetX, offsetY;

  if (canvasRatio > imgRatio) {
    renderWidth = canvasWidth;
    renderHeight = canvasWidth / imgRatio;
    offsetX = 0;
    offsetY = (canvasHeight - renderHeight) / 2;
  } else {
    renderHeight = canvasHeight;
    renderWidth = canvasHeight * imgRatio;
    offsetX = (canvasWidth - renderWidth) / 2;
    offsetY = 0;
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
  lastRenderedFrame = frameIdx;
}

// Adjust canvas dimensions for screen size and device pixel ratio
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  drawFrame(Math.round(currentFrame));
}

// Progressive image loading strategy
function preloadImages() {
  // 1. Load the very first frame immediately
  const firstImg = new Image();
  firstImg.src = getFrameUrl(0);
  firstImg.onload = () => {
    images[0] = firstImg;
    loaded[0] = true;
    drawFrame(0);
  };

  // Helper to load a specific index
  const loadSingle = (index) => {
    if (images[index]) return;
    const img = new Image();
    img.src = getFrameUrl(index);
    images[index] = img;
    img.onload = () => {
      loaded[index] = true;
      if (Math.round(currentFrame) === index) {
        drawFrame(index);
      }
    };
  };

  // 2. Preload every 5th frame first (keyframe anchors for quick scrubbing)
  for (let i = 1; i < TOTAL_FRAMES; i += 5) {
    loadSingle(i);
  }

  // 3. Preload all remaining frames
  for (let i = 1; i < TOTAL_FRAMES; i++) {
    if (i % 5 !== 0) {
      loadSingle(i);
    }
  }
}

// Initialize Lenis smooth scroll
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  smoothTouch: true,
  touchMultiplier: 1.5,
});

// Update scroll frame and header state
function handleScrollProgress(scrollY) {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
  targetFrame = progress * (TOTAL_FRAMES - 1);

  if (header) {
    if (scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }
}

lenis.on('scroll', (e) => {
  handleScrollProgress(e.scroll);
});

// Fallback scroll listener
window.addEventListener('scroll', () => {
  handleScrollProgress(window.scrollY || window.pageYOffset);
}, { passive: true });

// Animation loop with smooth linear interpolation (lerp)
function animate(time) {
  lenis.raf(time);

  // Smooth lerp towards target frame
  const diff = targetFrame - currentFrame;
  if (Math.abs(diff) > 0.001) {
    currentFrame += diff * 0.12;
  } else {
    currentFrame = targetFrame;
  }

  const frameToRender = Math.round(currentFrame);
  if (frameToRender !== lastRenderedFrame) {
    drawFrame(frameToRender);
  }

  requestAnimationFrame(animate);
}

// Smooth scroll for nav anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId && targetId !== '#') {
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        lenis.scrollTo(targetEl, { offset: -60, duration: 1.4 });
      }
    }
  });
});

// Initialize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
preloadImages();
requestAnimationFrame(animate);
