import type { ListItem } from './model';
import { createBackground } from '../../shared/background';
import { viewProperty } from '../../shared/view-properties';
import { createViewNote, groupDefaults } from '../../shared/view-create';
import { applyItemPadding } from '../../shared/view-spacing';
import { colorCheckbox, propertyColor } from '../../shared/task-appearance';
import type {
  QueryController,
  HoverParent,
  HoverPopover,
  BasesEntry,
  BasesPropertyId,
  Value,
} from 'obsidian';
import {
  BasesView,
  TFile,
  Keymap,
  parsePropertyId,
  BooleanValue,
  NullValue,
  Menu,
  Notice,
} from 'obsidian';
import type BaseViewsPlugin from '../../main';
import { writeProp } from '../../shared/frontmatter';
import { PropertyFieldRenderer } from '../../shared/property-field';
import type { DragPoint } from '../../shared/drag';
import {
  PointerDrag,
  DropIndicator,
  rememberScroll,
  dragGrip,
  beforeAt,
  moveBefore,
} from '../../shared/drag';
import { numericOrder } from '../../shared/list-properties';

export const VIEW_TYPE_BASE_LIST = 'wcc-list';

const NULL_KEY = '(no value)';

export class BaseListView extends BasesView implements HoverParent {
  readonly type: string = VIEW_TYPE_BASE_LIST;
  hoverPopover: HoverPopover | null = null;

  protected wrap: HTMLElement;

  protected doneProp: BasesPropertyId | null = null;
  protected sortOrderProp: BasesPropertyId | null = null;

  private dragId: string | null = null;
  protected dragging = false;
  private pointerDrag: PointerDrag;
  private dropList: HTMLElement | null = null;
  private dropBefore: string | null = null;
  private dragGroupKey: string | null = null;
  private dropIndicator: DropIndicator;

  constructor(ctrl: QueryController, parent: HTMLElement, _plugin: BaseViewsPlugin) {
    super(ctrl);
    this.wrap = parent.createDiv('wcc-list-wrap');
    this.dropIndicator = new DropIndicator(this.wrap);
    this.pointerDrag = new PointerDrag(this.wrap, {
      items: '.wcc-list-row',
      ignore: 'a:not(.wcc-list-row-link), button, input, textarea, .wcc-list-row-props',
      onStart: (row) => {
        this.dragId = row.dataset.itemId!;
        this.dragGroupKey =
          row.closest<HTMLElement>('[data-list-group]')?.dataset.listGroup ?? NULL_KEY;
        this.dragging = true;
      },
      onMove: (_row, point) => this.updateListDrop(point),
      onDrop: async (_row, point) => {
        this.updateListDrop(point);
        await this.commitListDrop();
      },
      onEnd: () => {
        this.dragging = false;
        this.dragId = null;
        this.dragGroupKey = null;
        this.clearListDrop();
        void this.onDataUpdated();
      },
      onError: (error) => {
        console.error(error);
        new Notice('Failed to move task. The list has been refreshed.');
      },
    });
  }

  async onDataUpdated(): Promise<void> {
    if (this.dragging) return;
    applyItemPadding(this.wrap, this.config);
    const restoreScroll = rememberScroll(this.wrap, []);
    const done = viewProperty(this.config, 'doneProperty');
    this.doneProp = done && parsePropertyId(done).type === 'note' ? done : null;
    const order = viewProperty(this.config, 'sortOrderProperty');
    this.sortOrderProp = order && parsePropertyId(order).type === 'note' ? order : null;
    this.wrap.empty();
    this.buildBackground();
    this.buildList();
    restoreScroll();
  }

  // ── background ───────────────────────────────────────────────────────────

  private buildBackground() {
    createBackground(this.wrap, this.app, this.config, 'wcc-list-bg-layer');
  }

  // ── color helpers ────────────────────────────────────────────────────────

  protected getItemColor(item: ListItem): string | null {
    return propertyColor(this.config, item.entry);
  }

  // ── groupBy helper (same as kanban) ──────────────────────────────────────

  protected getGroupByPropId(): BasesPropertyId | null {
    const extract = (v: unknown): BasesPropertyId | null => {
      if (typeof v === 'string' && v) return v as BasesPropertyId;
      if (v && typeof v === 'object') {
        const p = (v as Record<string, unknown>).property;
        if (typeof p === 'string' && p) return p as BasesPropertyId;
      }
      return null;
    };
    return (
      extract(this.config.get('groupBy')) ??
      extract((this.config as unknown as Record<string, unknown>).groupBy)
    );
  }

  // ── build ────────────────────────────────────────────────────────────────

  protected buildList() {
    const groups = this.data.groupedData;
    const isGrouped =
      groups && groups.length > 0 && groups.some((g) => g.hasKey() && g.key != null);

    if (!groups?.length) {
      this.wrap.createDiv({ cls: 'wcc-list-empty', text: 'No data' });
      return;
    }

    if (!isGrouped) {
      const listEl = this.wrap.createDiv('wcc-list-ungrouped');
      const items = this.collectItems(groups.flatMap((g) => [...g.entries]));
      items.forEach((item) => this.makeRow(listEl, item, NULL_KEY));
      this.makeAddButton(this.wrap, NULL_KEY);
      listEl.dataset.listGroup = NULL_KEY;
      return;
    }

    for (const group of groups) {
      const groupKey = group.hasKey() && group.key != null ? group.key.toString() : NULL_KEY;
      const section = this.wrap.createDiv('wcc-list-group');

      const header = section.createDiv('wcc-list-group-header');
      const label = header.createDiv('wcc-list-group-label');
      label.textContent = groupKey === NULL_KEY ? '—' : groupKey;
      label.title = groupKey === NULL_KEY ? '—' : groupKey;
      const addBtn = header.createEl('button', {
        cls: 'wcc-list-add',
        attr: {
          'aria-label': `Add note in "${groupKey}"`,
          title: `Add note in "${groupKey}"`,
          type: 'button',
        },
      });
      addBtn.innerHTML = plusSvg();
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.createListItem(groupKey);
      };

      const listEl = section.createDiv('wcc-list-items');
      const items = this.collectItems([...group.entries]);
      items.forEach((item) => this.makeRow(listEl, item, groupKey));
      listEl.dataset.listGroup = groupKey;
    }
  }

  protected collectItems(entries: BasesEntry[]): ListItem[] {
    const items: ListItem[] = entries
      .filter((e) => e.file instanceof TFile)
      .map((e) => {
        const file = e.file as TFile;
        let done = false;
        if (this.doneProp) {
          const dv = e.getValue(this.doneProp);
          if (dv instanceof BooleanValue) done = dv.isTruthy();
        }
        return { id: file.path, title: file.basename, file, entry: e, done };
      });

    if (this.sortOrderProp) {
      const sp = this.sortOrderProp;
      return [...items].sort((a, b) => {
        const av = a.entry.getValue(sp);
        const bv = b.entry.getValue(sp);
        const an = numericOrder(av?.toString());
        const bn = numericOrder(bv?.toString());
        return an - bn;
      });
    }
    return items;
  }

  // ── row rendering ────────────────────────────────────────────────────────

  private makeRow(container: HTMLElement, item: ListItem, _groupKey: string) {
    const row = container.createDiv('wcc-list-row' + (item.done ? ' wcc-list-row-done' : ''));
    row.dataset.itemId = item.id;
    row.toggleClass('wcc-list-has-check', !!this.doneProp);

    const color = this.getItemColor(item);
    if (color) {
      row.style.borderLeft = `3px solid ${color}`;
      row.style.background = `color-mix(in srgb, ${color} 12%, var(--background-primary))`;
    }

    const titleRow = row.createDiv('wcc-list-row-title');
    this.renderTitle(titleRow, item, row);

    row.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button, input, textarea, a, .wcc-list-row-props'))
        return;
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e as MouseEvent));
      leaf?.openFile(item.file);
    };

    // Middle-click opens in a new tab, like a normal Obsidian link
    row.addEventListener('mousedown', (e) => {
      if (
        e.button === 1 &&
        !(e.target as HTMLElement).closest('.wcc-list-row-props, button, input, textarea')
      )
        e.preventDefault();
    });
    row.addEventListener('auxclick', (e) => {
      if (
        e.button !== 1 ||
        (e.target as HTMLElement).closest('.wcc-list-row-props, button, input, textarea')
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      this.app.workspace.getLeaf('tab').openFile(item.file);
    });

    if (color) {
      row.addEventListener('mouseenter', () => {
        row.style.background = `color-mix(in srgb, ${color} 22%, var(--background-primary))`;
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = `color-mix(in srgb, ${color} 12%, var(--background-primary))`;
      });
    }

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e, item);
    });

    const props = row.createDiv('wcc-list-row-props');
    this.config.getOrder().forEach((pid) => {
      if (pid === 'file.name') return;
      if (this.doneProp && pid === this.doneProp) return;
      const val = item.entry.getValue(pid);
      if ((!val || val instanceof NullValue) && parsePropertyId(pid).type !== 'note') return;
      const propRow = props.createDiv('wcc-list-prop-row');
      propRow.createSpan({
        cls: 'wcc-list-prop-label',
        text: this.config.getDisplayName(pid) + ': ',
      });
      this.renderPropVal(propRow, val ?? new NullValue(), item, pid);
    });
  }

  protected renderTitle(titleRow: HTMLElement, item: ListItem, row: HTMLElement) {
    dragGrip(titleRow, `Drag ${item.title} to reorder or move between groups`);

    if (this.doneProp) {
      const cb = titleRow.createEl('button', {
        cls: 'wcc-list-check' + (item.done ? ' wcc-list-check-on' : ''),
        attr: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(item.done),
          'aria-label': `Mark ${item.title} ${item.done ? 'incomplete' : 'complete'}`,
        },
      });
      colorCheckbox(cb, this.config, item.entry);
      cb.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newVal = !item.done;
        cb.disabled = true;
        try {
          await writeProp(this.app, item.file, this.doneProp!, newVal);
        } catch (err) {
          console.error(err);
          new Notice('Failed to update completion');
          return;
        } finally {
          cb.disabled = false;
        }
        item.done = newVal;
        row.toggleClass('wcc-list-row-done', newVal);
        cb.toggleClass('wcc-list-check-on', newVal);
        cb.setAttribute('aria-checked', String(newVal));
        cb.setAttribute('aria-label', `Mark ${item.title} ${newVal ? 'incomplete' : 'complete'}`);
      };
    }

    const link = titleRow.createEl('a', { text: item.title, cls: 'wcc-list-row-link', href: '#' });
    link.draggable = false;
    link.title = item.title;
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e as MouseEvent));
      leaf?.openFile(item.file);
    };
    link.onmouseover = (e) => {
      this.app.workspace.trigger('hover-link', {
        event: e,
        source: 'bases',
        hoverParent: this,
        targetEl: row,
        linktext: item.file.path,
      });
    };
  }

  protected renderPropVal(parent: HTMLElement, val: Value, item: ListItem, pid: BasesPropertyId) {
    new PropertyFieldRenderer(this, 'wcc-list').render(parent, val, item, pid);
  }

  // ── drag-and-drop ────────────────────────────────────────────────────────

  private clearListDrop() {
    this.dropList?.classList.remove('wcc-list-drop');
    this.dropList = null;
    this.dropBefore = null;
    this.dropIndicator.hide();
  }

  private updateListDrop(point: DragPoint) {
    this.clearListDrop();
    const hit = this.wrap.ownerDocument.elementFromPoint(point.x, point.y);
    if (!hit || !this.wrap.contains(hit)) return;
    const list =
      hit.closest<HTMLElement>('[data-list-group]') ??
      hit.closest('.wcc-list-group')?.querySelector<HTMLElement>('[data-list-group]') ??
      this.wrap.querySelector<HTMLElement>('.wcc-list-ungrouped, .wcc-table-ungrouped');
    if (!list) return;
    this.dropList = list;
    list.classList.add('wcc-list-drop');
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.wcc-list-row'));
    const before = beforeAt(rows, point.y, this.dragId!, 'itemId');
    this.dropBefore = before?.dataset.itemId ?? null;
    const remaining = rows.filter((row) => row.dataset.itemId !== this.dragId);
    const target =
      list.dataset.listGroup === NULL_KEY ? 'List' : (list.dataset.listGroup ?? 'List');
    this.dropIndicator.show(
      list,
      before,
      remaining[remaining.length - 1] ?? null,
      `${target} · ${before ? 'Before ' + before.querySelector('a')?.textContent : 'At end'}`,
    );
  }

  private async commitListDrop() {
    const list = this.dropList;
    const id = this.dragId;
    if (!list || !id) return;
    const group = list.dataset.listGroup ?? NULL_KEY;
    const crossing = group !== this.dragGroupKey;
    if (!crossing && !this.sortOrderProp) {
      new Notice('Select a numeric Sort order property to save manual list order.');
      return;
    }
    const file = this.app.vault.getFileByPath(id);
    if (!file) return;
    const ids = Array.from(list.querySelectorAll<HTMLElement>('.wcc-list-row'))
      .map((row) => row.dataset.itemId!)
      .filter(Boolean);
    const order = moveBefore(ids, id, this.dropBefore);
    if (!crossing && ids.join('\n') === order.join('\n')) return;
    if (crossing) {
      const groupPid = this.getGroupByPropId();
      if (!groupPid || parsePropertyId(groupPid).type !== 'note') {
        new Notice('Choose a note property for grouping to move between groups.');
        return;
      }
      await writeProp(this.app, file, groupPid, group === NULL_KEY ? '' : group);
    }
    if (this.sortOrderProp) {
      for (let i = 0; i < order.length; i++) {
        const target = this.app.vault.getFileByPath(order[i]);
        if (target) await writeProp(this.app, target, this.sortOrderProp, i * 10);
      }
    }
  }

  onunload() {
    this.pointerDrag.destroy();
    this.clearListDrop();
    this.dropIndicator.destroy();
    super.onunload();
  }

  // ── context menu ─────────────────────────────────────────────────────────

  protected showContextMenu(e: MouseEvent, item: ListItem) {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle('Open in new tab')
        .setIcon('file-plus')
        .onClick(() => {
          this.app.workspace.getLeaf('tab').openFile(item.file);
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle('Open to the right')
        .setIcon('separator-vertical')
        .onClick(() => {
          this.app.workspace.getLeaf('split').openFile(item.file);
        }),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle('Duplicate')
        .setIcon('copy')
        .onClick(async () => {
          await this.duplicateItem(item);
        }),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle('Delete')
        .setIcon('trash')
        .setWarning(true)
        .onClick(async () => {
          await this.app.fileManager.trashFile(item.file);
          new Notice(`Trashed "${item.title}"`);
        }),
    );
    menu.showAtMouseEvent(e);
  }

  private async duplicateItem(item: ListItem) {
    const dir = item.file.parent?.path ?? '';
    let base = `${item.file.basename} (copy)`;
    let path = dir ? `${dir}/${base}.md` : `${base}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      base = `${item.file.basename} (copy ${i++})`;
      path = dir ? `${dir}/${base}.md` : `${base}.md`;
    }
    try {
      const newFile = await this.app.vault.copy(item.file, path);
      this.app.workspace.getLeaf(false)?.openFile(newFile);
    } catch (err) {
      console.error(err);
      new Notice('Failed to duplicate');
    }
  }

  // ── quick add ────────────────────────────────────────────────────────────

  private makeAddButton(parent: HTMLElement, groupKey: string) {
    const btn = parent.createEl('button', {
      cls: 'wcc-list-add wcc-list-add-footer',
      attr: { 'aria-label': 'Add note', title: 'Add note', type: 'button' },
    });
    btn.innerHTML = plusSvg() + ' <span>Add note</span>';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.createListItem(groupKey);
    };
  }

  protected createListItem(groupKey: string) {
    return createViewNote(this, undefined, groupDefaults(this, this.getGroupByPropId(), groupKey));
  }
}

function plusSvg(): string {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
}

export type { ListItem } from './model';
