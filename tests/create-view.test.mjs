import assert from 'node:assert/strict';
import { build } from 'esbuild';

class Value { constructor(value) { this.value = value; } toString() { return String(this.value); } }
class BooleanValue extends Value { isTruthy() { return this.value; } }
class NumberValue extends Value {}
class NullValue extends Value { toString() { return ''; } }
class ListValue extends Value { length() { return this.value.length; } get(i) { return this.value[i]; } }
class TFile {
  constructor(path) { this.path = path; }
  get name() { return this.path.split('/').pop(); }
  get basename() { return this.name.replace(/\.md$/, ''); }
  get parent() { return {path:this.path.slice(0, this.path.lastIndexOf('/'))}; }
}
const notices = [];
const api = new Proxy({Value, BooleanValue, NumberValue, NullValue, ListValue, TFile,
  normalizePath:p=>p, parsePropertyId:pid=>({type:pid.split('.')[0],name:pid.slice(pid.indexOf('.')+1)}),
  Notice:class { constructor(text) { notices.push(text); } },
}, {get:(target,key)=>target[key] ?? class {}});
const bundle = await build({stdin:{contents:`
export {BaseCalendarView} from './src/calendar-view';
export {BaseListView} from './src/list-view';
export {BaseTableView} from './src/table-view';
export {BaseKanbanView} from './src/kanban-view';
export {BaseTimelineView} from './src/timeline-view';
export {groupDefaults} from './src/view-create';
`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']});
const mod = {exports:{}};
new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,()=>api);
const {BaseCalendarView, BaseListView, BaseKanbanView, BaseTimelineView, BaseTableView, groupDefaults} = mod.exports;
const defaults = {project:'Work',done:false,priority:2,tags:['work'],date:'2026-01-01',templateOnly:'kept'};
function fixture(View, folder = '') {
  const view = Object.create(View.prototype), state = {calls:[], moves:[], folders:[]};
  const values = { 'note.priority':new NumberValue(3), 'note.done':new BooleanValue(false),
    'note.tags':new ListValue([new Value('work'),new Value('client')]) };
  view.data = {groupedData:[{entries:[{getValue:pid=>values[pid]}]}]};
  view.config = {get:key=>({groupBy:'note.priority',subgroupProperty:'tags',newNoteFolder:folder})[key],getAsPropertyId:key=>key==='subgroupProperty'?'note.tags':null};
  view.app = {vault:{getAbstractFileByPath:path=>path===`${folder}/New note.md`?{}:null, async createFolder(path){state.folders.push(path);}},
    fileManager:{async renameFile(file,path){state.moves.push(path);file.path=path;}}};
  view.createFileForView = async (title, processor) => {
    const fm = structuredClone(defaults), file = new TFile('Inferred/New note.md');
    processor(fm, file); state.calls.push({title,fm,file});
  };
  return {view,state};
}
{
  const {view,state} = fixture(BaseCalendarView);
  view.dateProp='note.date';view.endProp='note.endDate';
  await view.createNote(new Date(2026,9,12),new Date(2026,9,14));
  assert.equal(state.calls.length,1);
  assert.equal(state.calls[0].title,'Note 2026-10-12');
  assert.deepEqual(state.calls[0].fm,{...defaults,date:'2026-10-12',endDate:'2026-10-14'});
  assert.equal(state.calls[0].file.path,'Inferred/New note.md');
}
{
  const {view,state} = fixture(BaseListView);
  await view.createListItem('3');
  assert.deepEqual(state.calls[0].fm,{...defaults,priority:3});
  assert.deepEqual(groupDefaults(view,'note.done','false'),{done:false});
  assert.deepEqual(groupDefaults(view,'note.tags','work,client'),{tags:['work','client']});
  assert.deepEqual(groupDefaults(view,'note.priority','(no value)'),{priority:null});
  assert.deepEqual(groupDefaults(view,'file.folder','Folder'),{});
  assert.deepEqual(groupDefaults(view,'formula.score','3'),{});
}
{
  const {view,state} = fixture(BaseKanbanView,'Override/Nested');
  await view.commitGhost('3','work,client','New card');
  assert.equal(state.calls[0].title,'New card');
  assert.deepEqual(state.calls[0].fm,{...defaults,priority:3,tags:['work','client']});
  assert.deepEqual(state.folders,[], 'saved folder overrides are ignored');
  assert.deepEqual(state.moves,[]);
  assert.equal(state.calls[0].file.path,'Inferred/New note.md');
}
{
  const {view,state} = fixture(BaseTimelineView);
  await view.createTimelineNote();
  assert.deepEqual(state.calls[0].fm,defaults);
  assert.equal(state.moves.length,0);
}
{
  const {view,state} = fixture(BaseTableView);
  await view.createListItem('3');
  assert.deepEqual(state.calls[0].fm,{...defaults,priority:3});
}
assert.deepEqual(notices,[]);
console.log('All five in-view adds delegate to Bases New, retain filter/template defaults, preserve typed context, and use native folder selection even with legacy overrides.');
