import { build } from 'esbuild';
import assert from 'node:assert/strict';
class Plugin {
  constructor() {
    this.views = [];
  }
  async loadData() {
    return {};
  }
  registerBasesView(type, options) {
    this.views.push({ type, ...options });
  }
  addSettingTab() {}
  addRibbonIcon() {}
  addCommand() {}
}
const api = new Proxy({ Plugin }, { get: (target, key) => target[key] ?? class {} });
const built = await build({
  stdin: {
    contents:
      "export {default as Plugin} from './src/main'; export {migrateSettings} from './src/config/settings';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['obsidian'],
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(
  mod,
  mod.exports,
  () => api,
);
assert.equal(
  mod.exports.migrateSettings({}).enableTable,
  true,
  'existing installations get Table enabled by default',
);
assert.equal(mod.exports.migrateSettings({ enableTable: false }).enableTable, false);
const plugin = new mod.exports.Plugin();
await plugin.onload();
const table = plugin.views.find((view) => view.name === 'WCC - Table');
assert.ok(table, 'Table is registered with the requested name');
const options = table.options().flatMap((group) => group.items ?? [group]);
assert.deepEqual(
  options.map((option) => option.key),
  [
    'status_type',
    'doneProperty',
    'statusProperty',
    'statusValues',
    'sortOrderProperty',
    'itemPadding',
    'colorProperty',
    'colorValues',
    'checkboxColorProperty',
    'checkboxColorValues',
    'bgImage',
    'bgFit',
    'bgBlur',
    'bgOpacity',
  ],
  'Table retains shared appearance and creation settings, with completion settings and without Table config',
);
assert.ok(!table.options().some((option) => option.displayName === 'Table config'));
assert.deepEqual(
  table
    .options()
    .find((option) => option.displayName === 'Properties')
    .items.map((option) => option.key),
  ['sortOrderProperty'],
);
for (const view of plugin.views) {
  assert.ok(
    !view.options().some((option) => option.displayName === 'New notes'),
    `${view.name} has no New notes settings`,
  );
  assert.ok(
    !view
      .options()
      .flatMap((option) => option.items ?? [option])
      .some((option) => option.key === 'newNoteFolder'),
  );
}
console.log('WCC - Table registration, shared settings, and enable/disable migration passed.');
