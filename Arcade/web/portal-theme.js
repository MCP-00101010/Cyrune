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
      for (const [key, value] of Object.entries(theme.variables)) {
        style.setProperty(key, value);
        if (/^--(?:base|hub-name|title|bookmark)-font-size$/.test(key) && /^\d+(?:\.\d+)?px$/.test(value)) {
          style.setProperty(key.replace('--', '--arcade-'), `${parseFloat(value) / 16}rem`);
        }
      }
      const probe = document.createElement('span');
      // Resolve the committed accent itself: high contrast may temporarily mask
      // --accent, and turning it off must still leave a readable primary button.
      probe.style.color = theme.variables['--accent'] || 'var(--accent)'; probe.hidden = true; document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [109,124,255];
      probe.remove();
      const luminance = rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      style.setProperty('--primary-foreground', luminance > .179 ? '#000' : '#fff');
      globalThis.ArcadeAppearance?.refresh();
      style.colorScheme = theme.colorScheme;
      document.documentElement.dataset.portalTheme = theme.colorScheme;
    } catch { /* Keep the existing appearance while Relay reconnects. */ }
  }
  window.addEventListener('cyrune:portal-theme-changed', refreshPortalTheme);
  window.addEventListener('pageshow', refreshPortalTheme);
  void refreshPortalTheme();
})();
