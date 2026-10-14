import { viewGroups, groupArrow } from '../../shared/status';
import type { BasesPropertyId, QueryController, Value } from 'obsidian';
import { NullValue, setIcon } from 'obsidian';
import type { ListItem } from '../list/view';
import { BaseListView } from '../list/view';
import type BaseViewsPlugin from '../../main';
import { PropertyFieldRenderer } from '../../shared/property-field';
import type { DragPoint } from '../../shared/drag';
import { PointerDrag, DropIndicator, dragGrip, moveBefore } from '../../shared/drag';

export const VIEW_TYPE_BASE_TABLE = 'wcc-table';
const NULL_KEY = '(no value)';

/** Native property columns with shared grouping, numeric row ordering, and drag behavior. */
export class BaseTableView extends BaseListView {
  readonly type: string = VIEW_TYPE_BASE_TABLE;
  private columns: BasesPropertyId[] = [];
  private table: HTMLTableElement | null = null;
  private columnEls = new Map<BasesPropertyId, HTMLTableColElement>();
  private widths = new Map<BasesPropertyId, number>();
  private minColumnWidth = 40;
  private maxAutomaticWidth = 300;
  private columnDrag: PointerDrag;
  private columnDrop: DropIndicator;
  private draggedColumn: BasesPropertyId | null = null;
  private beforeColumn: BasesPropertyId | null = null;
  private columnTarget = false;

  constructor(ctrl: QueryController, parent: HTMLElement, plugin: BaseViewsPlugin) {
    super(ctrl, parent, plugin);
    this.wrap.addClass('wcc-table-wrap');
    this.columnDrop = new DropIndicator(this.wrap);
    this.columnDrag = new PointerDrag(this.wrap, {
      items: '.wcc-table-table thead th',
      ignore: '.wcc-table-column-resize, input, textarea',
      preview: false,
      onStart: (header) => {
        this.draggedColumn = header.dataset.propertyId as BasesPropertyId;
        this.dragging = true;
      },
      onMove: (_header, point) => this.updateColumnDrop(point),
      onDrop: async (_header, point) => {
        this.updateColumnDrop(point);
        if (this.columnTarget && this.draggedColumn)
          this.setColumnOrder(
            moveBefore(this.columns, this.draggedColumn, this.beforeColumn) as BasesPropertyId[],
          );
      },
      onEnd: () => {
        this.dragging = false;
        this.draggedColumn = null;
        this.columnTarget = false;
        this.columnDrop.hide();
        void this.onDataUpdated();
      },
      onError: (error) => console.error(error),
    });
  }

  protected buildList() {
    this.doneProp = null; // Table note properties come from the native Properties selection.
    this.columns = [...new Set(this.config.getOrder())];
    this.wrap.removeClass('wcc-table-sticky-title');
    this.wrap.removeClass('wcc-table-striped');
    this.wrap.toggleClass(
      'wcc-table-has-bg',
      !!(this.config.get('bgImage') as string | undefined)?.trim(),
    );
    if (!this.columns.length) {
      this.wrap.createDiv({
        cls: 'wcc-table-empty',
        text: 'Choose columns from the Bases Properties menu.',
      });
      const add = this.wrap.createEl('button', { text: 'Add note', attr: { type: 'button' } });
      add.onclick = () => void this.createListItem(NULL_KEY);
      return;
    }
    this.columnEls.clear();
    this.widths.clear();
    const style = this.wrap.ownerDocument.defaultView!.getComputedStyle(this.wrap);
    this.minColumnWidth =
      parseFloat(style.getPropertyValue('--bases-table-column-min-width')) || 40;
    this.maxAutomaticWidth = Math.max(
      this.minColumnWidth,
      parseFloat(style.getPropertyValue('--bases-table-column-max-width')) || 300,
    );
    this.table = this.wrap.createEl('table', { cls: 'wcc-table-table' });
    const cols = this.table.createEl('colgroup');
    const head = this.table.createEl('thead').createEl('tr');
    const saved = this.config.get('columnWidths');
    const widths =
      saved && typeof saved === 'object' && !Array.isArray(saved)
        ? (saved as Record<string, unknown>)
        : {};
    for (const pid of this.columns) {
      const col = cols.createEl('col');
      this.columnEls.set(pid, col);
      const value = widths[pid];
      this.widths.set(
        pid,
        typeof value === 'number' && Number.isFinite(value) && value > 0
          ? Math.max(this.minColumnWidth, value)
          : 200,
      );
      const th = head.createEl('th', {
        cls: pid === 'file.name' ? 'wcc-table-name-header' : '',
        attr: {
          scope: 'col',
          tabindex: '0',
          title: 'Drag to reorder column; Alt + arrow keys move left/right',
          'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight',
        },
      });
      th.dataset.propertyId = pid;
      th.onkeydown = (event) => {
        if (
          !event.altKey ||
          !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
          this.dragging ||
          (event.target as HTMLElement).closest('.wcc-table-column-resize')
        )
          return;
        event.preventDefault();
        const from = this.columns.indexOf(pid),
          to = from + (event.key === 'ArrowRight' ? 1 : -1);
        if (to < 0 || to >= this.columns.length) return;
        const next = [...this.columns];
        next.splice(from, 1);
        next.splice(to, 0, pid);
        this.setColumnOrder(next);
      };
      const caption = th.createDiv('wcc-table-header-label');
      dragGrip(
        caption,
        `Move ${pid === 'file.name' ? 'file name' : this.config.getDisplayName(pid)} column`,
      );
      if (pid === 'file.name') {
        const icon = caption.createSpan({
          cls: 'wcc-table-header-icon',
          attr: { 'aria-hidden': 'true' },
        });
        setIcon(icon, 'info');
      }
      caption.createSpan({
        text: pid === 'file.name' ? 'file name' : this.config.getDisplayName(pid),
      });
      this.makeColumnResize(th, pid);
    }
    const groups = viewGroups(this);
    const grouped = groups.some((group) => group.hasKey() && group.key != null);
    if (!grouped) {
      const body = this.table.createEl('tbody', { cls: 'wcc-table-ungrouped' });
      body.dataset.listGroup = NULL_KEY;
      const items = this.collectItems(groups.flatMap((group) => [...group.entries]));
      items.forEach((item) => this.makeTableRow(body, item));
      if (!items.length)
        body.createEl('tr').createEl('td', {
          text: 'No matching notes',
          attr: { colspan: String(this.columns.length) },
          cls: 'wcc-table-empty',
        });
      this.makeAddRow(body, NULL_KEY);
    } else {
      for (const group of groups) {
        const key = group.hasKey() && group.key != null ? group.key.toString() : NULL_KEY;
        const body = this.table.createEl('tbody');
        body.dataset.listGroup = key;
        const header = body
          .createEl('tr', { cls: 'wcc-table-group-row' })
          .createEl('th', { attr: { colspan: String(this.columns.length), scope: 'rowgroup' } });
        const items = this.collectItems([...group.entries]);
        const collapsed = groupArrow(this, header, key);
        header.createSpan({ text: `${key === NULL_KEY ? '—' : key} · ${items.length}` });
        items.forEach((item) => this.makeTableRow(body, item));
        this.makeAddRow(body, key);
        Array.from(body.children)
          .slice(1)
          .forEach((row) => {
            (row as HTMLElement).hidden = collapsed;
          });
      }
    }
    this.measureColumnWidths(widths);
    this.applyWidths();
  }

  private measureColumnWidths(saved: Record<string, unknown>) {
    if (!this.table) return;
    // Measure an unconstrained copy so wrapping and pane width cannot distort the result.
    const measure = this.table.cloneNode(true) as HTMLTableElement;
    measure.addClass('wcc-table-measure');
    measure.querySelector('colgroup')?.remove();
    measure
      .querySelectorAll('.wcc-table-group-row, .wcc-table-add-row, .wcc-table-empty')
      .forEach((row) => row.remove());
    this.wrap.appendChild(measure);
    const headers = measure.querySelectorAll<HTMLTableCellElement>('thead th');
    this.columns.forEach((pid, index) => {
      const natural = headers[index]?.getBoundingClientRect().width ?? this.minColumnWidth;
      const automatic = Math.max(
        this.minColumnWidth,
        Math.min(this.maxAutomaticWidth, Math.ceil(natural)),
      );
      const custom = saved[pid];
      this.widths.set(
        pid,
        typeof custom === 'number' && Number.isFinite(custom) && custom > 0
          ? Math.max(this.minColumnWidth, custom)
          : automatic,
      );
    });
    measure.remove();
    this.table.querySelectorAll<HTMLElement>('.wcc-table-column-resize').forEach((handle) => {
      const pid = handle.parentElement!.dataset.propertyId as BasesPropertyId;
      handle.setAttribute('aria-valuenow', String(this.widths.get(pid)));
    });
  }

  private makeTableRow(body: HTMLElement, item: ListItem) {
    const row = body.createEl('tr', {
      cls: 'wcc-list-row wcc-table-row' + (item.done ? ' wcc-list-row-done' : ''),
    });
    row.dataset.itemId = item.id;
    const color = this.getItemColor(item);
    if (color) row.setCssProps({ ['--wcc-table-row-color']: color });

    let titleCell: HTMLTableCellElement | null = null;
    for (const pid of this.columns) {
      const cell = row.createEl('td', {
        cls: pid === 'file.name' ? 'wcc-table-title-cell' : 'wcc-table-cell',
      });
      cell.dataset.propertyId = pid;
      if (pid === 'file.name') {
        titleCell = cell;
        this.renderTitle(cell.createDiv('wcc-list-row-title'), item, row);
      } else
        this.renderPropVal(
          cell.createDiv('wcc-list-row-props'),
          item.entry.getValue(pid) ?? new NullValue(),
          item,
          pid,
        );
    }
    row.addEventListener('contextmenu', (event) => {
      if ((event.target as HTMLElement).closest('.wcc-table-cell')) return;
      event.preventDefault();
      this.showContextMenu(event, item);
    });
    if (titleCell)
      titleCell.onauxclick = (event) => {
        if (event.button !== 1 || (event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        void this.app.workspace.getLeaf('tab').openFile(item.file);
      };
  }

  private setColumnOrder(order: BasesPropertyId[]) {
    // Native column order is separate from the custom-option data written by config.set().
    // Obsidian exposes this method at runtime but does not yet declare it in its public types.
    const config = this.config as typeof this.config & {
      setOrder?: (order: BasesPropertyId[]) => void;
    };
    if (typeof config.setOrder !== 'function')
      throw new Error('This Obsidian version cannot save column order.');
    config.setOrder(order);
  }

  private updateColumnDrop(point: DragPoint) {
    this.columnDrop.hide();
    this.columnTarget = false;
    this.beforeColumn = null;
    if (!this.draggedColumn || !this.table) return;
    const pane = this.wrap.getBoundingClientRect(),
      head = this.table.tHead!;
    // Individual header cells stay sticky while the thead box scrolls away.
    const rect = head.querySelector('th')!.getBoundingClientRect();
    if (point.x < pane.left || point.x > pane.right || point.y < rect.top || point.y > rect.bottom)
      return;
    const headers = Array.from(head.querySelectorAll<HTMLElement>('th')).filter(
      (header) => header.dataset.propertyId !== this.draggedColumn,
    );
    const before =
      headers.find(
        (header) =>
          point.x < header.getBoundingClientRect().left + header.getBoundingClientRect().width / 2,
      ) ?? null;
    this.beforeColumn = (before?.dataset.propertyId as BasesPropertyId) ?? null;
    this.columnTarget = true;
    this.columnDrop.show(
      this.table,
      before,
      headers[headers.length - 1] ?? null,
      'Column insertion position',
      true,
    );
  }

  onunload() {
    this.columnDrag.destroy();
    this.columnDrop.destroy();
    super.onunload();
  }

  protected renderPropVal(parent: HTMLElement, value: Value, item: ListItem, pid: BasesPropertyId) {
    new PropertyFieldRenderer(this, 'wcc-table').render(parent, value, item, pid);
  }

  private makeAddRow(body: HTMLElement, key: string) {
    const cell = body
      .createEl('tr', { cls: 'wcc-table-add-row' })
      .createEl('td', { attr: { colspan: String(this.columns.length) } });
    const button = cell.createEl('button', {
      text: 'Add note',
      cls: 'wcc-table-add',
      attr: { type: 'button', 'aria-label': key === NULL_KEY ? 'Add note' : `Add note in ${key}` },
    });
    button.onclick = async () => {
      button.disabled = true;
      try {
        await this.createListItem(key);
      } finally {
        button.disabled = false;
      }
    };
  }

  private applyWidths() {
    for (const [pid, col] of this.columnEls)
      col.setCssStyles({ width: `${this.widths.get(pid)}px` });
    this.wrap.setCssProps({
      ['--wcc-table-name-width']: `${this.widths.get('file.name') ?? 260}px`,
    });
    if (this.table)
      this.table.setCssStyles({
        width: `${[...this.widths.values()].reduce((sum, width) => sum + width, 0)}px`,
      });
  }

  private makeColumnResize(header: HTMLElement, pid: BasesPropertyId) {
    const handle = header.createDiv({
      cls: 'wcc-table-column-resize',
      attr: {
        role: 'separator',
        tabindex: '0',
        'aria-orientation': 'vertical',
        'aria-label': `Resize ${pid === 'file.name' ? 'Name' : this.config.getDisplayName(pid)} column`,
        'aria-valuemin': String(this.minColumnWidth),
      },
    });
    const update = (width: number) => {
      this.widths.set(pid, Math.max(this.minColumnWidth, Math.round(width)));
      this.applyWidths();
      handle.setAttribute('aria-valuenow', String(this.widths.get(pid)));
    };
    const save = () => {
      const old = this.config.get('columnWidths');
      this.config.set('columnWidths', {
        ...(old && typeof old === 'object' && !Array.isArray(old) ? old : {}),
        [pid]: this.widths.get(pid),
      });
    };
    handle.setAttribute('aria-valuenow', String(this.widths.get(pid)));
    let active: { id: number; x: number; width: number; moved: boolean } | null = null;
    handle.onpointerdown = (event) => {
      if (event.button !== 0 || active) return;
      event.preventDefault();
      event.stopPropagation();
      this.dragging = true;
      active = {
        id: event.pointerId,
        x: event.clientX,
        width: header.getBoundingClientRect().width,
        moved: false,
      };
      handle.setPointerCapture(event.pointerId);
      handle.addClass('wcc-table-column-resizing');
    };
    handle.onpointermove = (event) => {
      if (active && event.pointerId === active.id) {
        active.moved ||= event.clientX !== active.x;
        update(active.width + event.clientX - active.x);
      }
    };
    const finish = (event: PointerEvent, cancel: boolean) => {
      if (!active || event.pointerId !== active.id) return;
      const { width: old, moved } = active;
      active = null;
      if (moved) {
        if (cancel) update(old);
        else save();
      }
      handle.removeClass('wcc-table-column-resizing');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.dragging = false;
      // Leave a stationary divider in place so the second click can reset its width.
      if (moved) this.onDataUpdated();
    };
    handle.onpointerup = (event) => finish(event, false);
    handle.onpointercancel = (event) => finish(event, true);
    handle.onlostpointercapture = (event) => finish(event, true);
    handle.ondblclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const old = this.config.get('columnWidths');
      const saved: Record<string, unknown> =
        old && typeof old === 'object' && !Array.isArray(old) ? { ...old } : {};
      delete saved[pid];
      this.config.set('columnWidths', saved);
      this.onDataUpdated();
    };
    handle.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    handle.onkeydown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      update(
        this.widths.get(pid)! + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10),
      );
      save();
    };
  }
}
