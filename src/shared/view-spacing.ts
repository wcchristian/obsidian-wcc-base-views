import type { BasesSliderOption } from 'obsidian';

export const itemPaddingOption: BasesSliderOption = {
  type: 'slider',
  displayName: 'Item padding (px)',
  key: 'itemPadding',
  default: 6,
  min: 0,
  max: 20,
  step: 1,
};

export function applyItemPadding(
  root: HTMLElement,
  config: { get(key: string): unknown },
  fallback = 6,
): number {
  const value = config.get('itemPadding');
  const padding =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(20, value))
      : fallback;
  root.setCssProps({ ['--wcc-item-padding']: `${padding}px` });
  return padding;
}
