/** Density chooses spacing; per-view custom padding is no longer configurable. */
export function applyItemPadding(
  root: HTMLElement,
  _config: { get(key: string): unknown },
  padding = 6,
): number {
  root.setCssProps({ ['--wcc-item-padding']: `${padding}px` });
  return padding;
}
