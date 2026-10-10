import type { BasesOptions, Value } from 'obsidian';
import { ListValue, NullValue } from 'obsidian';
import { applyItemPadding } from './view-spacing';

type Config = { get(key: string): unknown };

export function densityOptions(): BasesOptions[] {
  return [
    {
      type: 'dropdown',
      displayName: 'Density',
      key: 'density',
      default: 'compact',
      options: { compact: 'Compact', comfortable: 'Comfortable' },
    },
    {
      type: 'toggle',
      displayName: 'Expand details by default',
      key: 'detailsExpanded',
      default: false,
    },
    {
      type: 'toggle',
      displayName: 'Hide empty properties',
      key: 'hideEmptyProperties',
      default: true,
    },
  ];
}

export function isCompact(config: Config): boolean {
  return config.get('density') !== 'comfortable';
}

export function applyViewDensity(root: HTMLElement, config: Config): void {
  const compact = isCompact(config);
  root.toggleClass('wcc-density-compact', compact);
  applyItemPadding(root, config, compact ? 3 : 6);
}

/** Blank strings/lists are empty; unchecked booleans and zero are real values. */
export function hideProperty(value: Value | null | undefined, config: Config): boolean {
  if (config.get('hideEmptyProperties') === false) return false;
  return (
    !value ||
    value instanceof NullValue ||
    (value instanceof ListValue && value.length() === 0) ||
    value.toString().trim() === ''
  );
}
