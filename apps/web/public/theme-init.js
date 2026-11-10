/* global document */
/*
 * D383: applies this device's theme choice before the first paint (no flash of the other theme).
 * A same-origin file because the CSP allows no inline script. Mirrors `readThemeChoice` and
 * `applyTheme` in src/theme/theme.ts (theme.test.ts runs this file against them).
 */
(function () {
  var COLORS = { light: '#dde9f2', dark: '#0e1b2e' };
  var choice;
  try {
    choice = localStorage.getItem('gobbit:theme');
  } catch {
    return;
  }
  if (choice !== 'light' && choice !== 'dark') return;
  document.documentElement.setAttribute('data-theme', choice);
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', COLORS[choice]);
})();
