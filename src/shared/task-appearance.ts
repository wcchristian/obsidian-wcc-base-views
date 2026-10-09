import { viewProperty } from './view-properties';
import type { BasesViewConfig, BasesEntry } from 'obsidian';
import { NullValue, ListValue } from 'obsidian';
import { resolveColor } from './color-rules';

export function propertyColor(
  config: BasesViewConfig,
  entry: BasesEntry,
  checkbox = false,
): string | null {
  const key = checkbox ? 'checkboxColorProperty' : 'colorProperty';
  const pid = viewProperty(config, key);
  if (!pid) return null;
  let value = entry.getValue(pid);
  if (value instanceof ListValue) value = value.length() ? value.get(0) : null;
  if (!value || value instanceof NullValue) return null;
  const rules = config.get(checkbox ? 'checkboxColorValues' : 'colorValues');
  return resolveColor(value.toString(), Array.isArray(rules) ? (rules as string[]) : [], !checkbox);
}

export function colorCheckbox(el: HTMLElement, config: BasesViewConfig, entry: BasesEntry): void {
  const color = propertyColor(config, entry, true);
  if (color) {
    el.addClass('wcc-colored-check');
    el.style.setProperty('--wcc-check-color', color);
  }
}
