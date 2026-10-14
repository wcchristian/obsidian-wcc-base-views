import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(process.cwd() + '/package.json');
const { build } = require('esbuild');
const { chromium } = require(process.env.WCC_PLAYWRIGHT_MODULE || 'playwright');
const old = await readFile('tests/browser/drag.browser.test.mjs', 'utf8');
let mock = old.match(/const mock = `([\s\S]*?)`;/)[1];
mock = mock.replace(
  "export function setIcon(el){el.textContent='⠿';}",
  `export function setIcon(el,name){const paths={'chevron-left':'m14 6-6 6 6 6','chevron-right':'m10 6 6 6-6 6','chevron-down':'m6 9 6 6 6-6','plus':'M12 5v14M5 12h14','grip-vertical':'M8 5h1M15 5h1M8 12h1M15 12h1M8 19h1M15 19h1'};el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name]||paths['grip-vertical'])+'"/></svg>';}`,
);
const polyfill =
  old.match(/const polyfill = `([\s\S]*?)`;/)[1] +
  `HTMLElement.prototype.setText=function(v){this.textContent=v;};`;
const fixture = `
import {BaseCalendarView} from './src/views/calendar/view';
import {BaseKanbanView} from './src/views/kanban/view';
import {BaseListView} from './src/views/list/view';
import {BaseTableView} from './src/views/table/view';
import {BaseTimelineView} from './src/views/timeline/view';
import {TFile,StringValue,NumberValue,BooleanValue,NullValue} from 'obsidian';
// Keep fictional October 2026 examples stable when previews are regenerated later.
const NativeDate=window.Date;
window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[2026,9,13,12]));}static now(){return new NativeDate(2026,9,13,12).getTime();}};
const notes=[
{title:'Outline the project brief',status:'Working',priority:'high',date:'2026-10-13',end:'2026-10-15',order:10,notes:'Capture the scope and next steps.'},
{title:'Review the design',status:'Working',priority:'normal',date:'2026-10-14',end:'2026-10-14',order:20,notes:'Compare the two proposed layouts.'},
{title:'Prepare the handoff',status:'Queued',priority:'normal',date:'2026-10-15',end:'2026-10-16',order:30,notes:'Collect files and document decisions.'},
{title:'Send the weekly update',status:'Queued',priority:'low',date:'2026-10-16',end:'2026-10-16',order:40,notes:'Share progress and the next milestone.'}
];
const app={metadataCache:{getFileCache:()=>({frontmatter:{}})},fileManager:{async processFrontMatter(){}},workspace:{getLeaf:()=>({openFile(){}}),trigger(){}},vault:{getAbstractFileByPath(){return null;}}};
const plugin={settings:{localOrder:{}},saveSettings(){}};
window.renderPreview=(kind,control='status',layout='month')=>{
window.current?.onunload();document.querySelector('#fixture').empty();
const values={status_type:control,statusProperty:'status',doneProperty:'done',statusValues:['Waiting'],groupBy:kind==='calendar'?undefined:{property:'status'},sortOrderProperty:'order',dateProperty:'date',endDateProperty:'end',density:'comfortable',detailsExpanded:false,viewMode:layout,agendaDays:4,zoomLevel:'day',daysVisible:10,checkboxColorProperty:'status',checkboxColorValues:['Working:#8ba5f2','Queued:#d6ad68','Waiting:#9cabaf']};
const config={get:key=>values[key],set:(key,v)=>values[key]=v,getOrder:()=>['file.name','note.priority','note.date','note.end','note.notes'],getDisplayName:pid=>pid==='file.name'?'Name':pid.replace('note.',''),setOrder(){}};
const entries=notes.map((note,index)=>({file:new TFile((kind==='timeline'?['Project brief','Design review','Team handoff','Weekly update'][index]:note.title)+'.md'),getValue:pid=>{const v=pid==='note.done'?false:kind==='timeline'&&pid==='note.end'?['2026-10-19','2026-10-20','2026-10-21','2026-10-22'][index]:note[pid.replace('note.','')];return v==null?new NullValue():typeof v==='number'?new NumberValue(v):typeof v==='boolean'?new BooleanValue(v):new StringValue(v);}}));
const groups=kind==='calendar'?[{key:null,hasKey:()=>false,entries}]:['Working','Queued'].map(status=>({key:new StringValue(status),hasKey:()=>true,entries:entries.filter(entry=>entry.getValue('note.status').toString()===status)}));
const View={calendar:BaseCalendarView,kanban:BaseKanbanView,list:BaseListView,table:BaseTableView,timeline:BaseTimelineView}[kind];
const view=new View({app},document.querySelector('#fixture'),plugin);view.config=config;view.data={groupedData:groups};
if(kind==='calendar')view.curDate=new Date(2026,9,13);
if(kind==='timeline'){view.windowStart=new Date(2026,9,11);view.windowEnd=new Date(2026,9,20);}
window.current=view;view.onDataUpdated();
};`;
const bundle = await build({
  stdin: { contents: fixture, resolveDir: process.cwd() },
  bundle: true,
  format: 'iife',
  write: false,
  plugins: [
    {
      name: 'mock',
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
  executablePath: process.env.WCC_BROWSER_EXECUTABLE,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 650 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(
    `<html><head><style>:root{--font-interface:system-ui;--font-ui-small:13px;--font-ui-smaller:12px;--font-ui-medium:15px;--font-smallest:11px;--background-primary:#202124;--background-secondary:#292b30;--background-modifier-border:#3a3d44;--background-modifier-hover:#343741;--text-normal:#e5e7eb;--text-muted:#a0a6b3;--text-faint:#676e7d;--interactive-accent:#9279dc;--text-on-accent:white;}*{box-sizing:border-box}body{margin:0;background:#202124;color:#e5e7eb;font-family:system-ui}header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #3a3d44}header small{margin-left:auto;color:#a0a6b3}h1{font-size:16px;margin:0;font-weight:600}button,input{font:inherit;color:inherit;background:#343741;border:1px solid #3a3d44;border-radius:5px}button{cursor:pointer}svg{width:16px;height:16px}#fixture{height:580px;padding:12px} ${css}</style></head><body><header><h1 id="title"></h1><small>Fictional sample notes · renderer preview</small></header><div id="fixture"></div><script>${polyfill}</script><script>${bundle.outputFiles[0].text}</script></body></html>`,
  );
  for (const [kind, title] of [
    ['kanban', 'Kanban · statuses and an empty column'],
    ['calendar', 'Calendar · dates and ranges'],
    ['timeline', 'Timeline · project date ranges'],
    ['list', 'List · grouped tasks with expandable details'],
    ['table', 'Table · editable properties and task controls'],
  ]) {
    await page.evaluate(
      ({ kind, title }) => {
        document.querySelector('#title').textContent = title;
        window.renderPreview(kind);
      },
      { kind, title },
    );
    await page.evaluate((kind) => {
      document.querySelector('#fixture').style.height =
        kind === 'kanban' ? '290px' : kind === 'calendar' || kind === 'list' ? '580px' : '460px';
    }, kind);
    await page.setViewportSize({
      width: 1200,
      height: kind === 'kanban' ? 345 : kind === 'calendar' || kind === 'list' ? 650 : 515,
    });
    await page.waitForTimeout(150);
    if (kind === 'list') await page.locator('.wcc-card-details').first().click();
    await page.screenshot({ path: 'docs/screenshots/' + kind + '.png' });
  }
  await page.setViewportSize({ width: 1200, height: 830 });
  await page.evaluate(() => {
    document.querySelector('#fixture').style.height = '760px';
    document.querySelector('#title').textContent =
      'Kanban · priority swimlanes and independent colors';
    window.renderPreview('kanban');
    window.current.config.set('subgroupProperty', 'priority');
    window.current.config.set('colorProperty', 'priority');
    window.current.config.set('colorValues', ['high:#eb7b6b', 'normal:#7aaeb2', 'low:#b199df']);
    window.current.onDataUpdated();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/screenshots/kanban-swimlanes.png' });
  for (const layout of ['week', 'agenda']) {
    await page.setViewportSize({ width: 1200, height: 650 });
    await page.evaluate((layout) => {
      document.querySelector('#fixture').style.height = '580px';
      document.querySelector('#title').textContent = 'Calendar · ' + layout;
      window.renderPreview('calendar', 'status', layout);
    }, layout);
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'docs/screenshots/calendar-' + layout + '.png' });
  }
  await page.setViewportSize({ width: 480, height: 650 });
  await page.evaluate(() => {
    document.querySelector('#title').textContent = 'Calendar · narrow pane';
    window.renderPreview('calendar');
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/screenshots/calendar-narrow.png' });
  await page.setViewportSize({ width: 1200, height: 650 });
  for (const control of ['checkbox', 'status', 'none']) {
    await page.evaluate((control) => {
      document.querySelector('#title').textContent = 'Task control · ' + control;
      window.renderPreview('list', control);
    }, control);
    await page.evaluate(() => (window.current.wrap.style.width = '520px'));
    await page.waitForTimeout(100);
    await page
      .locator('.wcc-list-row')
      .first()
      .screenshot({ path: 'docs/screenshots/control-' + control + '.png' });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Generated five layout previews, additional Calendar layouts, and three task-control previews from current renderers.',
  );
} finally {
  await browser.close();
}
