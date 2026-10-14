import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WCC_PLAYWRIGHT_MODULE || 'playwright');
const reference = await readFile('tests/browser/drag.browser.test.mjs', 'utf8');
const mock = reference.match(/const mock = `([\s\S]*?)`;/)[1];
const polyfill = reference.match(/const polyfill = `([\s\S]*?)`;/)[1];
const fixture = `
import {BaseCalendarView} from './src/views/calendar/view';
import {BaseKanbanView} from './src/views/kanban/view';
import {TFile, StringValue, BooleanValue, NullValue} from 'obsidian';
const notes = [
 {title:'Review project scope', status:'Working', date:'2026-10-13', end:'2026-10-13'},
 {title:'Prepare release notes', status:'Queued', date:'2026-10-14', end:'2026-10-14'},
 {title:'Verify status controls across views', status:'Working', date:'2026-10-13', end:'2026-10-16'},
 {title:'Try an unlisted status', status:'Investigating', date:'2026-10-15', end:'2026-10-15'},
];
const values = {status_type:'status',statusProperty:'status',doneProperty:'done',statusValues:['Waiting'],groupBy:{property:'status'},dateProperty:'date',endDateProperty:'end',density:'compact',detailsExpanded:false,viewMode:'month',showEmptyColumns:true};
const config={get:key=>values[key],set:(key,value)=>{values[key]=value;},getOrder:()=>['file.name','note.status','note.done','note.date','note.end','note.notes'],getDisplayName:pid=>pid.replace('note.','')};
const data=()=>{const grouped=new Map(); for(const note of notes){const file=new TFile(note.title+'.md');const entry={file,getValue:pid=>{const name=pid.replace('note.','');return name==='done'?new BooleanValue(false):note[name]?new StringValue(note[name]):new NullValue();}};if(!grouped.has(note.status))grouped.set(note.status,[]);grouped.get(note.status).push(entry);}return {groupedData:[...grouped].map(([key,entries])=>({key:new StringValue(key),hasKey:()=>true,entries}))};};
const app={metadataCache:{getFileCache:()=>({frontmatter:{}})},fileManager:{async processFrontMatter(){}},workspace:{getLeaf:()=>({openFile(){}}),trigger(){}},vault:{getAbstractFileByPath(){return null;}}};
const plugin={settings:{localOrder:{}},saveSettings(){}};
window.setupStatus=type=>{window.current?.onunload();document.querySelector('#fixture').empty();values.viewMode=type==='kanban'?'month':type;const View=type==='kanban'?BaseKanbanView:BaseCalendarView;const instance=new View({app},document.querySelector('#fixture'),plugin);instance.config=config;instance.data=data();if(type!=='kanban')instance.curDate=new Date(2026,9,13);window.current=instance;instance.onDataUpdated();};
window.moveLastStatusTask=()=>{notes.find(n=>n.status==='Investigating').status='Working';window.current.data=data();window.current.onDataUpdated();};
window.setStatusType=type=>{values.status_type=type;window.current.data=data();window.current.onDataUpdated();};
window.getViewValues=()=>values;
`;
const bundled = await build({
  stdin: { contents: fixture, resolveDir: process.cwd() },
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
const css = await readFile('styles.css', 'utf8');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WCC_BROWSER_EXECUTABLE
    ? { executablePath: process.env.WCC_BROWSER_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(
    `<html><head><style>:root{--font-interface:system-ui;--font-ui-small:13px;--font-ui-smaller:12px;--font-ui-medium:15px;--font-smallest:11px;--background-primary:#202020;--background-secondary:#262626;--background-modifier-border:#363636;--background-modifier-hover:#303030;--text-normal:#e5e5e5;--text-muted:#999;--text-faint:#666;--interactive-accent:#9a78ed;--text-on-accent:white;}body{background:#202020;color:#e5e5e5;font-family:system-ui;margin:24px;}button,input{font:inherit;color:inherit;background:#303030;border:1px solid #444;border-radius:4px;}button{cursor:pointer;}svg{width:16px;height:16px;}#fixture{height:860px;} ${css}</style></head><body><div id="fixture"></div><script>${polyfill}</script><script>${bundled.outputFiles[0].text}</script></body></html>`,
  );
  for (const mode of ['month', 'week', 'agenda']) {
    await page.evaluate((mode) => window.setupStatus(mode), mode);
    assert.equal(
      await page.locator('.wcc-calendar-group-label').count(),
      0,
      mode + ' has no repeated status group headings',
    );
    assert.equal(
      await page.locator('[role="checkbox"], [role="switch"]').count(),
      0,
      mode + ' has no completion checkbox in status mode',
    );
    assert.ok((await page.locator('.wcc-status-pill').count()) > 0);
    if (mode === 'month') await page.screenshot({ path: '/tmp/wcc-calendar-flat-status.png' });
  }
  await page.evaluate(() => window.setupStatus('kanban'));
  assert.equal(
    await page.locator('.wcc-status-pill, [role="checkbox"], [role="switch"]').count(),
    0,
    'Kanban status cards have no pills or completion checkboxes',
  );
  assert.equal(
    await page.locator('[data-col-key="Waiting"]').count(),
    1,
    'configured empty column is visible',
  );
  assert.equal(await page.locator('[data-col-key="Investigating"]').count(), 1);
  await page.evaluate(() => window.moveLastStatusTask());
  assert.equal(
    await page.locator('[data-col-key="Investigating"]').count(),
    1,
    'last task leaving does not remove its column',
  );
  assert.equal(await page.locator('[data-col-key="Investigating"] .wcc-kanban-card').count(), 0);
  await page.evaluate(() => window.setupStatus('kanban'));
  assert.equal(
    await page.locator('[data-col-key="Investigating"]').count(),
    1,
    'empty column survives reopening the view',
  );
  await page.getByRole('button', { name: 'Add column', exact: true }).click();
  await page.getByRole('textbox', { name: 'New column name' }).fill('Parked');
  await page.getByRole('textbox', { name: 'New column name' }).press('Enter');
  assert.equal(await page.locator('[data-col-key="Parked"]').count(), 1);
  await page.evaluate(() => window.setStatusType('checkbox'));
  assert.ok(
    (await page.locator('.wcc-kanban-check').count()) > 0,
    'checkbox mode restores Done controls',
  );
  assert.equal(await page.locator('.wcc-status-pill').count(), 0);
  await page.evaluate(() => window.setStatusType('status'));
  assert.equal(
    await page.locator('[role="checkbox"], [role="switch"], .wcc-status-pill').count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Actual calendar layouts, status_type switching, Kanban controls, retained empty columns, and Add column passed in browser.',
  );
} finally {
  await browser.close();
}
