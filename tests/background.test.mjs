import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
class TFile {
  constructor(path) {
    this.path = path;
  }
}
const { backgroundUrl, createBackground } = await loadModule('src/shared/background.ts', { TFile });
const app = {
  vault: {
    getAbstractFileByPath: (path) => (path === 'Images/Cover.png' ? new TFile(path) : null),
    adapter: { getResourcePath: (path) => `app://vault/${path}` },
  },
};

test('backgrounds resolve vault attachments and preserve remote URLs', () => {
  assert.equal(backgroundUrl(app, ' Images/Cover.png '), 'app://vault/Images/Cover.png');
  assert.equal(
    backgroundUrl(app, 'https://example.com/image.png'),
    'https://example.com/image.png',
  );
  assert.equal(backgroundUrl(app, 'Missing.png'), 'Missing.png');
});

test('background rendering uses shared defaults and skips empty images', () => {
  const children = [];
  const parent = {
    createDiv(cls) {
      const element = { cls, style: {} };
      children.push(element);
      return element;
    },
  };
  const config = (values) => ({ get: (key) => values[key] });
  assert.equal(createBackground(parent, app, config({ bgImage: ' ' }), 'wcc-bg'), null);
  assert.equal(children.length, 0);
  const layer = createBackground(parent, app, config({ bgImage: 'Images/Cover.png' }), 'wcc-bg');
  assert.equal(layer.style.backgroundSize, 'cover');
  assert.equal(layer.style.opacity, '0.3');
  assert.equal(layer.style.backgroundImage, 'url("app://vault/Images/Cover.png")');
  const custom = createBackground(
    parent,
    app,
    config({ bgImage: 'https://example.com/a"b.png', bgFit: 'stretch', bgOpacity: 0, bgBlur: 5 }),
    'wcc-bg',
  );
  assert.equal(custom.style.backgroundSize, '100% 100%');
  assert.equal(custom.style.opacity, '0');
  assert.equal(custom.style.filter, 'blur(5px)');
  assert.ok(custom.style.backgroundImage.includes('\\"'), 'quote cannot terminate the CSS URL');
});
