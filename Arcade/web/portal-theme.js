(() => {
  'use strict';
  let generation = 0;
  async function refreshPortalTheme() {
    const current = ++generation;
    try {
      const response = await globalThis.ArcadeTransport.request('MW_EMUGUI_GET_PORTAL_THEME');
      const theme = response.theme;
      if (current !== generation || response.ok === false || theme?.schemaVersion !== 1
          || !['dark', 'light'].includes(theme.colorScheme) || !theme.variables) return;
      const style = document.documentElement.style;
      for (const [key, value] of Object.entries(theme.variables)) style.setProperty(key, value);
      style.colorScheme = theme.colorScheme;
      document.documentElement.dataset.portalTheme = theme.colorScheme;
    } catch { /* Keep the existing appearance while Relay reconnects. */ }
  }
  window.addEventListener('cyrune:portal-theme-changed', refreshPortalTheme);
  window.addEventListener('pageshow', refreshPortalTheme);
  void refreshPortalTheme();
})();
