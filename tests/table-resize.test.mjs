import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const api = new Proxy({}, { get: () => class {} });
const { BaseTableView } = await loadModule('src/views/table/view.ts', api);
const view = Object.create(BaseTableView.prototype);
view.minColumnWidth = 40;
view.widths = new Map([
  ['file.name', 220],
  ['note.done', 40],
]);
let saved = { 'file.name': 220, 'note.hidden': 500 };
let writes = 0;
let refreshes = 0;
view.config = {
  get: () => saved,
  set: (_key, value) => {
    writes++;
    saved = value;
    assert.equal(view.dragging, true, 'save while resize is guarded against host rerenders');
  },
  getDisplayName: (pid) => pid,
};
view.applyWidths = () => {};
view.onDataUpdated = () => refreshes++;
let captured = false;
const handle = {
  setAttribute() {},
  addClass() {},
  removeClass() {},
  setPointerCapture() {
    captured = true;
  },
  hasPointerCapture() {
    return captured;
  },
  releasePointerCapture() {
    captured = false;
  },
};
const header = { createDiv: () => handle, getBoundingClientRect: () => ({ width: 220 }) };
view.makeColumnResize(header, 'file.name');
const event = (x, id = 1) => ({
  button: 0,
  pointerId: id,
  clientX: x,
  preventDefault() {},
  stopPropagation() {},
});
handle.onpointerdown(event(0));
handle.onpointerup(event(0));
assert.equal(writes, 0, 'clicking a divider does not freeze an automatic width');
assert.equal(refreshes, 0, 'stationary clicks do not replace the divider before double click');
handle.onpointerdown(event(0));
handle.onpointermove(event(800));
assert.equal(view.widths.get('file.name'), 1020, 'manual widths are not capped at 700');
handle.onpointerup(event(800));
assert.deepEqual(saved, { 'file.name': 1020, 'note.hidden': 500 });
assert.equal(writes, 1);
assert.equal(view.dragging, false);
assert.equal(refreshes, 1);
assert.equal(captured, false);
assert.ok(
  !Object.hasOwn(saved, 'note.done'),
  'auto-sized columns are not frozen by another resize',
);

header.getBoundingClientRect = () => ({ width: 1020 });
handle.onpointerdown(event(0));
handle.onpointermove(event(-2000));
assert.equal(view.widths.get('file.name'), 40, 'narrow columns follow the theme minimum');
handle.onpointercancel(event(-2000));
assert.equal(view.widths.get('file.name'), 1020, 'cancel restores the previous width');
assert.equal(writes, 1, 'cancel does not save');
assert.equal(view.dragging, false);
view.config.set = (_key, value) => {
  saved = value;
};
handle.ondblclick(event(0));
assert.deepEqual(
  saved,
  { 'note.hidden': 500 },
  'double click restores autosizing only for this column',
);
console.log(
  'Table resizing preserves custom widths, theme minimum, cancellation, and per-column autofit.',
);
