import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WCC_PLAYWRIGHT_MODULE || 'playwright');
const mock = `
export class TFile { constructor(path){this.path=path;this.basename=path.replace('.md','');} }
export class TFolder {}
export class BasesView { constructor(ctrl){this.app=ctrl.app;} onunload(){} }
export class Modal {} export class AbstractInputSuggest {}
export class Notice { constructor(message){window.dragState?.notices.push(message);} }
export class Menu { showAtMouseEvent(){} }
export const Platform={isMobile:false};
export const Keymap={isModEvent:e=>!!e.ctrlKey};
export const normalizePath=p=>p;
export const parsePropertyId=pid=>({type:pid.split('.')[0],name:pid.slice(pid.indexOf('.')+1)});
export function setIcon(el){el.textContent='⠿';}
export class Value { constructor(value){this.value=value;}toString(){return String(this.value);} }
export class StringValue extends Value {} export class NumberValue extends Value {}
export class BooleanValue extends Value {isTruthy(){return this.value;}}
export class NullValue extends Value {toString(){return '';}}
export class TagValue extends StringValue {}
export class DateValue extends Value {static parseFromString(raw){return new DateValue(raw);}}
export class ListValue extends Value {length(){return this.value.length;}get(i){return new StringValue(this.value[i]);}}
`;
const bundled = await build({
  entryPoints: ['tests/browser/drag-fixture.js'],
  bundle: true,
  format: 'iife',
  write: false,
  plugins: [
    {
      name: 'obsidian-mock',
      setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'js' }));
      },
    },
  ],
});
const polyfill = `
HTMLElement.prototype.createEl=function(tag,opts={}){const el=document.createElement(tag);if(opts.cls)el.className=opts.cls;if(opts.text)el.textContent=opts.text;for(const key of ['type','href','title'])if(opts[key])el[key]=opts[key];for(const [key,val]of Object.entries(opts.attr??{}))el.setAttribute(key,val);this.append(el);return el;};
HTMLElement.prototype.createDiv=function(opts={}){return this.createEl('div',typeof opts==='string'?{cls:opts}:opts);};
HTMLElement.prototype.createSpan=function(opts={}){return this.createEl('span',opts);};
HTMLElement.prototype.empty=function(){this.replaceChildren();};
HTMLElement.prototype.addClass=function(cls){this.classList.add(cls);};
HTMLElement.prototype.removeClass=function(cls){this.classList.remove(cls);};
HTMLElement.prototype.toggleClass=function(cls,on){this.classList.toggle(cls,on);};
HTMLElement.prototype.hasClass=function(cls){return this.classList.contains(cls);};
`;
const css = await readFile('styles.css', 'utf8');
const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--background-primary:#202228;--background-secondary:#2a2d35;--background-modifier-border:#555;--background-modifier-hover:#39404c;--interactive-accent:#82aaff;--text-normal:#eee;--text-muted:#aaa;--font-ui-small:14px;--font-ui-smaller:12px;}body{background:#202228;color:#eee;font-family:sans-serif;margin:20px;}#fixture{height:560px;} ${css} .fixture-calendar{display:grid;grid-template-columns:1fr 1fr;gap:10px;overflow:auto}.fixture-calendar .wcc-calendar-cell{min-height:280px}.wcc-kanban-board{overflow:auto}.wcc-kanban-col{min-width:150px;}.fixture-track{position:relative;width:2000px;height:500px}.wcc-timeline-scroll{position:relative;height:100%;overflow:auto}</style></head><body><div id="fixture"></div><script>${polyfill}</script><script>${bundled.outputFiles[0].text}</script></body></html>`;
await writeFile('/tmp/wcc-drag-fixture.html', html);
const browser = await chromium.launch({ headless: true });
const point = async (page, selector) => {
  const locator = page.locator(selector).first();
  const b = await locator.boundingBox();
  if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  // Desktop move grips are hidden; use the actual card/header surface instead.
  const surface = await locator.evaluate((el) => {
    const parent = el.closest(
      '.wcc-list-row, .wcc-calendar-chip, .wcc-kanban-card, .wcc-kanban-col-hdr, .wcc-timeline-bar, .wcc-calendar-md-bar',
    );
    if (!parent)
      throw new Error(
        'No bounds for ' + el.outerHTML + ' parent ' + el.parentElement.outerHTML.slice(0, 1500),
      );
    const r = (
      parent.classList.contains('wcc-table-row')
        ? parent.querySelector('.wcc-table-title-cell')
        : parent
    ).getBoundingClientRect();
    return parent.classList.contains('wcc-timeline-bar')
      ? { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      : { x: r.right - 3, y: r.bottom - 3 };
  });
  return surface;
};
async function gesture(page, from, to, touch = false, { cancel = false, hold = false } = {}) {
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const event = async (type, p) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: p.x, y: p.y, id: 1 }],
      });
    await event('touchStart', from);
    if (hold) {
      await page.waitForTimeout(700);
      await page.locator('.wcc-drag-grip').first().dispatchEvent('contextmenu');
    }
    for (let i = 1; i <= 12; i++) {
      await event('touchMove', {
        x: from.x + ((to.x - from.x) * i) / 12,
        y: from.y + ((to.y - from.y) * i) / 12,
      });
      await page.waitForTimeout(12);
    }
    assert.ok((await page.locator('.wcc-drag-source').count()) <= 1, 'only one source can drag');
    assert.ok((await page.locator('.wcc-drag-preview').count()) <= 1, 'only one preview can drag');
    assert.ok(
      (await page.locator('.wcc-drop-feedback:not([hidden])').count()) <= 1,
      'only one drop position is shown',
    );
    await event(cancel ? 'touchCancel' : 'touchEnd', to);
    await cdp.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    assert.ok((await page.locator('.wcc-drag-source').count()) <= 1, 'only one source can drag');
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
}
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: touch ? 390 : 1000, height: 760 },
      isMobile: touch,
      hasTouch: touch,
      timezoneId: 'America/Chicago',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(html);
    for (const mode of ['list', 'calendar', 'kanban', 'timeline']) {
      await page.evaluate((mode) => window.setupDrag(mode), mode);
      const selectors = {
        list: '.wcc-list-row .wcc-drag-grip',
        calendar: '.wcc-calendar-chip .wcc-drag-grip',
        kanban: '.wcc-kanban-card .wcc-drag-grip',
        timeline: '.wcc-timeline-bar > button.wcc-drag-grip',
      };
      const from = await point(page, selectors[mode]);
      const to =
        mode === 'list'
          ? await point(page, '.wcc-list-group:nth-child(2) .wcc-list-items')
          : mode === 'calendar'
            ? await point(page, '.wcc-calendar-cell:nth-child(2)')
            : mode === 'kanban'
              ? await point(page, '.wcc-kanban-col:nth-child(2) .wcc-kanban-col-body')
              : { x: from.x + 60, y: from.y };
      await gesture(page, from, to, touch, { hold: touch });
      const state = await page.evaluate(() => window.dragState);
      assert.ok(state.writes.length, `${mode} ${touch ? 'touch' : 'mouse'} saved`);
      assert.equal(state.opens.length, 0, `${mode} drag must not open note`);
      assert.equal(state.menus, 0, `${mode} grip long-press must not open menu`);
      assert.equal(state.refreshes, 1, `${mode} only rebuilds after writes`);
      if (mode === 'list' || mode === 'kanban')
        assert.equal(state.frontmatter['A.md'].status, 'Done');
      else {
        assert.equal(state.frontmatter['A.md'].start, '2026-03-09');
        assert.equal(state.frontmatter['A.md'].end, '2026-03-10');
      }
      assert.equal(
        await page.locator('.wcc-drag-preview, .wcc-drag-source, .wcc-drag-active').count(),
        0,
        'drag cleaned up',
      );
      await page.evaluate((mode) => window.setupDrag(mode), mode);
      const cancelFrom = await point(page, selectors[mode]);
      await gesture(page, cancelFrom, { x: cancelFrom.x + 70, y: cancelFrom.y + 40 }, touch, {
        cancel: true,
      });
      assert.equal(
        await page.evaluate(() => window.dragState.writes.length),
        0,
        `${mode} cancelled drag never writes`,
      );
      assert.equal(
        await page.locator('.wcc-drag-preview, .wcc-drag-source, .wcc-drag-active').count(),
        0,
        'cancel cleaned up',
      );
    }
    // Column reordering preserves hidden columns; collapsed destinations retain existing cards.
    await page.evaluate(() => window.setupDrag('kanban'));
    await gesture(
      page,
      await point(page, '.wcc-kanban-col-hdr .wcc-drag-grip'),
      await point(page, '.wcc-kanban-col:nth-child(2) .wcc-kanban-col-hdr'),
      touch,
    );
    assert.deepEqual(await page.evaluate(() => window.dragState.config.columnOrder), [
      'Hidden',
      'Done',
      'Todo',
    ]);
    // A collapsed destination retains existing hidden cards.
    await page.evaluate(() => {
      window.setupDrag('kanban');
      const col = document.querySelectorAll('.wcc-kanban-col')[1];
      col.classList.add('wcc-kanban-col-collapsed');
      col.querySelector('.wcc-kanban-col-body').classList.add('wcc-kanban-col-body-collapsed');
    });
    await gesture(
      page,
      await point(page, '.wcc-kanban-card .wcc-drag-grip'),
      await point(page, '.wcc-kanban-col:nth-child(2) .wcc-kanban-col-body'),
      touch,
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(window.dragState.config.manualCardOrder)['||Done']),
      ['C.md', 'A.md'],
    );
    // Column and swimlane writes are atomic for the moved note.
    await page.evaluate(() => {
      window.setupDrag('kanban');
      window.dragState.config.subgroupProperty = 'note.project';
      document.querySelectorAll('.wcc-kanban-col')[1].dataset.subgroupKey = 'Project2';
      window.currentDragView.dragCards.find((card) => card.id === 'C.md').subgroupKey = 'Project2';
    });
    await gesture(
      page,
      await point(page, '.wcc-kanban-card .wcc-drag-grip'),
      await point(page, '.wcc-kanban-col:nth-child(2) .wcc-kanban-col-body'),
      touch,
    );
    const swimlane = await page.evaluate(() => window.dragState);
    assert.equal(swimlane.writes.length, 1);
    assert.equal(swimlane.frontmatter['A.md'].status, 'Done');
    assert.equal(swimlane.frontmatter['A.md'].project, 'Project2');
    // Horizontal edge scrolling brings an offscreen column into the drop area.
    await page.evaluate(() => {
      window.setupDrag('kanban');
      document.querySelectorAll('.wcc-kanban-col').forEach((col) => {
        col.style.width = '300px';
        col.style.minWidth = '300px';
      });
    });
    if (touch) {
      const from = await point(page, '.wcc-kanban-card .wcc-drag-grip');
      const board = await page.locator('.wcc-kanban-board').boundingBox();
      const edge = { x: board.x + board.width - 5, y: from.y };
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...from, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...edge, id: 1 }],
      });
      await page.waitForTimeout(350);
      assert.ok(
        (await page.locator('.wcc-kanban-board').evaluate((el) => el.scrollLeft)) > 100,
        'horizontal drag auto-scroll',
      );
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.dragState.frontmatter['A.md'].status), 'Done');
    }
    // Restore both axes after the scroll container DOM is rebuilt.
    assert.deepEqual(
      await page.evaluate(() => {
        const root = document.createElement('div');
        root.style.cssText = 'width:200px;height:100px;overflow:auto';
        const inner = document.createElement('div');
        inner.className = 'scroll-test';
        inner.style.cssText = 'width:400px;height:300px;overflow:auto';
        const content = document.createElement('div');
        content.style.cssText = 'width:1000px;height:1000px';
        inner.append(content);
        root.append(inner);
        document.body.append(root);
        root.scrollTop = 50;
        root.scrollLeft = 40;
        inner.scrollTop = 90;
        inner.scrollLeft = 80;
        const restore = window.rememberDragScroll(root, ['.scroll-test']);
        root.replaceChildren(inner.cloneNode(true));
        root.scrollTop = 0;
        root.scrollLeft = 0;
        restore();
        const next = root.firstElementChild;
        const result = [root.scrollTop, root.scrollLeft, next.scrollTop, next.scrollLeft];
        root.remove();
        return result;
      }),
      [50, 40, 90, 80],
    );
    // Timeline resizing, including DST and preventing an end before the start.
    await page.evaluate(() => window.setupDrag('timeline'));
    const right = await point(page, '.wcc-timeline-bar-handle-right');
    await gesture(page, right, { x: right.x + 30, y: right.y }, touch);
    assert.equal(await page.evaluate(() => window.dragState.frontmatter['A.md'].end), '2026-03-09');
    await page.evaluate(() => window.setupDrag('timeline'));
    const left = await point(page, '.wcc-timeline-bar-handle-left');
    await gesture(page, left, { x: left.x + 60, y: left.y }, touch);
    const resized = await page.evaluate(() => window.dragState.frontmatter['A.md']);
    assert.equal(resized.start, '2026-03-08');
    assert.equal(resized.end, '2026-03-08');
    assert.equal(
      await page.evaluate(() => {
        window.currentDragView.zoomLevel = 'month';
        return window.currentDragView
          .shiftedTimelineDate(new Date('2026-01-31T00:00:00'), 60)
          .getDate();
      }),
      28,
    );
    // Reorder using stable sibling IDs in both directions.
    for (const mode of ['list', 'calendar', 'kanban']) {
      await page.evaluate((mode) => window.setupDrag(mode), mode);
      const itemSelector = {
        list: '.wcc-list-row',
        calendar: '.wcc-calendar-chip',
        kanban: '.wcc-kanban-card',
      }[mode];
      const from = await point(page, itemSelector + ' .wcc-drag-grip');
      const second = await page.locator(itemSelector).nth(1).boundingBox();
      await gesture(
        page,
        from,
        { x: second.x + second.width / 2, y: second.y + second.height - 2 },
        touch,
      );
      const state = await page.evaluate(() => window.dragState);
      if (mode === 'calendar')
        assert.deepEqual(state.plugin.localOrder['2026-03-07'], ['B.md', 'A.md']);
      else if (mode === 'list') {
        assert.equal(state.frontmatter['B.md'].order, 0);
        assert.equal(state.frontmatter['A.md'].order, 10);
      } else assert.deepEqual(JSON.parse(state.config.manualCardOrder)['||Todo'], ['B.md', 'A.md']);
    }
    // Overflow cards are owned by this calendar even though their popover is in document.body.
    await page.evaluate(() => {
      window.setupDrag('calendar');
      window.dragState.openOverflow();
    });
    await page.waitForTimeout(40);
    await gesture(
      page,
      await point(page, '.wcc-calendar-more-popover .wcc-drag-grip'),
      await point(page, '.wcc-calendar-cell:nth-child(2)'),
      touch,
    );
    assert.equal(
      await page.evaluate(() => window.dragState.frontmatter['A.md'].start),
      '2026-03-09',
    );
    assert.equal(await page.locator('.wcc-calendar-more-popover').count(), 0);
    // Drops outside the owning pane never save.
    await page.evaluate(() => window.setupDrag('list'));
    await gesture(page, await point(page, '.wcc-list-row .wcc-drag-grip'), { x: 5, y: 5 }, touch);
    assert.equal(await page.evaluate(() => window.dragState.writes.length), 0);
    // Holding at a scroll boundary keeps scrolling, even without additional pointer moves.
    await page.evaluate(() => {
      window.setupDrag('list');
      const list = document.querySelector('.wcc-list-items');
      for (let i = 0; i < 20; i++) {
        const filler = document.createElement('div');
        filler.style.height = '60px';
        filler.style.flexShrink = '0';
        list.append(filler);
      }
    });
    const edgeFrom = await point(page, '.wcc-list-row .wcc-drag-grip');
    const viewport = await page.locator('.wcc-list-wrap').boundingBox();
    const edgeTo = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height - 8 };
    const edgeCdp = touch ? await context.newCDPSession(page) : null;
    if (touch) {
      await edgeCdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...edgeFrom, id: 1 }],
      });
      await edgeCdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...edgeTo, id: 1 }],
      });
    } else {
      await page.mouse.move(edgeFrom.x, edgeFrom.y);
      await page.mouse.down();
      await page.mouse.move(edgeTo.x, edgeTo.y, { steps: 10 });
    }
    await page.waitForTimeout(250);
    assert.ok(
      (await page.locator('.wcc-list-wrap').evaluate((el) => el.scrollTop)) > 20,
      'drag auto-scroll',
    );
    if (touch) {
      await edgeCdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await edgeCdp.detach();
    } else {
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
    if (touch) {
      // Swipe from regular card space scrolls without moving a task.
      await page.evaluate(() => {
        document.querySelector('.wcc-list-wrap').scrollTop = 0;
      });
      const cdp = await context.newCDPSession(page);
      const rect = await page.locator('.wcc-list-wrap').boundingBox();
      const x = rect.x + rect.width - 20,
        y = rect.y + 300;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - 20 * i, id: 1 }],
        });
        await page.waitForTimeout(15);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      assert.ok(
        (await page.locator('.wcc-list-wrap').evaluate((el) => el.scrollTop)) > 20,
        'normal swipe scrolling',
      );
      assert.equal(await page.evaluate(() => window.dragState.writes.length), 0);
    }
    // Compact month/week use the actual calendar renderer and retain full event details.
    for (const mode of ['month', 'week']) {
      await page.evaluate((mode) => window.setupCompactCalendar(mode), mode);
      await page.waitForTimeout(50);
      if (touch) {
        assert.equal(await page.locator('.wcc-calendar-compact').count(), 1);
        assert.equal(await page.locator('.wcc-calendar-chip').count(), 2);
        assert.equal(
          await page
            .locator('.wcc-calendar-compact-events .wcc-calendar-chip-props')
            .first()
            .isVisible(),
          true,
        );
        assert.equal(
          await page
            .locator(
              `.wcc-calendar-compact-date[data-calendar-date="${mode === 'month' ? '2026-03-08' : '2026-03-07'}"] .wcc-calendar-compact-count`,
            )
            .innerText(),
          '2',
        );
        if (mode === 'month') {
          assert.equal(await page.locator('.wcc-calendar-compact-month-grid').count(), 1);
          await page.locator('.wcc-calendar-compact-date[data-calendar-date="2026-03-09"]').tap();
          assert.equal(
            await page.locator('.wcc-calendar-compact-empty').innerText(),
            'No events for this day',
          );
          await page.locator('.wcc-calendar-compact-date[data-calendar-date="2026-03-07"]').tap();
          const from = await point(page, '.wcc-calendar-compact-events .wcc-drag-grip');
          const to = await point(
            page,
            '.wcc-calendar-compact-date[data-calendar-date="2026-03-09"]',
          );
          await gesture(page, from, to, true);
          assert.equal(
            await page.evaluate(() => window.dragState.frontmatter['A.md'].start),
            '2026-03-09',
          );
          assert.equal(
            await page.locator('.wcc-calendar-compact-selected').getAttribute('data-calendar-date'),
            '2026-03-09',
          );
          assert.equal(
            await page.locator('.wcc-calendar-compact-events .wcc-calendar-chip').count(),
            1,
          );
        } else {
          assert.equal(await page.locator('.wcc-calendar-compact-week-strip').count(), 1);
          assert.equal(await page.locator('.wcc-calendar-compact-date').count(), 7);
          await page.screenshot({ path: '/tmp/wcc-calendar-mobile-week-events.png' });
          await page.locator('.wcc-calendar-btn').last().tap();
          await page.waitForFunction(() => window.currentDragView.curDate.getDate() === 14);
          assert.equal(
            await page
              .locator('.wcc-calendar-compact-date')
              .first()
              .getAttribute('data-calendar-date'),
            '2026-03-08',
          );
        }
        assert.equal(
          await page.locator('body').evaluate((el) => el.scrollWidth > innerWidth),
          false,
          'no page horizontal overflow',
        );
        await page.screenshot({ path: `/tmp/wcc-calendar-mobile-${mode}.png` });
      } else {
        assert.equal(
          await page.locator('.wcc-calendar-compact').count(),
          0,
          'desktop keeps full grid',
        );
        assert.equal(await page.locator('.wcc-calendar-week').count(), mode === 'month' ? 6 : 1);
        assert.equal(await page.locator('.wcc-calendar-compact-panel').count(), 0);
        await page.screenshot({ path: `/tmp/wcc-calendar-desktop-${mode}.png` });
      }
    }
    if (!touch) {
      // Exercise the real month layout with crowded days and visible properties.
      for (const expand of [false, true]) {
        await page.evaluate((expand) => window.setupCrowdedCalendar(expand), expand);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(
          await page.locator('.wcc-calendar-chip .wcc-drag-grip').first().isVisible(),
          false,
          'desktop move handles stay hidden',
        );
        const clipped = await page
          .locator('.wcc-calendar-chip, .wcc-calendar-more')
          .evaluateAll((els) =>
            els.some((el) => {
              const r = el.getBoundingClientRect(),
                cell = el.closest('.wcc-calendar-cell').getBoundingClientRect();
              return r.top < cell.top || r.bottom > cell.bottom + 1;
            }),
          );
        assert.equal(clipped, false, 'complete cards and more control fit inside their day');
        if (!expand) {
          assert.equal(await page.locator('.wcc-calendar-more').innerText(), '+5 more');
          await page.screenshot({ path: '/tmp/wcc-calendar-crowded-month.png' });
          const title = page.locator('.wcc-calendar-chip-link').first();
          await title.click();
          assert.equal(
            await page.evaluate(() => window.dragState.opens.length),
            1,
            'ordinary title click opens note',
          );
          const from = await point(page, '.wcc-calendar-chip-link');
          const second = await page.locator('.wcc-calendar-chip').nth(1).boundingBox();
          await gesture(
            page,
            from,
            { x: second.x + second.width / 2, y: second.y + second.height - 2 },
            false,
          );
          assert.deepEqual(
            await page.evaluate(() => window.dragState.plugin.localOrder['2026-03-07']),
            ['B.md', 'A.md', 'C.md', 'D.md', 'E.md', 'F.md', 'G.md'],
            'title drag reorders only one event and retains hidden siblings',
          );
          assert.equal(
            await page.evaluate(() => window.dragState.opens.length),
            1,
            'title drag does not open another note',
          );
          await page.evaluate(() => window.setupCrowdedCalendar());
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          const to = await point(page, '.wcc-calendar-cell[data-calendar-date="2026-03-09"]');
          await gesture(page, await point(page, '.wcc-calendar-chip-link'), to, false);
          assert.equal(
            await page.evaluate(() => window.dragState.frontmatter['A.md'].start),
            '2026-03-09',
            'title drag reschedules event',
          );
        }
      }
    }
    if (touch) {
      // Feedback stays above the preview; a second controller cannot start even during saving.
      await page.evaluate(() => {
        window.setupDrag('calendar');
        window.installCompetingDrag();
        window.dragState.holdSave = true;
      });
      const cdp = await context.newCDPSession(page);
      const from = await point(page, '.wcc-calendar-chip .wcc-drag-grip');
      const to = await point(page, '.wcc-calendar-cell:nth-child(2)');
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...from, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...to, id: 1 }],
      });
      await page.waitForTimeout(80);
      assert.equal(await page.locator('.wcc-drag-source').count(), 1);
      assert.equal(await page.locator('.wcc-drag-preview').count(), 1);
      assert.equal(await page.locator('.wcc-drop-feedback:not([hidden])').count(), 1);
      assert.equal(
        await page.locator('.wcc-drop-feedback:not([hidden])').innerText(),
        '',
        'drop feedback has no visible text',
      );
      assert.match(
        await page.locator('.wcc-drop-feedback:not([hidden])').getAttribute('aria-label'),
        /Mar 9/,
      );
      const feedback = await page.locator('.wcc-drop-feedback:not([hidden])').evaluate((el) => ({
        fixed: getComputedStyle(el).position,
        pointer: getComputedStyle(el).pointerEvents,
        z: Number(getComputedStyle(el).zIndex),
      }));
      assert.equal(feedback.fixed, 'fixed');
      assert.equal(feedback.pointer, 'none');
      assert.ok(feedback.z > 99999);
      await page.screenshot({ path: '/tmp/wcc-calendar-mobile-drop-feedback.png' });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => typeof window.dragState.releaseSave === 'function');
      await gesture(
        page,
        await point(page, '.wcc-calendar-chip:nth-child(2) .wcc-drag-grip'),
        to,
        true,
      );
      assert.equal(
        await page.evaluate(() => window.dragState.competingStarts),
        0,
        'only one drag controller owns the gesture and pending save',
      );
      await page.evaluate(() => {
        window.dragState.holdSave = false;
        window.dragState.releaseSave();
      });
      await page.waitForFunction(() => window.dragState.refreshes === 1);
      assert.deepEqual(
        await page.evaluate(() => window.dragState.writes.map((write) => write.path)),
        ['A.md'],
        'rescheduling writes only the single dragged event',
      );
      assert.equal(await page.locator('.wcc-drop-feedback:not([hidden])').count(), 0);
      await page.evaluate(() => window.competingDrag.destroy());
      await cdp.detach();
    }
    // Sticky title cells mask timeline bars while scrolling; resizing stays independent of event dragging.
    await page.evaluate(() => window.setupViewFields('timeline'));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.locator('.wcc-timeline-scroll').evaluate((el) => {
      el.style.width = Math.min(500, window.innerWidth - 40) + 'px';
      el.scrollLeft = 220;
    });
    const masked = await page.evaluate(() => {
      const label = document.querySelector('.wcc-timeline-row-label'),
        bar = document.querySelector('.wcc-timeline-bar');
      const l = label.getBoundingClientRect(),
        b = bar.getBoundingClientRect();
      const x = Math.max(l.left + 5, b.left + 5);
      const hit = document.elementFromPoint(x, b.top + b.height / 2);
      return {
        overlap: x < l.right && b.left < l.right,
        sticky:
          Math.abs(
            l.left - document.querySelector('.wcc-timeline-scroll').getBoundingClientRect().left,
          ) < 1,
        masked: !!hit?.closest('.wcc-timeline-row-label'),
      };
    });
    assert.equal(masked.overlap, true, 'test event scrolls into the frozen title region');
    assert.equal(masked.sticky, true, 'title cells stay at the left edge during horizontal scroll');
    assert.equal(masked.masked, true, 'timeline bars never cover title cells while scrolling');
    await page.locator('.wcc-timeline-scroll').evaluate((el) => {
      el.scrollLeft = 0;
    });
    const divider = page.getByRole('separator', { name: 'Resize title column' });
    const bounds = await divider.boundingBox();
    const resizeFrom = { x: bounds.x + bounds.width / 2, y: bounds.y + 15 };
    await gesture(page, resizeFrom, { x: resizeFrom.x + 100, y: resizeFrom.y }, touch);
    assert.equal(
      await page.evaluate(() => window.dragState.config.labelWidth),
      300,
      'divider saves the resized title width',
    );
    assert.equal(
      await page
        .locator('.wcc-timeline-row-label')
        .first()
        .evaluate((el) => el.getBoundingClientRect().width),
      300,
    );
    assert.equal(
      await page.locator('.wcc-timeline-bars-layer').evaluate((el) => getComputedStyle(el).left),
      '300px',
      'bars align with the resized column',
    );
    assert.equal(
      await page.evaluate(() => window.dragState.writes.length),
      0,
      'resizing never edits event dates',
    );
    await divider.focus();
    await divider.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.dragState.config.labelWidth), 290);
    await divider.press('Home');
    assert.equal(await page.evaluate(() => window.dragState.config.labelWidth), 200);
    await page.screenshot({
      path: touch ? '/tmp/wcc-timeline-touch-resize.png' : '/tmp/wcc-timeline-sticky-resize.png',
    });
    if (touch) {
      await page.evaluate(() => window.setupMobileTimeline());
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal(
        await page.locator('.wcc-timeline-mobile').count(),
        1,
        'small touch timeline uses stacked details',
      );
      assert.equal(
        await page.getByRole('separator', { name: 'Resize title column' }).count(),
        0,
        'mobile has no narrow sidebar',
      );
      const layout = await page.evaluate(() => {
        const pane = document.querySelector('.wcc-timeline-scroll').getBoundingClientRect();
        const labels = [...document.querySelectorAll('.wcc-timeline-row-label')].map((label) =>
          label.getBoundingClientRect(),
        );
        const bars = [...document.querySelectorAll('.wcc-timeline-bar')].map((bar) =>
          bar.getBoundingClientRect(),
        );
        return {
          width: labels[0].width,
          paneWidth: pane.width,
          titleHeight: document.querySelector('.wcc-timeline-row-title').getBoundingClientRect()
            .height,
          lanes: bars.every(
            (bar, i) =>
              bar.top >= labels[i].bottom &&
              (i === labels.length - 1 || bar.bottom <= labels[i + 1].top),
          ),
        };
      });
      assert.ok(
        Math.abs(layout.width - layout.paneWidth) < 2,
        'details occupy the full mobile pane',
      );
      assert.ok(layout.titleHeight > 20, 'long mobile titles wrap');
      assert.equal(
        layout.lanes,
        true,
        'event lanes do not overlap note details or neighboring rows',
      );
      await page.getByRole('button', { name: /Show Prepare project.*on timeline/ }).click();
      assert.equal(
        await page
          .locator('.wcc-timeline-swimlane-label')
          .first()
          .evaluate(
            (el) =>
              Math.abs(
                el.getBoundingClientRect().left -
                  document.querySelector('.wcc-timeline-scroll').getBoundingClientRect().left,
              ) < 12,
          ),
        true,
        'mobile group names stay readable while scrolling dates',
      );
      const barFrom = await point(page, '.wcc-timeline-bar > button.wcc-drag-grip');
      await gesture(page, barFrom, { x: barFrom.x + 88, y: barFrom.y }, true);
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].start),
        '2026-03-09',
        'mobile stacked lane drag moves exactly two days across DST',
      );
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].end),
        '2026-03-10',
      );
      assert.deepEqual(
        await page.evaluate(() => window.dragState.writes.map((write) => write.path)),
        ['A.md'],
        'mobile timeline moves only one item',
      );
      const endGrip = await point(page, '.wcc-timeline-bar .wcc-timeline-bar-handle-right');
      await gesture(page, endGrip, { x: endGrip.x + 44, y: endGrip.y }, true);
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].end),
        '2026-03-11',
        'stacked lane end grip resizes by one day',
      );
      await page.evaluate(() => window.setupMobileTimeline());
      const start = page.getByLabel(/Start date for Prepare project/);
      await start.fill('2026-03-10');
      await start.dispatchEvent('change');
      await page.waitForFunction(() => window.dragState.frontmatter['A.md'].start === '2026-03-10');
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].end),
        '2026-03-10',
        'start changes keep an earlier end valid',
      );
      const end = page.getByLabel(/End date for Prepare project/);
      await end.fill('2026-03-12');
      await end.dispatchEvent('change');
      await page.waitForFunction(() => window.dragState.frontmatter['A.md'].end === '2026-03-12');
      await end.fill('');
      await end.dispatchEvent('change');
      await page.waitForFunction(() => window.dragState.frontmatter['A.md'].end === null);
      assert.equal(
        await page.evaluate(() => window.dragState.opens.length),
        0,
        'date editing never opens notes',
      );
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('.wcc-timeline-mobile-date input')].some(
            (input) => input.disabled,
          ),
      );
      await page.evaluate(() => {
        window.dragState.fail = true;
      });
      await end.fill('2026-03-13');
      await end.dispatchEvent('change');
      await page.waitForFunction(() =>
        window.dragState.notices.includes('Failed to update timeline date.'),
      );
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].end),
        null,
        'failed date edit preserves the saved range',
      );
      assert.equal(await end.inputValue(), '', 'failed date edit restores the input');
      await page.evaluate(() => {
        window.dragState.fail = false;
      });
      await page.getByRole('button', { name: /Show Prepare project.*on timeline/ }).click();
      await page.screenshot({ path: '/tmp/wcc-timeline-mobile-stacked.png' });
      await page.evaluate(() => {
        window.currentDragView.wrap.style.width = '750px';
      });
      await page.waitForFunction(() => !document.querySelector('.wcc-timeline-mobile'));
      assert.equal(
        await page.getByRole('separator', { name: 'Resize title column' }).count(),
        1,
        'wide touch panes retain the desktop timeline',
      );
      await page.evaluate(() => {
        window.currentDragView.wrap.style.width = '';
      });
      await page.waitForFunction(() => !!document.querySelector('.wcc-timeline-mobile'));
      await page.evaluate(() => {
        const view = window.currentDragView;
        window.dragState.config.mobileLayout = false;
        view.wrap.empty();
        view.buildContent(view.wrap.createDiv('wcc-timeline-scroll'));
      });
      assert.equal(
        await page.locator('.wcc-timeline-mobile').count(),
        0,
        'per-view setting can retain the original layout',
      );
    }
    // Ungrouped tables must keep actual table layout, including fresh views without saved columns.
    for (const fresh of [false, true]) {
      await page.evaluate((fresh) => window.setupUngroupedTable(fresh), fresh);
      const metrics = await page.evaluate(() => {
        const body = document.querySelector('.wcc-table-table tbody');
        const rows = [...document.querySelectorAll('.wcc-table-row')];
        const heads = [...document.querySelectorAll('.wcc-table-table thead th')].map((cell) =>
          cell.getBoundingClientRect(),
        );
        return {
          display: getComputedStyle(body).display,
          columns: heads.length,
          aligned: rows.every((row) =>
            [...row.cells].every((cell, i) => {
              const rect = cell.getBoundingClientRect();
              return (
                Math.abs(rect.left - heads[i].left) < 1 && Math.abs(rect.width - heads[i].width) < 1
              );
            }),
          ),
        };
      });
      assert.equal(
        metrics.display,
        'table-row-group',
        'ungrouped table never uses the List flex layout',
      );
      assert.equal(
        metrics.columns,
        fresh ? 1 : 7,
        'Table uses exactly the native Properties selection',
      );
      assert.equal(
        metrics.aligned,
        true,
        'short and wrapped titles share exactly aligned table columns',
      );
      if (fresh) {
        assert.deepEqual(
          await page.evaluate(() => window.dragState.config.order),
          ['file.name'],
          'Table does not invent default columns',
        );
        await page.evaluate(() => {
          const view = window.currentDragView;
          window.dragState.config.order = ['file.name'];
          view.wrap.empty();
          view.buildList();
        });
        assert.equal(
          await page.locator('.wcc-table-table thead th').count(),
          1,
          'explicit user column selections remain respected',
        );
        const nativeAppearance = await page.evaluate(() => {
          const pane = document.querySelector('.wcc-table-wrap').getBoundingClientRect();
          const table = document.querySelector('.wcc-table-table').getBoundingClientRect();
          const link = document.querySelector('.wcc-table-row .wcc-list-row-link');
          return {
            width: table.width,
            paneWidth: pane.width,
            underlined: getComputedStyle(link).textDecorationLine.includes('underline'),
            caption: document.querySelector('.wcc-table-header-label').textContent,
          };
        });
        assert.ok(
          Math.abs(nativeAppearance.width - nativeAppearance.paneWidth) < 2,
          'one-column table fills the pane like the native table',
        );
        assert.equal(nativeAppearance.underlined, true, 'note names retain native link styling');
        assert.ok(nativeAppearance.caption.includes('file name'));
        await page.screenshot({
          path: touch ? '/tmp/wcc-table-native-mobile.png' : '/tmp/wcc-table-native-desktop.png',
        });
      }
    }
    await page.evaluate(() => window.setupUngroupedTable(false));
    const rowFrom = await point(page, '.wcc-table-row .wcc-drag-grip');
    const lastTitle = await page.locator('.wcc-table-title-cell').nth(2).boundingBox();
    await gesture(
      page,
      rowFrom,
      { x: lastTitle.x + lastTitle.width / 2, y: lastTitle.y + lastTitle.height - 2 },
      touch,
    );
    assert.equal(
      await page.evaluate(() => window.dragState.frontmatter['A.md'].order),
      20,
      'ungrouped table reorder saves numeric ranks',
    );
    await page.evaluate(() => window.setupUngroupedTable(true));
    await page.screenshot({
      path: touch ? '/tmp/wcc-table-ungrouped-mobile.png' : '/tmp/wcc-table-ungrouped-desktop.png',
    });
    await page.evaluate(() => window.setupViewFields('table'));
    const projectHeader = await page.locator('.wcc-table-table thead th').nth(1).boundingBox();
    const nameHeader = await page.locator('.wcc-table-table thead th').first().boundingBox();
    const propertyFrom = touch
      ? await point(page, '.wcc-table-table thead th:nth-child(2) .wcc-drag-grip')
      : {
          x: projectHeader.x + projectHeader.width / 2,
          y: projectHeader.y + projectHeader.height / 2,
        };
    await gesture(
      page,
      propertyFrom,
      { x: nameHeader.x + nameHeader.width / 4, y: nameHeader.y + nameHeader.height / 2 },
      touch,
    );
    assert.deepEqual(
      (await page.evaluate(() => window.dragState.config.order)).slice(0, 2),
      ['note.project', 'file.name'],
      'property columns can drag before file name',
    );
    await page.evaluate(() => {
      const view = window.currentDragView;
      view.wrap.empty();
      view.buildList();
    });
    assert.equal(
      await page.locator('.wcc-table-table thead th').first().getAttribute('data-property-id'),
      'note.project',
      'property remains before file name after refresh',
    );
    // Column dragging persists the native property order without touching notes or column widths.
    await page.evaluate(() => {
      window.setupViewFields('table');
      const view = window.currentDragView,
        original = view.config.getOrder;
      view.config.getOrder = () => window.dragState.config.order ?? original();
      view.wrap.empty();
      view.buildList();
    });
    const firstHeader = await page.locator('.wcc-table-table thead th').first().boundingBox();
    const secondHeader = await page.locator('.wcc-table-table thead th').nth(1).boundingBox();
    const columnFrom = touch
      ? await point(page, '.wcc-table-table thead th:first-child .wcc-drag-grip')
      : { x: firstHeader.x + firstHeader.width / 2, y: firstHeader.y + firstHeader.height / 2 };
    const columnTo = {
      x: secondHeader.x + secondHeader.width * 0.75,
      y: secondHeader.y + secondHeader.height / 2,
    };
    await gesture(page, columnFrom, columnTo, touch);
    const reordered = await page.evaluate(() => window.dragState.config.order);
    assert.deepEqual(
      reordered.slice(0, 3),
      ['note.project', 'file.name', 'note.order'],
      'file name can move along with any property column',
    );
    assert.equal(
      await page.evaluate(() => window.dragState.writes.length),
      0,
      'column order never changes note properties',
    );
    assert.equal(
      await page.evaluate(() => window.dragState.opens.length),
      0,
      'column drag never opens notes',
    );
    await page.evaluate(() => {
      const view = window.currentDragView;
      view.wrap.empty();
      view.buildList();
    });
    assert.equal(
      await page.locator('.wcc-table-table thead th').nth(1).getAttribute('data-property-id'),
      'file.name',
      'column order survives rebuild',
    );
    assert.equal(
      await page
        .locator('.wcc-table-row')
        .first()
        .evaluate((row) =>
          [...row.cells].every(
            (cell, i) =>
              cell.dataset.propertyId ===
              document.querySelectorAll('.wcc-table-table thead th')[i].dataset.propertyId,
          ),
        ),
      true,
      'every cell follows its column',
    );
    assert.equal(
      await page
        .locator('.wcc-table-title-cell')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
      touch ? 140 : 260,
      'name width stays attached to its property',
    );
    const savedBeforeCancel = await page.evaluate(() =>
      JSON.stringify(window.dragState.config.order),
    );
    await page.evaluate(() => {
      window.currentDragView.wrap.scrollLeft = 0;
    });
    const cancelHeader = await page.locator('.wcc-table-table thead th').first().boundingBox();
    const cancelFrom = touch
      ? await point(page, '.wcc-table-table thead th:first-child .wcc-drag-grip')
      : { x: cancelHeader.x + cancelHeader.width / 2, y: cancelHeader.y + cancelHeader.height / 2 };
    await gesture(page, cancelFrom, { x: cancelFrom.x + 80, y: cancelFrom.y }, touch, {
      cancel: true,
    });
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.dragState.config.order)),
      savedBeforeCancel,
      'cancelled column drag preserves order',
    );
    await page.locator('.wcc-table-table thead th').first().focus();
    await page.keyboard.press('Alt+ArrowRight');
    assert.equal(
      await page.evaluate(() => window.dragState.config.order[1]),
      'note.project',
      'columns also reorder with the keyboard',
    );
    // Sticky headers must remain draggable after the table body has scrolled.
    await page.evaluate(async () => {
      window.setupViewFields('table');
      const view = window.currentDragView;
      window.dragState.config.itemPadding = 11;
      await window.refreshTable();
      view.wrap.style.height = '140px';
      view.wrap.querySelectorAll('.wcc-table-row').forEach((row) => (row.style.height = '140px'));
      view.wrap.scrollTop = 100;
    });
    assert.equal(
      await page
        .locator('.wcc-table-wrap')
        .evaluate((el) => el.style.getPropertyValue('--wcc-item-padding')),
      '11px',
      'Table retains custom spacing',
    );
    assert.equal(
      await page.locator('.wcc-table-table').getAttribute('aria-label'),
      null,
      'no table-wide Notes tooltip',
    );
    const scrolledFirst = await page.locator('.wcc-table-table thead th').first().boundingBox();
    const scrolledSecond = await page.locator('.wcc-table-table thead th').nth(1).boundingBox();
    const scrolledFrom = touch
      ? await point(page, '.wcc-table-table thead th:first-child .wcc-drag-grip')
      : {
          x: scrolledFirst.x + scrolledFirst.width / 2,
          y: scrolledFirst.y + scrolledFirst.height / 2,
        };
    await gesture(
      page,
      scrolledFrom,
      {
        x: scrolledSecond.x + scrolledSecond.width * 0.75,
        y: scrolledSecond.y + scrolledSecond.height / 2,
      },
      touch,
    );
    assert.deepEqual(
      (await page.evaluate(() => window.dragState.config.order)).slice(0, 2),
      ['note.project', 'file.name'],
      'sticky header drag saves native column order',
    );
    // Table rows use the shared drag engine, keep properties in cells, and persist column sizes.
    await page.evaluate(() => window.setupViewFields('table'));
    assert.equal(await page.locator('.wcc-table-table thead th').count(), 7);
    assert.equal(await page.locator('.wcc-table-row').count(), 3);
    const tableFrom = await point(page, '.wcc-table-row .wcc-drag-grip');
    const tableTarget = await point(
      page,
      '.wcc-table-table tbody:nth-of-type(2) .wcc-table-title-cell',
    );
    await gesture(page, tableFrom, tableTarget, touch);
    assert.equal(
      await page.evaluate(() => window.dragState.frontmatter['A.md'].status),
      'Done',
      'table drag changes groups',
    );
    assert.equal(
      await page.evaluate(() => window.dragState.opens.length),
      0,
      'table drag never opens notes',
    );
    await page.evaluate(() => window.setupViewFields('table'));
    const tableHandle = page.getByRole('separator', { name: 'Resize Name column' });
    const tableBounds = await tableHandle.boundingBox();
    const tableResizeFrom = {
      x: tableBounds.x + tableBounds.width / 2,
      y: tableBounds.y + tableBounds.height / 2,
    };
    await gesture(
      page,
      tableResizeFrom,
      { x: tableResizeFrom.x + 50, y: tableResizeFrom.y },
      touch,
    );
    assert.equal(
      await page.evaluate(() => window.dragState.config.columnWidths['file.name']),
      touch ? 190 : 310,
    );
    await page.evaluate(() => {
      window.currentDragView.wrap.empty();
      window.currentDragView.buildList();
    });
    assert.equal(
      await page
        .locator('.wcc-table-title-cell')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
      touch ? 190 : 310,
      'column width persists when rebuilt',
    );
    await page.locator('.wcc-table-wrap').evaluate((el) => {
      el.style.width = '350px';
      el.scrollLeft = 250;
    });
    const pinned = await page.evaluate(() => {
      const label = document.querySelector('.wcc-table-title-cell'),
        wrap = document.querySelector('.wcc-table-wrap');
      return Math.abs(label.getBoundingClientRect().left - wrap.getBoundingClientRect().left) < 1;
    });
    assert.equal(
      pinned,
      false,
      'file name scrolls in its chosen position like other native columns',
    );
    await page.locator('.wcc-table-wrap').evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.locator('.wcc-table-row .wcc-list-row-link').first().click();
    assert.equal(await page.evaluate(() => window.dragState.opens.length), 1);
    await page.evaluate(() => {
      const view = window.currentDragView;
      window.dragState.config.order = [...view.config.getOrder(), 'note.newField'];
      view.wrap.style.width = '';
      view.wrap.empty();
      view.buildList();
    });
    assert.equal(
      await page
        .locator('.wcc-table-title-cell')
        .first()
        .evaluate((el) => getComputedStyle(el).position),
      'static',
      'file name has no special pinned-column behavior',
    );
    assert.equal(
      await page.getByLabel('Edit note.newField', { exact: true }).count(),
      3,
      'new custom properties render empty editable cells',
    );
    await page.getByLabel('Edit note.newField', { exact: true }).first().click();
    await page
      .getByRole('textbox', { name: 'note.newField', exact: true })
      .fill('Created in table');
    await page.getByRole('textbox', { name: 'note.newField', exact: true }).press('Enter');
    assert.equal(
      await page.evaluate(() => window.dragState.frontmatter['A.md'].newField),
      'Created in table',
    );
    await page.evaluate(() => {
      window.dragState.creates = [];
      window.currentDragView.createFileForView = async (title, processor) => {
        const fm = { project: 'Filter default', templateOnly: 'Kept' };
        processor(fm);
        window.dragState.creates.push(fm);
      };
    });
    await page.getByRole('button', { name: 'Add note in Done', exact: true }).click();
    assert.deepEqual(
      await page.evaluate(() => window.dragState.creates),
      [{ project: 'Filter default', templateOnly: 'Kept', status: 'Done' }],
      'table adds retain native filter defaults and set the target group',
    );
    await page.screenshot({
      path: touch ? '/tmp/wcc-table-mobile.png' : '/tmp/wcc-table-desktop.png',
    });
    // Rendered fields share links, typed editing, completion controls, and cancellation.
    for (const mode of ['list', 'calendar', 'kanban', 'timeline', 'table']) {
      await page.evaluate((mode) => window.setupViewFields(mode), mode);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const prefix = {
        list: 'wcc-list',
        calendar: 'wcc-calendar',
        kanban: 'wcc-kanban',
        timeline: 'wcc-timeline',
        table: 'wcc-table',
      }[mode];
      if (mode !== 'table') {
        const completion = page.getByRole('checkbox', { name: /Mark A / }).first();
        await completion.click();
        await page.waitForFunction(
          (el) => el.getAttribute('aria-checked') === 'true',
          await completion.elementHandle(),
        );
        await completion.click();
        await page.waitForFunction(
          (el) => el.getAttribute('aria-checked') === 'false',
          await completion.elementHandle(),
        );
        assert.equal(
          await page.evaluate(() => window.dragState.frontmatter['A.md'].newCompletion),
          false,
          `${mode} completion creates a previously nonexistent property with typed booleans`,
        );
      }
      await page.locator(`.${prefix}-prop-value a`).first().click();
      assert.equal(
        await page.evaluate(() => window.dragState.links[0][0]),
        'Project',
        `${mode} property link opens its target`,
      );
      assert.equal(
        await page.evaluate(() => window.dragState.opens.length),
        0,
        `${mode} property link does not open its parent note`,
      );
      await page.getByLabel('Edit note.order', { exact: true }).first().click();
      const number = page.getByRole('spinbutton', { name: 'note.order', exact: true });
      await number.fill('2.5');
      await number.press('Enter');
      assert.equal(await page.evaluate(() => window.dragState.frontmatter['A.md'].order), 2.5);
      const toggle = page.getByRole('switch', { name: 'note.flag', exact: true }).first();
      await toggle.click();
      await toggle.click();
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].flag),
        false,
        `${mode} repeated toggle works`,
      );
      await page.getByLabel('Edit note.empty', { exact: true }).first().click();
      const empty = page.getByRole('textbox', { name: 'note.empty', exact: true });
      await empty.fill('Discard this');
      await empty.press('Escape');
      assert.equal(
        await page.evaluate(() => window.dragState.frontmatter['A.md'].empty),
        undefined,
      );
      await page.getByLabel('Edit note.tags', { exact: true }).first().focus();
      await page.keyboard.press('Enter');
      const list = page.getByRole('textbox', { name: 'note.tags', exact: true });
      await list.fill('[[Project|Work]]\n[[Second]]');
      if (mode === 'timeline') {
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const rows = await page.locator('.wcc-timeline-row').evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          }),
        );
        assert.ok(
          rows[1].top >= rows[0].bottom,
          'timeline multiline editor fits without covering the next row',
        );
      }
      await list.press('Control+Enter');
      assert.deepEqual(await page.evaluate(() => window.dragState.frontmatter['A.md'].tags), [
        '[[Project|Work]]',
        '[[Second]]',
      ]);
      assert.equal(
        await page.getByLabel('Edit file.flag', { exact: true }).count(),
        0,
        `${mode} file property stays read-only`,
      );
    }
    if (!touch) {
      for (const mode of ['list', 'kanban', 'timeline']) {
        await page.evaluate(
          (mode) => (mode === 'timeline' ? window.setupViewFields(mode) : window.setupDrag(mode)),
          mode,
        );
        const selector = {
          list: '.wcc-list-row-link',
          kanban: '.wcc-kanban-card-link',
          timeline: '.wcc-timeline-row-title',
        }[mode];
        await page.locator(selector).first().click();
        assert.equal(
          await page.evaluate(() => window.dragState.opens.length),
          1,
          `${mode} title click opens note`,
        );
        const from = await point(page, selector);
        const to =
          mode === 'list'
            ? await point(page, '.wcc-list-group:nth-child(2) .wcc-list-items')
            : mode === 'kanban'
              ? await point(page, '.wcc-kanban-col:nth-child(2) .wcc-kanban-col-body')
              : { x: from.x + 60, y: from.y };
        await gesture(page, from, to, false);
        assert.equal(
          await page.evaluate(() => window.dragState.opens.length),
          1,
          `${mode} title drag does not open note`,
        );
        const fm = await page.evaluate(() => window.dragState.frontmatter['A.md']);
        assert.equal(
          mode === 'timeline' ? fm.start : fm.status,
          mode === 'timeline' ? '2026-03-09' : 'Done',
          `${mode} title drag saves`,
        );
      }
    }
    // Drags can start on a checkbox, property link, or details arrow without its click.
    for (const mode of ['list', 'calendar']) {
      for (const surface of ['checkbox', 'property', 'details']) {
        await page.evaluate((mode) => window.setupCardSurface(mode), mode);
        const source =
          mode === 'list'
            ? `[data-item-id="A.md"] ${surface === 'checkbox' ? '.wcc-list-check' : surface === 'details' ? '.wcc-list-details' : '.wcc-list-prop-value a'}`
            : `[data-event-id="A.md"] ${surface === 'checkbox' ? '.wcc-calendar-check' : surface === 'details' ? '.wcc-calendar-details' : '.wcc-calendar-prop-value a'}`;
        const destination =
          mode === 'list'
            ? '.wcc-list-group:nth-child(2) .wcc-list-items'
            : '.wcc-calendar-cell:nth-child(2) .wcc-calendar-evs';
        await gesture(page, await point(page, source), await point(page, destination), touch, {
          hold: touch,
        });
        const fm = await page.evaluate(() => window.dragState.frontmatter['A.md']);
        assert.equal(
          mode === 'list' ? fm.status : fm.start,
          mode === 'list' ? 'Done' : '2026-03-09',
        );
        assert.equal(fm.done, false, 'dragging a checkbox must not toggle completion');
        assert.equal(
          await page.evaluate(() => window.dragState.links.length),
          0,
          'dragging a link must not open it',
        );
        assert.equal(await page.evaluate(() => window.dragState.opens.length), 0);
        assert.equal(
          await page.locator('input,textarea').count(),
          0,
          'dragging metadata must not start an editor',
        );
      }
    }
    for (const mode of ['day', 'week', 'month']) {
      await page.evaluate((mode) => window.setupTimelineDefault(mode), mode);
      assert.equal(
        await page.locator('.wcc-timeline-zoom[aria-pressed="true"]').innerText(),
        mode[0].toUpperCase() + mode.slice(1),
      );
      const temporary = mode === 'month' ? 'Day' : 'Month';
      await page.getByRole('button', { name: temporary, exact: true }).click();
      await page.evaluate(() => window.currentDragView.onDataUpdated());
      assert.equal(
        await page.locator('.wcc-timeline-zoom[aria-pressed="true"]').innerText(),
        temporary,
        'timeline temporary zoom survives refresh',
      );
      await page.evaluate(async () => {
        window.dragState.config.zoomLevel = 'week';
        await window.currentDragView.onDataUpdated();
      });
      if (mode !== 'week')
        assert.equal(
          await page.locator('.wcc-timeline-zoom[aria-pressed="true"]').innerText(),
          'Week',
          'timeline changed default applies',
        );
    }
    // Timeline columns stay at local midnight and retain exact day widths across DST.
    await page.evaluate(() => {
      window.setupDrag('timeline');
      window.currentDragView.windowEnd = new Date(2026, 2, 15);
      window.currentDragView.cols = window.currentDragView.buildCols();
    });
    assert.equal(
      await page.evaluate(() => window.currentDragView.cols.every((date) => date.getHours() === 0)),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.currentDragView.dateToPixel(new Date(2026, 2, 9)) -
          window.currentDragView.dateToPixel(new Date(2026, 2, 8)),
      ),
      30,
    );
    // Long titles wrap, padding stays local, and timeline rows grow without overlap.
    for (const mode of ['list', 'calendar', 'kanban', 'timeline']) {
      for (const padding of [undefined, 0, 14]) {
        await page.evaluate(({ mode, padding }) => window.setupLongTitles(mode, padding), {
          mode,
          padding,
        });
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const selectors = {
          list: '.wcc-list-row-link',
          calendar: '.wcc-calendar-chip-link',
          kanban: '.wcc-kanban-card-link',
          timeline: '.wcc-timeline-row-title',
        };
        const metrics = await page
          .locator(selectors[mode])
          .first()
          .evaluate((el) => ({
            height: el.getBoundingClientRect().height,
            line: parseFloat(getComputedStyle(el).lineHeight),
            fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
            padding: getComputedStyle(
              el.closest(
                '.wcc-list-row, .wcc-calendar-chip, .wcc-kanban-card, .wcc-timeline-row-label',
              ),
            ).paddingTop,
          }));
        assert.ok(
          metrics.height > metrics.line * 2,
          `${mode} ${touch ? 'touch' : 'mouse'} padding ${padding} long title wraps: ${JSON.stringify(metrics)}`,
        );
        assert.ok(metrics.fits, `${mode} complete title fits`);
        assert.equal(metrics.padding, `${padding ?? 6}px`, `${mode} local padding`);
        if (mode === 'timeline') {
          const rows = await page.locator('.wcc-timeline-row').evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom };
            }),
          );
          assert.ok(rows[1].top >= rows[0].bottom, 'wrapped timeline rows never overlap');
          const label = await page
            .locator(touch ? '.wcc-timeline-row-title' : '.wcc-timeline-bar-label')
            .first()
            .boundingBox();
          assert.ok(
            label.y >= rows[0].top && label.y + label.height <= rows[0].bottom,
            'timeline title stays inside its row',
          );
        }
      }
    }
    await page.evaluate(() => window.setupLongCalendarBars());
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const lanes = await page.locator('.wcc-calendar-md-bar').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect(),
          title = el.querySelector('.wcc-calendar-md-label');
        return {
          top: r.top,
          bottom: r.bottom,
          fits:
            title.scrollHeight <= title.clientHeight + 1 &&
            title.scrollWidth <= title.clientWidth + 1,
        };
      }),
    );
    assert.equal(lanes.length, 2);
    assert.ok(
      lanes.every((lane) => lane.fits),
      'complete multi-day titles fit',
    );
    assert.ok(lanes[1].top >= lanes[0].bottom, 'wrapped calendar lanes never overlap');
    // Defaults apply on opening/settings changes, while temporary modes survive data updates.
    for (const mode of ['month', 'week', 'agenda']) {
      await page.evaluate((mode) => window.setupCalendarDefault(mode), mode);
      assert.equal(
        await page.locator('.wcc-calendar-mode[aria-pressed="true"]').textContent(),
        mode[0].toUpperCase() + mode.slice(1),
      );
      const temporary = mode === 'agenda' ? 'Week' : 'Agenda';
      await page.getByRole('button', { name: temporary, exact: true }).click();
      await page.evaluate(() => window.currentDragView.onDataUpdated());
      assert.equal(
        await page.locator('.wcc-calendar-mode[aria-pressed="true"]').textContent(),
        temporary,
        'refresh retains temporary mode',
      );
      await page.evaluate(async () => {
        window.dragState.config.viewMode = 'week';
        await window.currentDragView.onDataUpdated();
      });
      if (mode !== 'week')
        assert.equal(
          await page.locator('.wcc-calendar-mode[aria-pressed="true"]').textContent(),
          'Week',
          'changed default applies immediately',
        );
    }
    await page.evaluate(() => window.setupCalendarDefault('unsupported'));
    assert.equal(
      await page.locator('.wcc-calendar-mode[aria-pressed="true"]').textContent(),
      'Month',
      'invalid default falls back to month',
    );
    // Desktop mouse users get the same narrow-pane layouts, with live resize.
    if (!touch) {
      for (const mode of ['month', 'week']) {
        await page.evaluate((mode) => window.setupCompactCalendar(mode), mode);
        await page.evaluate(() => {
          window.currentDragView.wrap.style.width = '600px';
        });
        await page.waitForFunction(() => !!document.querySelector('.wcc-calendar-compact'));
        assert.equal(await page.locator('.wcc-calendar-mobile').count(), 1);
        assert.equal(await page.locator('.wcc-touch-drag').count(), 0);
        await page.evaluate(() => {
          window.currentDragView.wrap.style.width = '900px';
        });
        await page.waitForFunction(() => !document.querySelector('.wcc-calendar-compact'));
        assert.equal(await page.locator('.wcc-calendar-mobile').count(), 0);
      }
      await page.evaluate(() => window.setupMobileTimeline());
      await page.evaluate(() => {
        window.currentDragView.wrap.style.width = '600px';
      });
      await page.waitForFunction(() => !!document.querySelector('.wcc-timeline-mobile'));
      assert.equal(await page.getByRole('separator', { name: 'Resize title column' }).count(), 0);
      await page.evaluate(() => {
        window.currentDragView.wrap.style.width = '900px';
      });
      await page.waitForFunction(() => !document.querySelector('.wcc-timeline-mobile'));
      assert.equal(await page.getByRole('separator', { name: 'Resize title column' }).count(), 1);
    }
    // Density affects actual rendered height; metadata and details remain usable.
    const heights = {};
    for (const density of ['comfortable', 'compact']) {
      await page.evaluate((value) => window.setupDensity(value), density);
      const listDetails = page.locator('.wcc-list-details').first();
      assert.equal(await listDetails.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.wcc-list-row-props').first().isVisible(), false);
      await listDetails.click();
      assert.equal(await page.locator('.wcc-list-row-props').first().isVisible(), true);
      heights[density] = await page
        .locator('.wcc-list-row')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      assert.equal(await page.locator('.wcc-list-prop-empty, .wcc-calendar-prop-empty').count(), 0);
      if (density === 'compact') {
        const details = page.locator('.wcc-calendar-details').first();
        assert.equal(await details.getAttribute('aria-expanded'), 'false');
        await details.click();
        assert.equal(await details.getAttribute('aria-expanded'), 'true');
        assert.ok(await page.locator('.wcc-details-expanded .wcc-calendar-chip-props').isVisible());
        await details.press('Enter');
        assert.equal(await details.getAttribute('aria-expanded'), 'false');
        await page.screenshot({
          path: touch ? '/tmp/wcc-density-mobile.png' : '/tmp/wcc-density-desktop.png',
        });
      }
    }
    assert.ok(heights.compact < heights.comfortable, 'compact rows must use less vertical height');
    await page.evaluate(() => {
      const fixture = document.getElementById('fixture');
      fixture.removeAttribute('style');
    });
    // Failed persistence always clears the gesture state.
    await page.evaluate(() => {
      window.setupDrag('list');
      window.dragState.fail = true;
    });
    await gesture(
      page,
      await point(page, '.wcc-list-row .wcc-drag-grip'),
      await point(page, '.wcc-list-group:nth-child(2) .wcc-list-items'),
      touch,
    );
    assert.equal(await page.evaluate(() => window.dragState.writes.length), 0);
    assert.ok(await page.evaluate(() => window.dragState.notices.length));
    assert.equal(
      await page.locator('.wcc-drag-preview, .wcc-drag-source, .wcc-drag-active').count(),
      0,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: touch ? '/tmp/wcc-drag-mobile.png' : '/tmp/wcc-drag-desktop.png',
    });
    console.log(
      `${touch ? 'Mobile touch' : 'Desktop mouse'}: all four view moves, cancellation, grips, no accidental opens/menus, deferred refresh, columns, timeline resize, DST, and save failure passed.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
