import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const built = await build({
  entryPoints: ['src/shared/color-rules.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const mod = { exports: {} };
new Function('module', 'exports', built.outputFiles[0].text)(mod, mod.exports);
const { colorKey, resolveColor } = mod.exports;
assert.equal(colorKey('[[CA Notes/Projects/Datasite.md|Work]]'), 'CA Notes/Projects/Datasite');
assert.equal(
  resolveColor('[[CA Notes/Projects/Datasite|Work]]', ['[[CA Notes/Projects/Datasite]]:#619de6']),
  '#619de6',
);
assert.equal(resolveColor('[[CA Notes/Projects/Datasite|Work]]', ['Datasite:#619de6']), '#619de6');
assert.equal(
  resolveColor('[[CA Notes/Projects/Datasite.md|Work]]', ['[[Datasite]]:#619de6']),
  '#619de6',
);
assert.equal(
  resolveColor('[[CA Notes/Projects/Datasite]]', ['datasite:blue']),
  'var(--color-blue)',
);
assert.equal(resolveColor('CA Notes/Projects/Datasite', ['Datasite:#619de6']), '#619de6');
assert.equal(resolveColor('[[Datasite]]', ['Datasite:#619de6']), '#619de6');
assert.equal(
  resolveColor('[[CA Notes/Projects/Datasite]]', [
    'Datasite:blue',
    'CA Notes/Projects/Datasite:red',
  ]),
  'var(--color-red)',
);
assert.equal(
  resolveColor('[[Other/Datasite]]', ['Datasite:blue', 'CA Notes/Projects/Datasite:red']),
  'var(--color-blue)',
);
assert.equal(resolveColor('[[CA Notes/Projects/Datasite Archive]]', ['Datasite:blue']), null);
assert.equal(
  resolveColor('[[CA Notes/Projects/Datasite]]', ['Projects:blue', 'CA Notes/Other/Datasite:red']),
  null,
);
assert.equal(
  resolveColor('HIGH', ['high:red']),
  null,
  'plain property values retain exact matching',
);
assert.equal(resolveColor('high', ['high:red']), 'var(--color-red)');
assert.equal(resolveColor('normal', ['high:red']), null);
assert.equal(resolveColor('', [], true), null);
assert.equal(resolveColor('Datasite', [], true), resolveColor('[[Datasite|Work]]', [], true));
assert.equal(resolveColor('high', ['high:rgb(240, 80, 70)']), 'rgb(240, 80, 70)');
// Test appearance adapters with the same runtime value classes on both sides.
const mock = `export class NullValue {} export class ListValue { constructor(values) { this.values=values; } length(){return this.values.length;} get(i){return this.values[i];} }`;
const adapter = await build({
  stdin: {
    contents: `export {propertyColor,colorCheckbox,colorStatus} from './src/shared/task-appearance'; export {NullValue,ListValue} from 'obsidian';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'mock-obsidian',
      setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'js' }));
      },
    },
  ],
});
const adapted = { exports: {} };
new Function('module', 'exports', adapter.outputFiles[0].text)(adapted, adapted.exports);
const { propertyColor, colorCheckbox, colorStatus, NullValue, ListValue } = adapted.exports;
const values = {
  'note.project': { toString: () => '[[CA Notes/Projects/Datasite|Work]]' },
  'note.priority': { toString: () => 'high' },
};
const entry = { getValue: (pid) => values[pid] ?? new NullValue() };
const settings = {
  colorProperty: 'note.project',
  colorValues: ['[[CA Notes/Projects/Datasite]]:#619de6'],
  checkboxColorProperty: 'note.priority',
  checkboxColorValues: ['high:#e85d5d'],
};
const config = { get: (key) => settings[key] };
assert.equal(propertyColor(config, entry), '#619de6');
settings.colorValues = ['Datasite:#619de6'];
assert.equal(
  propertyColor(config, entry),
  '#619de6',
  'shared card color adapter accepts short link names',
);
settings.checkboxColorProperty = 'note.project';
settings.checkboxColorValues = ['Datasite:#619de6'];
assert.equal(
  propertyColor(config, entry, true),
  '#619de6',
  'shared checkbox color adapter accepts short link names',
);
settings.checkboxColorProperty = 'note.priority';
settings.checkboxColorValues = ['high:#e85d5d'];
assert.equal(propertyColor(config, entry, true), '#e85d5d');
const el = {
  classes: [],
  props: {},
  addClass(c) {
    this.classes.push(c);
  },
  setCssProps(props) {
    Object.assign(this.props, props);
  },
};
colorCheckbox(el, config, entry);
assert.equal(el.props['--wcc-check-color'], '#e85d5d');
assert.deepEqual(el.classes, ['wcc-colored-check']);
values['note.priority'] = new ListValue([{ toString: () => 'high' }]);
assert.equal(propertyColor(config, entry, true), '#e85d5d');
delete settings.checkboxColorProperty;
assert.equal(propertyColor(config, entry, true), null);
assert.equal(propertyColor(config, entry), '#619de6');
console.log(
  'Color rules, link aliases, list values, independent primary/checkbox colors, and disabled settings passed.',
);

settings.checkboxColorProperty = 'note.priority';
settings.checkboxColorValues = ['high:#e85d5d'];
const pill = {
  classes: new Set(),
  css: {},
  toggleClass(name, on) {
    on ? this.classes.add(name) : this.classes.delete(name);
  },
  setCssProps(props) {
    Object.assign(this.css, props);
  },
  style: {
    removeProperty(name) {
      delete pill.css[name];
    },
  },
};
colorStatus(pill, config, entry);
assert.ok(pill.classes.has('wcc-colored-status'));
assert.equal(
  pill.css['--wcc-status-color'],
  '#e85d5d',
  'pill uses the exact same mapping as the checkbox',
);
values['note.priority'] = { toString: () => 'unmapped' };
colorStatus(pill, config, entry);
assert.ok(!pill.classes.has('wcc-colored-status'));
assert.equal(pill.css['--wcc-status-color'], undefined, 'unmapped values clear the previous tint');
