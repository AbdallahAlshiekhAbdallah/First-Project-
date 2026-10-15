(() => {
  const button = document.getElementById('themeToggle');
  const overlay = document.getElementById('hulkTransition');
  const video = document.getElementById('hulkTransitionVideo');
  const skip = document.getElementById('skipHulkTransition');
  if (!button || !overlay || !video || !skip) return;

  const fallbackSound = new Audio('audio/hulk.wav?v=2');
  fallbackSound.preload = 'auto';
  fallbackSound.loop = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pageRegions = [document.querySelector('nav'), document.querySelector('main'),
    document.getElementById('editExpenseModal')].filter(Boolean);
  let active = false;
  let runId = 0;
  let timeoutId = null;
  let previousFocus = null;
  let previousInert = [];

  function stopMedia(media) {
    media.pause();
    // An unavailable source may not have a seekable timeline yet.
    if (media.readyState > 0) media.currentTime = 0;
  }

  function finish() {
    runId += 1;
    clearTimeout(timeoutId);
    timeoutId = null;
    stopMedia(video);
    stopMedia(fallbackSound);
    if (!active) return;
    active = false;
    overlay.hidden = true;
    overlay.classList.remove('is-fading');
    document.body.classList.remove('hulk-transition-active');
    pageRegions.forEach((region, index) => { region.inert = previousInert[index]; });
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function start(event) {
    if (!event.isTrusted || document.hidden) return;
    if (document.documentElement.dataset.bsTheme !== 'light') {
      finish();
      return;
    }
    if (active) return;
    finish();
    const currentRun = ++runId;
    if (reducedMotion.matches) {
      // Without the animation, keep the short word-only confirmation.
      fallbackSound.play().catch(() => {});
      return;
    }

    active = true;
    previousFocus = document.activeElement;
    previousInert = pageRegions.map(region => region.inert);
    overlay.hidden = false;
    overlay.classList.remove('is-fading');
    document.body.classList.add('hulk-transition-active');
    skip.focus({ preventScroll: true });
    pageRegions.forEach(region => { region.inert = true; });
    // The voice and impact share this file's timeline so buffering cannot
    // make "smash" drift away from the punch. Never play separate audio here.
    video.muted = false;
    video.play().catch(() => {
      if (runId === currentRun) finish();
    });
    // Always release the page even if a download stalls or the video cannot finish.
    timeoutId = setTimeout(() => {
      if (runId === currentRun) finish();
    }, 9000);
  }

  // Capture reads the theme before the normal button handler changes it.
  button.addEventListener('click', start, { capture: true });
  skip.addEventListener('click', finish);
  video.addEventListener('ended', () => { if (active) finish(); });
  video.addEventListener('error', () => { if (active) finish(); });
  video.addEventListener('timeupdate', () => {
    if (active && Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.45) {
      overlay.classList.add('is-fading');
    }
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      skip.focus();
    }
  });
  document.addEventListener('themechange', () => {
    if (document.documentElement.dataset.bsTheme === 'light') finish();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) finish();
  });
  window.addEventListener('pagehide', finish);
})();
