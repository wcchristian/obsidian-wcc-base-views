import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';

class NullValue {
  toString() {
    return '';
  }
}
class ListValue {
  constructor(items) {
    this.items = items;
  }
  length() {
    return this.items.length;
  }
  toString() {
    return this.items.join(',');
  }
}
const { applyViewDensity, hideProperty } = await loadModule('src/shared/view-density.ts', {
  NullValue,
  ListValue,
});
const config = (values = {}) => ({ get: (key) => values[key] });

test('compact density changes layout and default padding; explicit padding survives switching', () => {
  const classes = new Map();
  const styles = new Map();
  const root = {
    toggleClass: (key, value) => classes.set(key, value),
    setCssProps: (props) => {
      for (const [key, value] of Object.entries(props)) styles.set(key, value);
    },
  };
  applyViewDensity(root, config());
  assert.equal(classes.get('wcc-density-compact'), true);
  assert.equal(styles.get('--wcc-item-padding'), '3px');
  applyViewDensity(root, config({ density: 'comfortable' }));
  assert.equal(classes.get('wcc-density-compact'), false);
  assert.equal(styles.get('--wcc-item-padding'), '6px');
  for (const density of ['compact', 'comfortable']) {
    applyViewDensity(root, config({ density, itemPadding: 9 }));
    assert.equal(styles.get('--wcc-item-padding'), '9px');
  }
});

test('blank values disappear while false and zero remain available for editing', () => {
  for (const value of [
    undefined,
    null,
    new NullValue(),
    new ListValue([]),
    { toString: () => ' ' },
  ]) {
    assert.equal(hideProperty(value, config()), true);
    assert.equal(hideProperty(value, config({ hideEmptyProperties: false })), false);
  }
  for (const value of [false, 0, 'high']) {
    assert.equal(hideProperty({ toString: () => String(value) }, config()), false);
  }
  assert.equal(hideProperty(new ListValue(['A']), config()), false);
});
