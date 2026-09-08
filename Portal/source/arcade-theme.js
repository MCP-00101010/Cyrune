// A presentation-only projection of a committed Portal snapshot. No board data,
// background media, native paths or settings-editor draft state crosses to Arcade.
function createArcadeThemeProjection(settings = {}) {
  const theme = BUILTIN_THEMES.find(item => item.id === settings.activeThemeName)
    || (Array.isArray(settings.customThemes) && settings.customThemes.find(item => item.id === settings.activeThemeName))
    || BUILTIN_THEMES[0];
  const c = theme.colors;
  const style = normalizeThemeStyleSettings(settings.themeStyleProfilesMigrated
    ? settings.themeStyleProfiles?.[theme.id] : buildLegacyThemeStyleSettings(settings));
  const overrides = style.styleOverrides;
  const preset = ({ small: [12,16,11,13], medium: [14,18,12,14], large: [16,21,14,16] })[style.globalFontScale] || [14,18,12,14];
  const text = style.globalFontColorFromTheme === false ? style.globalFontColor || c.text : c.accent;
  const variables = {
    '--bg': c.bg, '--panel': c.panel, '--panel-2': c.panelStrong,
    '--panel-muted': c.panelMuted, '--line': c.border, '--text': text,
    '--muted': c.textMuted, '--accent': c.accent, '--accent-strong': c.accentStrong,
    '--danger': c.danger, '--radius': c.radius || '18px',
    '--shadow': c.shadow || '0 20px 40px rgba(0,0,0,0.35)',
    '--base-font-size': `${preset[0]}px`,
    '--panel-alpha': String(Math.min(100, Math.max(10, settings.sidebarOpacity ?? 100)) / 100)
  };
  for (const [section, prefix, size, weight] of [
    ['hubName','hub-name',preset[1],'normal'], ['bookmark','bookmark',preset[0],'normal'],
    ['board','board',preset[3],'normal'], ['title','title',preset[2],'600']
  ]) {
    const enabled = overrides[section];
    variables[`--${prefix}-color`] = enabled
      ? (style[`${section}ColorFromTheme`] === true ? c.accent : style[`${section}Color`] || text) : text;
    variables[`--${prefix}-font-size`] = `${enabled ? style[`${section}FontSize`] || size : size}px`;
    variables[`--${prefix}-font-family`] = enabled ? style[`${section}FontFamily`] || 'inherit' : 'inherit';
    variables[`--${prefix}-font-weight`] = enabled && style[`${section}Bold`] ? 'bold' : weight;
    variables[`--${prefix}-font-style`] = enabled && style[`${section}Italic`] ? 'italic' : 'normal';
    variables[`--${prefix}-text-decoration`] = enabled && style[`${section}Underline`] ? 'underline' : 'none';
  }
  return { schemaVersion: 1, colorScheme: theme.colorScheme === 'light' ? 'light' : 'dark', variables };
}
