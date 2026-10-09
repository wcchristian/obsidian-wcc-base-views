import { build } from 'esbuild';
import assert from 'node:assert/strict';
const helper = await build({ entryPoints: ['src/list-properties.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const helpers = { exports: {} };
new Function('module', 'exports', helper.outputFiles[0].text)(helpers, helpers.exports);
const { numericOrder, parseListEdit, propertyLinks } = helpers.exports;
assert.equal(numericOrder(undefined), Infinity);
assert.equal(numericOrder(''), Infinity);
assert.equal(numericOrder('bad'), Infinity);
assert.equal(numericOrder('2.5'), 2.5);
assert.deepEqual(parseListEdit('[[Project|Work, client]]\n\n tag,with,commas\r\n'), ['[[Project|Work, client]]', 'tag,with,commas']);
assert.deepEqual(propertyLinks('See [[Projects/A#Plan|Roadmap]] and [Docs](https://example.com).'), [
  { text: 'See ' }, { text: 'Roadmap', target: 'Projects/A#Plan', internal: true }, { text: ' and ' },
  { text: 'Docs', target: 'https://example.com', internal: false }, { text: '.' },
]);
assert.deepEqual(propertyLinks('https://example.com.'), [{ text: 'https://example.com', target: 'https://example.com', internal: false }, { text: '.' }]);
assert.ok(propertyLinks('[bad](javascript:alert(1))').every(part => !part.target));

// Exercise the actual view editor against a small DOM/API harness, without a vault.
class El {
  constructor(tag = 'div', opts = {}, parent) {
    this.tag = tag; this.parent = parent; this.children = []; this.classes = new Set((opts.cls ?? '').split(' '));
    this.attrs = { ...opts.attr }; this.type = opts.type; this.text = opts.text; this.value = ''; this.disabled = false;
    this.style = {}; this.dataset = {};
  }
  createEl(tag, opts = {}) { const el = tag === 'input' ? new Input(tag, opts, this) : new El(tag, opts, this); this.children.push(el); return el; }
  createDiv(opts = {}) { return this.createEl('div', typeof opts === 'string' ? { cls: opts } : opts); }
  createSpan(opts = {}) { return this.createEl('span', opts); }
  empty() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(el => el !== this); }
  querySelector(selector) { const cls = selector.slice(1); for (const el of this.children) { if (el.classes.has(cls)) return el; const child = el.querySelector(selector); if (child) return child; } return null; }
  setAttribute(key, val) { this.attrs[key] = val; }
  toggleClass(cls, on) { on ? this.classes.add(cls) : this.classes.delete(cls); }
  addClass(cls) { this.classes.add(cls); }
  addEventListener(name, fn) { (this.events ??= {})[name] = fn; }
  focus() {}
  select() {}
}
class Input extends El { checkValidity() { return true; } reportValidity() {} }
globalThis.HTMLInputElement = Input;
class Value { constructor(value) { this.value = value; } toString() { return String(this.value); } }
class StringValue extends Value {}
class NumberValue extends Value {}
class BooleanValue extends Value { isTruthy() { return this.value; } }
class NullValue extends Value { toString() { return ''; } }
class ListValue extends Value { constructor(values) { super(values.map(v => typeof v === 'string' ? new StringValue(v) : v)); } length() { return this.value.length; } get(i) { return this.value[i]; } }
class DateValue extends Value { static parseFromString(raw) { return new DateValue(raw); } }
const api = new Proxy({ Value, StringValue, NumberValue, BooleanValue, NullValue, ListValue, DateValue,
  TagValue: class extends StringValue {}, BasesView: class {},
  parsePropertyId: pid => ({ type: pid.split('.')[0], name: pid.slice(pid.indexOf('.') + 1) }),
  setIcon: () => {}, Keymap: { isModEvent: e => !!e.ctrlKey },
}, { get: (target, key) => target[key] ?? class {} });
const bundle = await build({ stdin: { contents: "export {BaseListView} from './src/list-view'; export {BaseTableView} from './src/table-view'; export {BaseCalendarView} from './src/calendar-view'; export {BaseKanbanView} from './src/kanban-view'; export {BaseTimelineView} from './src/timeline-view';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian'] });
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, name => { assert.equal(name, 'obsidian'); return api; });
for (const [View, prefix] of [[mod.exports.BaseListView, 'bv-list'], [mod.exports.BaseCalendarView, 'bc'], [mod.exports.BaseKanbanView, 'bk'], [mod.exports.BaseTimelineView, 'bt'], [mod.exports.BaseTableView, 'cat']]) {
const view = Object.create(View.prototype);
const writes = []; const opens = []; const notes = [];
view.config = { getDisplayName: pid => pid, get: () => undefined, getOrder: () => ['note.project'] };
view.app = { fileManager: { async processFrontMatter(file, fn) { const fm = {}; fn(fm); writes.push(fm); } },
  workspace: { async openLinkText(...args) { opens.push(args); }, getLeaf: () => ({ openFile: file => notes.push(file.path) }), trigger() {} } };
const item = { id: 'Tasks/Task.md', title: 'Task', done: false, file: { path: 'Tasks/Task.md' }, entry: { getValue: () => new StringValue('[[Project|Work]]') } };
const click = { stopPropagation() {}, preventDefault() {}, target: { closest: () => null } };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function editor(value, pid = 'note.rank') { const el = new El(); view.renderPropVal(el, value, item, pid); return el; }
function start(el) { el.querySelector(`.${prefix}-prop-value`).onclick(click); return el.querySelector(`.${prefix}-prop-input`); }
function key(el, name, options = {}) { el.onkeydown({ key: name, preventDefault() {}, stopPropagation() {}, ...options }); }
const number = editor(new NumberValue(1));
let input = start(number); input.value = '2.5'; key(input, 'Enter'); await tick(); assert.deepEqual(writes.pop(), { rank: 2.5 });
input = start(number); assert.equal(input.value, '2.5'); input.value = '9'; key(input, 'Escape'); assert.equal(number.querySelector(`.${prefix}-prop-input`), null); assert.equal(writes.length, 0);
input = start(number); input.value = ''; input.onblur(); await tick(); assert.deepEqual(writes.pop(), { rank: null });
input = start(number); input.value = '4'; key(input, 'Enter'); await tick(); assert.deepEqual(writes.pop(), { rank: 4 });
const list = editor(new ListValue(['[[A|Work, client]]']), 'note.projects');
input = start(list); input.value += '\n[[B]]'; key(input, 'Enter'); assert.equal(writes.length, 0); key(input, 'Enter', { ctrlKey: true }); await tick();
assert.deepEqual(writes.pop(), { projects: ['[[A|Work, client]]', '[[B]]'] });
const empty = editor(new NullValue(), 'note.description'); input = start(empty); input.value = 'New value'; input.onblur(); await tick(); assert.deepEqual(writes.pop(), { description: 'New value' }); assert.equal(start(empty).value, 'New value');
assert.equal(editor(new NumberValue(3), 'formula.rank').querySelector(`.${prefix}-prop-value`).onclick, undefined);
assert.equal(editor(new BooleanValue(true), 'file.flag').querySelector('.bc-toggle'), null);
const toggle = editor(new BooleanValue(false), 'note.done').querySelector('.bc-toggle');
await toggle.onclick(click); await toggle.onclick(click); assert.deepEqual(writes.splice(0), [{ done: true }, { done: false }]);
const linkedField = editor(new StringValue('[[Project|Work]]'), 'note.project');
const linkedValue = linkedField.querySelector(`.${prefix}-prop-value`);
linkedValue.onclick({ ...click, target: { closest: () => linkedValue.children[0] } });
assert.equal(linkedField.querySelector(`.${prefix}-prop-input`), null);
linkedValue.children[0].onclick(click); await tick();
assert.deepEqual(opens.pop(), ['Project', 'Tasks/Task.md', false]);
assert.equal(start(linkedField).value, '[[Project|Work]]');
assert.equal(linkedField.querySelector(`.${prefix}-prop-edit`), null);
const keyboardField = editor(new StringValue('Keyboard'));
const keyboardValue = keyboardField.querySelector(`.${prefix}-prop-value`);
keyboardValue.onkeydown({ key: 'Enter', target: keyboardValue, preventDefault() {}, stopPropagation() {} });
assert.equal(keyboardField.querySelector(`.${prefix}-prop-input`).value, 'Keyboard');
const links = new El(); view.renderPropertyText(links, '[[Project|Work]]', item); links.children[0].onclick(click); await tick(); assert.deepEqual(opens.pop(), ['Project', 'Tasks/Task.md', false]);
if (prefix === 'bk' || prefix === 'bt' || prefix === 'cat') { console.log(`${prefix}: shared links, typed edits, empty values, arrays, save/cancel, repeated toggles, and read-only properties passed.`); continue; }
// Verify event/note title and property clicks stay separate at the card boundary.
const cards = new El();
view.doneProp = null;
if (prefix === 'bc') { view.propOrder = ['note.project']; view.makeChip(cards, item); }
else view.makeRow(cards, item, '(no value)');
const card = cards.children[0];
const title = card.querySelector(prefix === 'bc' ? '.bc-chip-link' : '.bv-list-row-link');
title.onclick(click);
assert.deepEqual(notes.splice(0), ['Tasks/Task.md']);
card.onclick({ ...click, target: { closest: () => ({}) } });
assert.equal(notes.length, 0, 'property clicks must not open the parent note');
assert.equal(card.attrs.draggable, undefined, 'native browser dragging is replaced by pointer dragging');
assert.ok(card.querySelector('.ca-drag-grip'), 'each item has a touch drag grip');
console.log(`${prefix}: links, typed edits, empty values, arrays, save/cancel, repeated toggles, and read-only properties passed.`);
}
