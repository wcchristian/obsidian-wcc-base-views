import type { App } from 'obsidian';
import { TFile } from 'obsidian';

interface BackgroundConfig {
  get(key: string): unknown;
}

export function backgroundUrl(app: App, raw: string): string {
  const path = raw.trim();
  if (/^(https?:|data:|app:|file:)/i.test(path)) return path;
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? app.vault.adapter.getResourcePath(file.path) : path;
}

/** One renderer keeps image defaults consistent across all five views. */
export function createBackground(
  parent: HTMLElement,
  app: App,
  config: BackgroundConfig,
  className: string,
): HTMLElement | null {
  const raw = config.get('bgImage');
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const layer = parent.createDiv(className);
  layer.setCssStyles({ backgroundImage: `url(${JSON.stringify(backgroundUrl(app, raw))})` });
  const fit = config.get('bgFit');
  layer.setCssStyles({
    backgroundSize:
      fit === 'stretch' ? '100% 100%' : typeof fit === 'string' && fit ? fit : 'cover',
  });
  const blur = config.get('bgBlur');
  if (typeof blur === 'number' && blur > 0) layer.setCssStyles({ filter: `blur(${blur}px)` });
  const opacity = config.get('bgOpacity');
  layer.setCssStyles({ opacity: String(typeof opacity === 'number' ? opacity : 0.3) });
  return layer;
}
