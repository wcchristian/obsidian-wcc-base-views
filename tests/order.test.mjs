import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
const { moveBefore } = await loadModule('src/shared/drag.ts', {});

test('reordering preserves hidden siblings, supports append, and leaves input intact', () => {
  const ids = ['A', 'hidden', 'B', 'C'];
  assert.deepEqual(moveBefore(ids, 'C', 'B'), ['A', 'hidden', 'C', 'B']);
  assert.deepEqual(moveBefore(ids, 'A', null), ['hidden', 'B', 'C', 'A']);
  assert.deepEqual(moveBefore(ids, 'A', 'A'), ids);
  assert.deepEqual(ids, ['A', 'hidden', 'B', 'C']);
});
