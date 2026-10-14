import type { BasesView, BasesPropertyId } from 'obsidian';
import { NullValue, NumberValue, parsePropertyId } from 'obsidian';
import { viewProperty } from './view-properties';

/** Pick a writable numeric field on the first real reorder, without clobbering text fields. */
export function ensureManualOrder(view: Pick<BasesView, 'config' | 'data'>): BasesPropertyId {
  const selected = viewProperty(view.config, 'sortOrderProperty');
  if (selected) {
    if (parsePropertyId(selected).type !== 'note')
      throw new Error('Manual order must use a note property.');
    return selected;
  }
  const entries = (view.data?.groupedData ?? []).flatMap((group) => [...group.entries]);
  let name = 'order';
  for (
    let suffix = 2;
    entries.some((entry) => {
      const value = entry.getValue(`note.${name}`);
      return (
        value &&
        !(value instanceof NullValue) &&
        !(value instanceof NumberValue) &&
        value.toString().trim() !== ''
      );
    });
    suffix++
  )
    name = `order_${suffix}`;
  const pid: BasesPropertyId = `note.${name}`;
  view.config.set('sortOrderProperty', pid);
  return pid;
}
