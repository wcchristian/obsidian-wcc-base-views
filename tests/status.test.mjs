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
class NullValue extends Value {
  toString() {
    return '';
  }
}
class BooleanValue extends Value {
  isTruthy() {
    return this.value;
  }
}
class Menu {
  static last;
  constructor() {
    this.items = [];
    Menu.last = this;
  }
  addItem(fn) {
    const item = {
      setTitle(value) {
        this.title = value;
        return this;
      },
      setChecked(value) {
        this.checked = value;
        return this;
      },
      onClick(fn) {
        this.click = fn;
        return this;
      },
    };
    fn(item);
    this.items.push(item);
    return this;
  }
  showAtMouseEvent() {}
}
class El {
  constructor(opts = {}, parent) {
    this.children = [];
    this.attrs = { ...opts.attr };
    this.textContent = opts.text ?? '';
    this.parent = parent;
    this.cls = opts.cls;
  }
  createEl(_tag, opts) {
    const el = new El(opts, this);
    el.tag = _tag;
    this.children.push(el);
    return el;
  }
  createDiv(opts) {
    return this.createEl('div', typeof opts === 'string' ? { cls: opts } : opts);
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (
        (selector === 'input' && child.tag === 'input') ||
        (selector.startsWith('.') && child.cls === selector.slice(1))
      )
        return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  focus() {}
  remove() {
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  setAttribute(key, value) {
    this.attrs[key] = value;
  }
  toggleClass() {}
}
const notices = [];
const api = new Proxy(
  {
    StringValue: Value,
    NullValue,
    BooleanValue,
    Menu,
    Notice: class {
      constructor(message) {
        notices.push(message);
      }
    },
    parsePropertyId: (pid) => ({ type: pid.split('.')[0], name: pid.slice(pid.indexOf('.') + 1) }),
    setIcon: (el, icon) => {
      el.icon = icon;
    },
  },
  { get: (target, key) => target[key] ?? class {} },
);
const { statusProperty, checkboxProperty, statusChoices, viewGroups, renderStatus, groupArrow } =
  await loadModule('src/shared/status.ts', api);
const settings = {
  completionType: 'status',
  statusProperty: 'workflow',
  doneProperty: 'finished',
  statusValues: [' Waiting ', 'Waiting', '', 'Review'],
  groupBy: { property: 'note.workflow' },
};
const config = {
  get: (key) => settings[key],
  set: (key, value) => {
    settings[key] = value;
  },
};
const file = { path: 'Task.md', basename: 'Task' };
const entry = {
  file,
  getValue: (pid) => (pid === 'note.workflow' ? new Value('Working') : new BooleanValue(true)),
};
const group = { hasKey: () => true, key: new Value('Working'), entries: [entry] };
const fm = { workflow: 'Working', finished: true, unrelated: 42 };
let fail = false;
const view = {
  config,
  data: { groupedData: [group] },
  app: {
    metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
    fileManager: {
      async processFrontMatter(_file, fn) {
        if (fail) throw new Error('write rejected');
        fn(fm);
      },
    },
  },
  onDataUpdated() {
    this.refreshed = true;
  },
};
assert.equal(statusProperty(config), 'note.workflow');
assert.equal(checkboxProperty(config), null, 'status mode never reads or toggles the done field');
assert.deepEqual(statusChoices(view), ['Waiting', 'Review', 'Working']);
let groups = viewGroups(view);
assert.deepEqual(
  groups.map((g) => g.key.toString()),
  ['Working', 'Waiting', 'Review'],
);
assert.equal(groups[0].entries[0], entry);
assert.equal(groups[1].entries.length, 0);
assert.equal(view.data.groupedData.length, 1, 'empty groups do not mutate host query data');
settings.statusValues = [];
assert.deepEqual(
  viewGroups(view).map((g) => g.key.toString()),
  ['Working'],
  'no default statuses',
);
settings.statusValues = ['Waiting'];
settings.groupBy = { property: 'note.priority' };
assert.equal(viewGroups(view).length, 1, 'status groups never leak into another grouping property');
settings.groupBy = { property: 'note.workflow' };
const originalGroups = view.data.groupedData;
view.data.groupedData = [];
assert.deepEqual(
  viewGroups(view).map((g) => g.key.toString()),
  ['Waiting'],
  'empty filtered results keep explicitly configured statuses',
);
view.data.groupedData = [{ hasKey: () => false, key: null, entries: [] }];
assert.deepEqual(
  viewGroups(view).map((g) => g.key.toString()),
  ['Waiting'],
  'no invented unassigned bucket in an empty Base',
);
view.data.groupedData = originalGroups;
const root = new El();
const event = { preventDefault() {}, stopPropagation() {} };
assert.equal(renderStatus(view, root, { file, entry }), true);
const pill = root.children[0];
assert.equal(pill.cls, 'wcc-status-pill');
assert.equal(pill.textContent, 'Working');
pill.onclick(event);
assert.deepEqual(
  Menu.last.items.map((i) => i.title),
  ['No status', 'Waiting', 'Working'],
);
await Menu.last.items.find((i) => i.title === 'Waiting').click();
assert.equal(pill.textContent, 'Waiting');
assert.deepEqual(
  fm,
  { workflow: 'Waiting', finished: true, unrelated: 42 },
  'status writes preserve existing done and other properties',
);
fail = true;
pill.onclick(event);
const log = console.error;
console.error = () => {};
try {
  await Menu.last.items.find((i) => i.title === 'Working').click();
} finally {
  console.error = log;
}
assert.equal(pill.textContent, 'Waiting', 'failed status writes preserve displayed value');
assert.equal(pill.disabled, false);
assert.equal(notices.at(-1), 'Failed to update status');
fail = false;
pill.onclick(event);
await Menu.last.items.find((i) => i.title === 'No status').click();
assert.equal(fm.workflow, null);
const header = new El();
assert.equal(groupArrow(view, header, 'Waiting'), false);
assert.equal(header.children[0].icon, 'chevron-down');
header.children[0].onclick(event);
assert.deepEqual(settings.collapsedGroups, ['Waiting']);
const collapsedHeader = new El();
assert.equal(groupArrow(view, collapsedHeader, 'Waiting'), true);
assert.equal(collapsedHeader.children[0].attrs['aria-expanded'], 'false');
collapsedHeader.children[0].onclick(event);
assert.deepEqual(settings.collapsedGroups, []);
settings.completionType = 'checkbox';
assert.equal(checkboxProperty(config), 'note.finished');
assert.equal(renderStatus(view, new El(), { file, entry }), false);
assert.equal(statusProperty(config), null);
assert.equal(viewGroups(view).length, 1, 'checkbox mode preserves native groups');
// Each actual view delegates completion-related cells to the same pill renderer.
settings.completionType = 'status';
for (const [name, exported] of [
  ['list', 'BaseListView'],
  ['table', 'BaseTableView'],
  ['calendar', 'BaseCalendarView'],
  ['kanban', 'BaseKanbanView'],
  ['timeline', 'BaseTimelineView'],
]) {
  const module = await loadModule(`src/views/${name}/view.ts`, api);
  const instance = Object.assign(Object.create(module[exported].prototype), view);
  for (const pid of ['note.workflow', 'note.finished']) {
    const parent = new El();
    instance.renderPropVal(parent, new BooleanValue(true), { file, entry }, pid);
    assert.equal(
      parent.children[0].cls,
      'wcc-status-pill',
      `${name}: completion cell uses status pill`,
    );
  }
}
console.log(
  'Status unions, empty groups, typed writes, failure recovery, arrows, and pills in all five views passed.',
);

// Exercise the actual Kanban + form, including persistence of an empty status.
const { BaseKanbanView } = await loadModule('src/views/kanban/view.ts', api);
const kanban = Object.assign(Object.create(BaseKanbanView.prototype), view);
kanban.onDataUpdated = () => {};
const columns = [];
kanban.renderColumn = (_parent, key) => columns.push(key);
settings.columnOrder = ['Working'];
settings.hiddenColumns = ['Parked'];
const boardRoot = new El();
kanban.renderBoard(
  boardRoot,
  '',
  ['Working', 'Waiting'],
  [],
  new Set(),
  new Set(),
  true,
  'header',
  null,
);
assert.deepEqual(columns, ['Working', 'Waiting']);
const creator = boardRoot.querySelector('.wcc-kanban-column-creator');
creator.children[0].onclick(event);
const input = creator.querySelector('input');
input.value = ' Parked ';
input.onkeydown({ ...event, key: 'Enter' });
assert.deepEqual(settings.statusValues, ['Waiting', 'Parked']);
assert.deepEqual(settings.columnOrder, ['Working', 'Waiting', 'Parked']);
assert.deepEqual(settings.hiddenColumns, []);
assert.equal(settings.showEmptyColumns, true);
assert.ok(viewGroups(kanban).some((g) => g.key.toString() === 'Parked' && g.entries.length === 0));
assert.deepEqual(
  fm,
  { workflow: null, finished: true, unrelated: 42 },
  'adding a column never creates or modifies notes',
);
