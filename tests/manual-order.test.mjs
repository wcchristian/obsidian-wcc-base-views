import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';
class Value {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return String(this.value);
  }
}
class NumberValue extends Value {}
class NullValue extends Value {
  toString() {
    return '';
  }
}
const api = new Proxy(
  {
    NullValue,
    NumberValue,
    parsePropertyId: (pid) => ({ type: pid.split('.')[0], name: pid.slice(pid.indexOf('.') + 1) }),
  },
  { get: (target, key) => target[key] ?? class {} },
);
const { ensureManualOrder } = await loadModule('src/shared/manual-order.ts', api);
const saved = {};
const note = {};
let selections = 0;
const view = {
  config: {
    get: (key) => saved[key],
    set: (key, value) => {
      saved[key] = value;
      selections++;
    },
  },
  data: {
    groupedData: [
      {
        entries: [
          {
            getValue: (pid) => {
              const v = note[pid.slice(5)];
              return v == null
                ? new NullValue()
                : typeof v === 'number'
                  ? new NumberValue(v)
                  : new Value(v);
            },
          },
        ],
      },
    ],
  },
};
assert.equal(ensureManualOrder(view), 'note.order');
assert.equal(saved.sortOrderProperty, 'note.order');
assert.equal(selections, 1);
assert.equal(ensureManualOrder(view), 'note.order');
assert.equal(selections, 1, 'an existing mapping is not changed');
saved.sortOrderProperty = 'rank';
assert.equal(ensureManualOrder(view), 'note.rank');
saved.sortOrderProperty = 'file.name';
assert.throws(() => ensureManualOrder(view), /note property/);
delete saved.sortOrderProperty;
note.order = 'Do not overwrite';
note.order_2 = 'Also preserve';
assert.equal(ensureManualOrder(view), 'note.order_3');
assert.deepEqual(note, { order: 'Do not overwrite', order_2: 'Also preserve' });
delete saved.sortOrderProperty;
note.order = 30;
assert.equal(ensureManualOrder(view), 'note.order', 'an existing numeric order field is suitable');
// Actual List and Table drop handlers assign and persist default ranks.
for (const [name, exported] of [
  ['list', 'BaseListView'],
  ['table', 'BaseTableView'],
]) {
  const { [exported]: View } = await loadModule(`src/views/${name}/view.ts`, api);
  const instance = Object.create(View.prototype);
  const values = {};
  const notes = {
    A: { done: false },
    B: { done: false },
    C: { done: false },
    D: { untouched: true },
  };
  const files = Object.fromEntries(Object.keys(notes).map((id) => [id, { path: id }]));
  const entries = ['A', 'B', 'C'].map((id) => ({
    file: files[id],
    getValue: (pid) =>
      notes[id][pid.slice(5)] == null ? new NullValue() : new NumberValue(notes[id][pid.slice(5)]),
  }));
  let rows = ['A', 'B', 'C'];
  instance.config = { get: (key) => values[key], set: (key, value) => (values[key] = value) };
  instance.data = { groupedData: [{ entries }] };
  instance.app = {
    vault: { getFileByPath: (id) => files[id] },
    fileManager: {
      async processFrontMatter(file, fn) {
        fn(notes[file.path]);
      },
    },
  };
  instance.sortOrderProp = null;
  instance.dropList = {
    dataset: { listGroup: '(no value)' },
    querySelectorAll: () => rows.map((id) => ({ dataset: { itemId: id } })),
  };
  instance.dragId = 'A';
  instance.dragGroupKey = '(no value)';
  instance.dropBefore = 'C';
  await instance.commitListDrop();
  assert.equal(values.sortOrderProperty, 'note.order');
  assert.deepEqual(notes, {
    A: { done: false, order: 10 },
    B: { done: false, order: 0 },
    C: { done: false, order: 20 },
    D: { untouched: true },
  });
  // A stationary drop must not create a mapping or modify note properties.
  delete values.sortOrderProperty;
  instance.sortOrderProp = null;
  rows = ['B', 'A', 'C'];
  instance.dragId = 'B';
  instance.dropBefore = 'A';
  await instance.commitListDrop();
  assert.equal(values.sortOrderProperty, undefined, 'no-op drops do not change settings');
}
console.log(
  'Automatic order fields, collision avoidance, existing mappings, and actual List/Table reorder writes passed.',
);

for (const [name, exported] of [
  ['kanban', 'BaseKanbanView'],
  ['calendar', 'BaseCalendarView'],
]) {
  const module = await loadModule(`src/views/${name}/view.ts`, api);
  const instance = Object.create(module[exported].prototype);
  const settings = {};
  const notes = { A: { done: false }, B: { done: false }, C: { done: false } };
  const files = Object.fromEntries(Object.keys(notes).map((id) => [id, { path: id }]));
  const entries = Object.keys(notes).map((id) => ({
    file: files[id],
    getValue: (pid) =>
      notes[id][pid.slice(5)] == null ? new NullValue() : new NumberValue(notes[id][pid.slice(5)]),
  }));
  instance.config = { get: (key) => settings[key], set: (key, value) => (settings[key] = value) };
  instance.data = { groupedData: [{ entries }] };
  instance.app = {
    vault: { getFileByPath: (id) => files[id] },
    fileManager: {
      async processFrontMatter(file, fn) {
        fn(notes[file.path]);
      },
    },
  };
  if (name === 'kanban') {
    instance.dragCards = entries.map((entry) => ({
      id: entry.file.path,
      file: entry.file,
      entry,
      columnKey: 'Todo',
      subgroupKey: '',
    }));
    instance.dropContainer = { closest: () => ({ dataset: { colKey: 'Todo', subgroupKey: '' } }) };
    instance.dropBefore = 'C';
    await instance.commitKanbanDrop({
      classList: { contains: () => false },
      dataset: { cardId: 'A' },
    });
  } else {
    instance.events = entries.map((entry) => ({
      id: entry.file.path,
      file: entry.file,
      entry,
      start: new Date('2026-10-13T00:00:00'),
    }));
    instance.dropDay = {
      date: new Date('2026-10-13T00:00:00'),
      dateKey: '2026-10-13',
      events: instance.events,
    };
    instance.dragOrderId = 'A';
    instance.dragSourceDateKey = '2026-10-13';
    instance.dropBefore = 'C';
    instance.plugin = { settings: { localOrder: {} }, async saveSettings() {} };
    await instance.commitCalendarDrop();
  }
  assert.equal(
    settings.sortOrderProperty,
    'note.order',
    `${name} selects an order field on first reorder`,
  );
  assert.deepEqual(notes, {
    A: { done: false, order: 10 },
    B: { done: false, order: 0 },
    C: { done: false, order: 20 },
  });
}
