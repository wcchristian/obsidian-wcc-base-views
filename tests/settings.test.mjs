import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
const { migrateSettings } = await loadModule('src/config/settings.ts');

test('missing or malformed settings restore enabled views and empty ordering', () => {
  for (const value of [undefined, null, [], false, 'invalid', { localOrder: [] }]) {
    const settings = migrateSettings(value);
    assert.equal(settings.enableTable, true);
    assert.deepEqual(settings.localOrder, {});
  }
});

test('explicit disabled views and valid saved ordering survive loading', () => {
  const settings = migrateSettings({
    enableCalendar: false,
    localOrder: { Work: ['A.md', 'B.md'], bad: [3], broken: null },
  });
  assert.equal(settings.enableCalendar, false);
  assert.deepEqual(settings.localOrder, { Work: ['A.md', 'B.md'] });
});

test('loaded collections and separate instances do not share mutable defaults', () => {
  const raw = { localOrder: { Work: ['A.md'] }, quickAddProfiles: [{ name: 'Old capture' }] };
  const first = migrateSettings(raw);
  first.localOrder.Work.push('B.md');
  first.quickAddProfiles.push({ name: 'Another' });
  assert.deepEqual(raw.localOrder.Work, ['A.md']);
  assert.equal(raw.quickAddProfiles.length, 1);
  const second = migrateSettings({});
  second.localOrder.Work = ['C.md'];
  assert.deepEqual(migrateSettings({}).localOrder, {});
});
