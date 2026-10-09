import { BasesPropertyId, QueryController, NullValue, Value, setIcon } from 'obsidian';
import { BaseListView, ListItem } from './list-view';
import type BaseViewsPlugin from './main';
import { PropertyFieldRenderer } from './property-field';
import { PointerDrag, DropIndicator, DragPoint, dragGrip, moveBefore } from './drag';

export const VIEW_TYPE_BASE_TABLE = 'base-ca-table-view';
const NULL_KEY = '(no value)';

/** Native property columns with shared grouping, numeric row ordering, and drag behavior. */
export class BaseTableView extends BaseListView {
	readonly type: string = VIEW_TYPE_BASE_TABLE;
	private columns: BasesPropertyId[] = [];
	private table: HTMLTableElement | null = null;
	private columnEls = new Map<BasesPropertyId, HTMLTableColElement>();
	private widths = new Map<BasesPropertyId, number>();
	private columnDrag: PointerDrag;
	private columnDrop: DropIndicator;
	private draggedColumn: BasesPropertyId | null = null;
	private beforeColumn: BasesPropertyId | null = null;
	private columnTarget = false;

	constructor(ctrl: QueryController, parent: HTMLElement, plugin: BaseViewsPlugin) {
		super(ctrl, parent, plugin);
		this.wrap.addClass('cat-wrap');
		this.columnDrop = new DropIndicator(this.wrap);
		this.columnDrag = new PointerDrag(this.wrap, {
			items: '.cat-table thead th', ignore: '.cat-column-resize, input, textarea', preview: false,
			onStart: header => { this.draggedColumn=header.dataset.propertyId as BasesPropertyId;this.dragging=true; },
			onMove: (_header,point)=>this.updateColumnDrop(point),
			onDrop: async (_header,point)=>{
				this.updateColumnDrop(point);
				if(this.columnTarget && this.draggedColumn) this.setColumnOrder(moveBefore(this.columns,this.draggedColumn,this.beforeColumn) as BasesPropertyId[]);
			},
			onEnd: ()=>{this.dragging=false;this.draggedColumn=null;this.columnTarget=false;this.columnDrop.hide();void this.onDataUpdated();},
			onError: error=>console.error(error),
		});
	}


	protected buildList() {
		this.doneProp = null; // Table note properties come from the native Properties selection.
		this.columns = [...new Set(this.config.getOrder())];
		this.wrap.removeClass('cat-sticky-title');
		this.wrap.removeClass('cat-striped');
		this.wrap.toggleClass('cat-has-bg', !!(this.config.get('bgImage') as string | undefined)?.trim());
		if(!this.columns.length) {
			this.wrap.createDiv({cls:'cat-empty',text:'Choose columns from the Bases Properties menu.'});
			const add=this.wrap.createEl('button',{text:'+ Add note',attr:{type:'button'}});add.onclick=()=>void this.createListItem(NULL_KEY);return;
		}
		this.columnEls.clear(); this.widths.clear();
		this.table = this.wrap.createEl('table', {cls:'cat-table'});
		const cols = this.table.createEl('colgroup');
		const head = this.table.createEl('thead').createEl('tr');
		const saved = this.config.get('columnWidths');
		const widths = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
		for (const pid of this.columns) {
			const col = cols.createEl('col'); this.columnEls.set(pid, col);
			const compact = this.wrap.ownerDocument.defaultView?.matchMedia('(pointer: coarse)').matches && this.wrap.clientWidth < 700;
			const fallback = pid === 'file.name' ? (compact ? 140 : 260) : 200;
			const value = widths[pid] ?? fallback;
			this.widths.set(pid, typeof value === 'number' && Number.isFinite(value) ? Math.max(100,Math.min(700,value)) : 200);
			const th = head.createEl('th', {cls:pid==='file.name'?'cat-name-header':'',attr:{scope:'col',tabindex:'0',title:'Drag to reorder column; Alt + arrow keys move left/right','aria-keyshortcuts':'Alt+ArrowLeft Alt+ArrowRight'}});
			th.dataset.propertyId=pid;
			th.onkeydown=event=>{
				if(!event.altKey || !['ArrowLeft','ArrowRight'].includes(event.key) || this.dragging || (event.target as HTMLElement).closest('.cat-column-resize'))return;
				event.preventDefault();
				const from=this.columns.indexOf(pid),to=from+(event.key==='ArrowRight'?1:-1);
				if(to<0 || to>=this.columns.length)return;
				const next=[...this.columns];next.splice(from,1);next.splice(to,0,pid);this.setColumnOrder(next);
			};
			const caption = th.createDiv('cat-header-label');
			dragGrip(caption,`Move ${pid==='file.name'?'file name':this.config.getDisplayName(pid)} column`);
			if (pid === 'file.name') {
				const icon = caption.createSpan({cls:'cat-header-icon',attr:{'aria-hidden':'true'}});
				setIcon(icon,'info');
			}
			caption.createSpan({text:pid === 'file.name' ? 'file name' : this.config.getDisplayName(pid)});
			this.makeColumnResize(th, pid);
		}
		this.applyWidths();
		const groups = this.data.groupedData ?? [];
		const grouped = groups.some(group => group.hasKey() && group.key != null);
		if (!grouped) {
			const body = this.table.createEl('tbody', {cls:'cat-ungrouped'}); body.dataset.listGroup = NULL_KEY;
			const items = this.collectItems(groups.flatMap(group => [...group.entries]));
			items.forEach(item => this.makeTableRow(body, item));
			if (!items.length) body.createEl('tr').createEl('td', {text:'No matching notes', attr:{colspan:String(this.columns.length)},cls:'cat-empty'});
			this.makeAddRow(body, NULL_KEY);
		} else {
			for (const group of groups) {
				const key = group.hasKey() && group.key != null ? group.key.toString() : NULL_KEY;
				const body = this.table.createEl('tbody'); body.dataset.listGroup = key;
				const header = body.createEl('tr', {cls:'cat-group-row'}).createEl('th', {attr:{colspan:String(this.columns.length),scope:'rowgroup'}});
				const items = this.collectItems([...group.entries]);
				header.createSpan({text:`${key === NULL_KEY ? '—' : key} · ${items.length}`});
				items.forEach(item => this.makeTableRow(body,item));
				this.makeAddRow(body,key);
			}
		}
	}

	private makeTableRow(body: HTMLElement, item: ListItem) {
		const row = body.createEl('tr', {cls:'bv-list-row cat-row' + (item.done ? ' bv-list-row-done' : '')});
		row.dataset.itemId = item.id;
		const color = this.getItemColor(item);
		if (color) row.style.setProperty('--cat-row-color', color);

		let titleCell: HTMLTableCellElement | null = null;
		for (const pid of this.columns) {
			const cell=row.createEl('td',{cls:pid==='file.name'?'cat-title-cell':'cat-cell'});
			cell.dataset.propertyId=pid;
			if(pid==='file.name') {titleCell=cell;this.renderTitle(cell.createDiv('bv-list-row-title'),item,row);}
			else this.renderPropVal(cell.createDiv('bv-list-row-props'),item.entry.getValue(pid) ?? new NullValue(),item,pid);
		}
		row.addEventListener('contextmenu',event => {
			if ((event.target as HTMLElement).closest('.cat-cell')) return;
			event.preventDefault(); this.showContextMenu(event,item);
		});
		if(titleCell) titleCell.onauxclick = event => {
			if (event.button !== 1 || (event.target as HTMLElement).closest('button')) return;
			event.preventDefault(); void this.app.workspace.getLeaf('tab').openFile(item.file);
		};
	}

	private setColumnOrder(order: BasesPropertyId[]) {
		// Native column order is separate from the custom-option data written by config.set().
		// Obsidian exposes this method at runtime but does not yet declare it in its public types.
		const config = this.config as typeof this.config & { setOrder?: (order: BasesPropertyId[]) => void };
		if (typeof config.setOrder !== 'function') throw new Error('This Obsidian version cannot save column order.');
		config.setOrder(order);
	}

	private updateColumnDrop(point: DragPoint) {
		this.columnDrop.hide();this.columnTarget=false;this.beforeColumn=null;
		if(!this.draggedColumn || !this.table)return;
		const pane=this.wrap.getBoundingClientRect(),head=this.table.tHead!;
		// Individual header cells stay sticky while the thead box scrolls away.
		const rect=head.querySelector('th')!.getBoundingClientRect();
		if(point.x<pane.left || point.x>pane.right || point.y<rect.top || point.y>rect.bottom)return;
		const headers=Array.from(head.querySelectorAll<HTMLElement>('th')).filter(header=>header.dataset.propertyId!==this.draggedColumn);
		const before=headers.find(header=>point.x<header.getBoundingClientRect().left+header.getBoundingClientRect().width/2)??null;
		this.beforeColumn=before?.dataset.propertyId as BasesPropertyId ?? null;this.columnTarget=true;
		this.columnDrop.show(this.table,before,headers[headers.length-1]??null,'Column insertion position',true);
	}

	onunload() {this.columnDrag.destroy();this.columnDrop.destroy();super.onunload();}

	protected renderPropVal(parent: HTMLElement, value: Value, item: ListItem, pid: BasesPropertyId) {
		new PropertyFieldRenderer(this,'cat').render(parent,value,item,pid);
	}

	private makeAddRow(body: HTMLElement, key: string) {
		const cell = body.createEl('tr', {cls:'cat-add-row'}).createEl('td', {attr:{colspan:String(this.columns.length)}});
		const button = cell.createEl('button', {text:'+ Add note', cls:'cat-add', attr:{type:'button','aria-label':key === NULL_KEY ? 'Add note' : `Add note in ${key}`}});
		button.onclick = async () => {
			button.disabled = true;
			try { await this.createListItem(key); } finally { button.disabled = false; }
		};
	}

	private applyWidths() {
		for (const [pid,col] of this.columnEls) col.style.width = `${this.widths.get(pid)}px`;
		this.wrap.style.setProperty('--cat-name-width', `${this.widths.get('file.name') ?? 260}px`);
		if (this.table) this.table.style.width = `${[...this.widths.values()].reduce((sum,width)=>sum+width,0)}px`;
	}

	private makeColumnResize(header: HTMLElement, pid: BasesPropertyId) {
		const handle = header.createDiv({cls:'cat-column-resize', attr:{role:'separator',tabindex:'0','aria-orientation':'vertical',
			'aria-label':`Resize ${pid === 'file.name' ? 'Name' : this.config.getDisplayName(pid)} column`,'aria-valuemin':'100','aria-valuemax':'700'}});
		const update = (width: number) => {
			this.widths.set(pid,Math.max(100,Math.min(700,Math.round(width)))); this.applyWidths();
			handle.setAttribute('aria-valuenow',String(this.widths.get(pid)));
		};
		const save = () => {
			const old = this.config.get('columnWidths');
			this.config.set('columnWidths',{...(old && typeof old === 'object' && !Array.isArray(old) ? old : {}),...Object.fromEntries(this.widths)});
		};
		handle.setAttribute('aria-valuenow',String(this.widths.get(pid)));
		let active: {id:number;x:number;width:number} | null = null;
		handle.onpointerdown = event => {
			if (event.button !== 0 || active) return;
			event.preventDefault(); event.stopPropagation();
			active = {id:event.pointerId,x:event.clientX,width:this.widths.get(pid)!};
			handle.setPointerCapture(event.pointerId); handle.addClass('cat-column-resizing');
		};
		handle.onpointermove = event => { if (active && event.pointerId === active.id) update(active.width+event.clientX-active.x); };
		const finish = (event: PointerEvent,cancel: boolean) => {
			if (!active || event.pointerId !== active.id) return;
			const old=active.width;active=null;
			if (cancel) update(old); else save();
			handle.removeClass('cat-column-resizing');
			if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
		};
		handle.onpointerup = event => finish(event,false);
		handle.onpointercancel = event => finish(event,true);
		handle.onlostpointercapture = event => finish(event,true);
		handle.oncontextmenu = event => { event.preventDefault(); event.stopPropagation(); };
		handle.onkeydown = event => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			event.preventDefault(); event.stopPropagation();
			update(this.widths.get(pid)!+(event.key === 'ArrowRight'?1:-1)*(event.shiftKey?50:10));save();
		};
	}
}
