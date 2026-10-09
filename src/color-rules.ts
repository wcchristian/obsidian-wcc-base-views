const palette = ['blue', 'purple', 'green', 'orange', 'red', 'yellow', 'cyan', 'pink'];

/** Link display aliases should not affect a property's assigned color. */
export function colorKey(raw: string): string {
  return raw.trim().replace(/^\[\[(.*?)\]\]$/, '$1').split('|')[0].replace(/\.md$/, '');
}

export function resolveColor(value: string, rules: string[], automatic = false): string | null {
  const key = colorKey(value);
  if (!key) return null;
  const parsed = rules.flatMap(rule => {
    const colon = rule.lastIndexOf(':');
    if (colon < 0) return [];
    const match = colorKey(rule.slice(0, colon));
    const color = rule.slice(colon + 1).trim();
    return match && color ? [{ match, color }] : [];
  });
  // Exact paths win even when a general note-name rule appears earlier.
  const basename = key.slice(key.lastIndexOf('/') + 1).toLocaleLowerCase();
  const matched = parsed.find(rule => rule.match === key) ?? parsed.find(rule =>
    !rule.match.includes('/') && rule.match.toLocaleLowerCase() === basename &&
    (key.includes('/') || /^\s*\[\[/.test(value))
  );
  if (matched) {
    const { color } = matched;
    if ([...palette, 'gray', 'accent'].includes(color)) {
      return color === 'accent' ? 'var(--interactive-accent)' : `var(--color-${color === 'gray' ? 'base-50' : color})`;
    }
    return color;
  }
  if (!automatic) return null;
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `var(--color-${palette[(hash >>> 0) % palette.length]})`;
}
