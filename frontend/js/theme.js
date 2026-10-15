(() => {
  const storageKey = 'expense-tracker-theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }

  function applyTheme() {
    const theme = preference || (systemTheme.matches ? 'dark' : 'light');
    document.documentElement.dataset.bsTheme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#10221d' : '#153d39';
    const button = document.getElementById('themeToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.classList.toggle('active', theme === 'dark');
      button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to Hulk mode';
    }
    document.dispatchEvent(new Event('themechange'));
  }

  // This script runs in the head so the saved theme is applied before rendering.
  applyTheme();
  systemTheme.addEventListener('change', () => {
    if (!preference) applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.getElementById('themeToggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(storageKey, preference);
      } catch {
        // Keep the choice for this page even if it cannot be saved.
      }
      applyTheme();
    });
  });
})();
