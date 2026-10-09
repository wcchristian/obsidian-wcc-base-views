import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
class Plugin {
  constructor() {
    this.views = [];
    this.raw = {};
  }
  async loadData() {
    return this.raw;
  }
  async saveData(settings) {
    this.saved = settings;
  }
  registerBasesView(id, options) {
    this.views.push({ id, ...options });
  }
  addSettingTab() {}
}
class BasesView {}
const api = new Proxy({ Plugin, BasesView }, { get: (target, key) => target[key] ?? class {} });
const { default: WccPlugin } = await loadModule('src/main.ts', api);

test('all five view identities are consistent and options have unique keys', async () => {
  const plugin = new WccPlugin();
  await plugin.onload();
  assert.equal(plugin.views.length, 5);
  for (const kind of ['Calendar', 'Kanban', 'Timeline', 'List', 'Table']) {
    const view = plugin.views.find((view) => view.id === `wcc-${kind.toLowerCase()}`);
    assert.equal(view.name, `WCC - ${kind}`);
    const keys = view
      .options()
      .flatMap((group) => group.items ?? [group])
      .map((option) => option.key);
    assert.equal(new Set(keys).size, keys.length, `${kind} does not repeat option keys`);
    assert.ok(keys.includes('itemPadding'));
    assert.ok(keys.includes('checkboxColorProperty'));
  }
});

test('disabled views retain their identity and display a useful placeholder', async () => {
  const plugin = new WccPlugin();
  plugin.raw = Object.fromEntries(
    ['Calendar', 'Kanban', 'Timeline', 'List', 'Table'].map((kind) => [`enable${kind}`, false]),
  );
  await plugin.onload();
  for (const definition of plugin.views) {
    const messages = [];
    const view = definition.factory({}, { createDiv: (options) => messages.push(options.text) });
    assert.equal(view.type, definition.id);
    assert.match(messages[0], /WCC Base Views settings/);
    await view.onDataUpdated();
  }
});

test('shared appearance option objects are independent across calls and views', async () => {
  const plugin = new WccPlugin();
  await plugin.onload();
  const first = plugin.views[0].options();
  first.find((group) => group.displayName === 'Spacing').items[0].default = 99;
  for (const view of plugin.views) {
    assert.equal(
      view.options().find((group) => group.displayName === 'Spacing').items[0].default,
      6,
    );
  }
});
