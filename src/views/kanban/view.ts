import { viewHelp } from '../../shared/view-help';
import { CardDetails } from '../../shared/card-details';
import {
  checkboxProperty,
  viewGroups,
  collapseArrow,
  groupArrow,
  configuredStatuses,
  statusProperty,
  groupProperty,
} from '../../shared/status';
import type { KanbanCard } from './model';
import { createBackground } from '../../shared/background';
import { viewProperty } from '../../shared/view-properties';
import { PropertyFieldRenderer } from '../../shared/property-field';
import { createViewNote, groupDefaults } from '../../shared/view-create';
import { applyItemPadding } from '../../shared/view-spacing';
import { numericOrder } from '../../shared/list-properties';
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
  ListValue,
  Menu,
  Notice,
} from 'obsidian';
import type { DragPoint } from '../../shared/drag';
import {
  PointerDrag,
  DropIndicator,
  rememberScroll,
  dragGrip,
  beforeAt,
  moveBefore,
} from '../../shared/drag';
import { writeProp } from '../../shared/frontmatter';
import { AUTO_PALETTE } from '../../shared/color-rules';
import type BaseViewsPlugin from '../../main';

export const VIEW_TYPE_BASE_KANBAN = 'wcc-kanban';

const NULL_KEY = '(no value)';

export class BaseKanbanView extends BasesView implements HoverParent {
  private get win(): Window {
    return this.wrap.ownerDocument.defaultView!;
  }
  readonly type = VIEW_TYPE_BASE_KANBAN;
  hoverPopover: HoverPopover | null = null;

  private wrap: HTMLElement;
  private cardDetails = new CardDetails();
  private colorMap: Map<string, string> = new Map();
  private autoColorMap: Map<string, string> = new Map();

  private pointerDrag: PointerDrag;
  private isDragging = false;
  private dragCards: KanbanCard[] = [];
  private dropContainer: HTMLElement | null = null;
  private dropBefore: string | null = null;
  private dropIndicator: DropIndicator;

  // pending inline-add ghost card (survives re-renders)
  private pendingGhost: { colKey: string; subgroupKey: string; text: string } | null = null;

  constructor(ctrl: QueryController, parent: HTMLElement, _plugin: BaseViewsPlugin) {
    super(ctrl);
    this.wrap = parent.createDiv('wcc-kanban-wrap');
    this.dropIndicator = new DropIndicator(this.wrap);
    this.pointerDrag = new PointerDrag(this.wrap, {
      items: '.wcc-kanban-card:not(.wcc-kanban-ghost-card), .wcc-kanban-col',
      wholeItem: '.wcc-kanban-card:not(.wcc-kanban-ghost-card)',
      ignore:
        'a:not(.wcc-kanban-card-link), button, input, textarea, select, .wcc-kanban-card-props',
      onStart: (item, event) => {
        if (
          item.classList.contains('wcc-kanban-col') &&
          (event.target as Element).closest('.wcc-kanban-col-body')
        )
          return false;
        this.isDragging = true;
      },
      onMove: (item, point) => this.updateKanbanDrop(item, point),
      onDrop: async (item, point) => {
        this.updateKanbanDrop(item, point);
        await this.commitKanbanDrop(item);
      },
      onEnd: () => {
        this.isDragging = false;
        this.clearKanbanDrop();
        void this.onDataUpdated();
      },
      onError: (error) => {
        console.error(error);
        new Notice('Failed to save kanban move. The board has been refreshed.');
      },
    });
  }

  onDataUpdated(): void {
    if (this.isDragging) return;
    applyItemPadding(this.wrap, this.config);
    const restoreScroll = rememberScroll(this.wrap, ['.wcc-kanban-board', '.wcc-kanban-col-body']);
    this.colorMap = this.parseColorMap();
    this.dragCards = [];
    this.wrap.empty();
    this.renderViewTools();
    this.buildBoard();
    restoreScroll();
  }

  onunload() {
    this.pointerDrag.destroy();
    this.clearKanbanDrop();
    this.dropIndicator.destroy();
    super.onunload();
  }

  private renderViewTools() {
    const toolbar = this.wrap.createDiv('wcc-view-tools');
    const columns = this.getHiddenColumns();
    const subgroups = this.getHiddenSubgroups();
    if (columns.length || subgroups.length) {
      const restore = toolbar.createEl('button', {
        text: 'Manage hidden groups',
        attr: { type: 'button' },
      });
      restore.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const menu = new Menu();
        const addRestore = (key: string, values: string[], value: string, label: string) =>
          menu.addItem((item) =>
            item.setTitle(`Show ${label}: ${value}`).onClick(() => {
              this.config.set(
                key,
                values.filter((v) => v !== value),
              );
              this.onDataUpdated();
            }),
          );
        for (const value of columns) addRestore('hiddenColumns', columns, value, 'column');
        for (const value of subgroups) addRestore('hiddenSubgroups', subgroups, value, 'swimlane');
        menu.addSeparator();
        menu.addItem((item) =>
          item.setTitle('Show all hidden groups').onClick(() => {
            this.config.set('hiddenColumns', []);
            this.config.set('hiddenSubgroups', []);
            this.onDataUpdated();
          }),
        );
        menu.showAtMouseEvent(event);
      };
    }
    viewHelp(this.app, toolbar, 'kanban');
  }

  // ── config helpers ──────────────────────────────────────────────────────

  private getHiddenColumns(): string[] {
    const v = this.config.get('hiddenColumns');
    return Array.isArray(v) ? (v as string[]) : [];
  }

  private getHiddenSubgroups(): string[] {
    const v = this.config.get('hiddenSubgroups');
    return Array.isArray(v) ? (v as string[]) : [];
  }

  private getCollapsedColumns(): string[] {
    const v = this.config.get('collapsedColumns');
    return Array.isArray(v) ? (v as string[]) : [];
  }

  private toggleCollapsed(key: string) {
    const collapsed = this.getCollapsedColumns();
    if (collapsed.includes(key)) {
      this.config.set(
        'collapsedColumns',
        collapsed.filter((k) => k !== key),
      );
    } else {
      this.config.set('collapsedColumns', [...collapsed, key]);
    }
  }

  private getColumnOrder(): string[] {
    const v = this.config.get('columnOrder');
    return Array.isArray(v) ? (v as string[]) : [];
  }

  private getManualCardOrder(): Record<string, string[]> {
    const v = this.config.get('manualCardOrder');
    if (typeof v === 'string') {
      try {
        const parsed: unknown = JSON.parse(v);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string[]] =>
              Array.isArray(entry[1]) && entry[1].every((id: unknown) => typeof id === 'string'),
          ),
        );
      } catch {
        return {};
      }
    }
    return {};
  }

  private async setManualCardOrder(order: Record<string, string[]>) {
    this.config.set('manualCardOrder', JSON.stringify(order));
  }

  private async setColumnOrder(order: string[]) {
    this.config.set('columnOrder', order);
  }

  private async hideColumn(key: string) {
    const hidden = this.getHiddenColumns();
    if (!hidden.includes(key)) this.config.set('hiddenColumns', [...hidden, key]);
  }

  private async hideSubgroup(key: string) {
    const hidden = this.getHiddenSubgroups();
    if (!hidden.includes(key)) this.config.set('hiddenSubgroups', [...hidden, key]);
  }

  // ── color helpers ───────────────────────────────────────────────────────

  private parseColorMap(): Map<string, string> {
    const v = this.config.get('columnColors');
    const lines = Array.isArray(v) ? (v as string[]) : [];
    const map = new Map<string, string>();
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const color = line.slice(idx + 1).trim();
      if (key && color) map.set(key, color);
    }
    return map;
  }

  private getColumnColor(key: string): string | null {
    return this.colorMap.get(key) ?? this.autoColorMap.get(key) ?? null;
  }

  private setColumnColor(key: string, color: string) {
    const v = this.config.get('columnColors');
    const lines = Array.isArray(v) ? [...(v as string[])] : [];
    const existingIdx = lines.findIndex((l) => {
      const i = l.indexOf(':');
      return i !== -1 && l.slice(0, i).trim() === key;
    });
    const newLine = `${key}:${color}`;
    if (existingIdx !== -1) lines[existingIdx] = newLine;
    else lines.push(newLine);
    this.config.set('columnColors', lines);
  }

  private clearColumnColor(key: string) {
    const v = this.config.get('columnColors');
    const lines = Array.isArray(v) ? (v as string[]) : [];
    this.config.set(
      'columnColors',
      lines.filter((l) => {
        const i = l.indexOf(':');
        return i === -1 || l.slice(0, i).trim() !== key;
      }),
    );
  }

  // ── column order helpers ────────────────────────────────────────────────

  private orderColumns(rawKeys: string[]): string[] {
    const saved = this.getColumnOrder();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const k of saved) {
      if (rawKeys.includes(k)) {
        result.push(k);
        seen.add(k);
      }
    }
    for (const k of rawKeys) {
      if (!seen.has(k)) result.push(k);
    }
    return result;
  }

  private getSortOrderProp(): BasesPropertyId | null {
    const pid = viewProperty(this.config, 'sortOrderProperty');
    return pid && parsePropertyId(pid).type === 'note' ? pid : null;
  }

  private sortCardsInColumn(cards: KanbanCard[], bucketKey: string): KanbanCard[] {
    const sortProp = this.getSortOrderProp();
    if (sortProp) {
      return [...cards].sort((a, b) => {
        const av = a.entry.getValue(sortProp);
        const bv = b.entry.getValue(sortProp);
        const an = numericOrder(av?.toString());
        const bn = numericOrder(bv?.toString());
        return an - bn;
      });
    }
    const order = this.getManualCardOrder();
    const ids = order[bucketKey];
    if (!ids?.length) return cards;
    const map = new Map(cards.map((c) => [c.id, c]));
    const sorted: KanbanCard[] = [];
    for (const id of ids) {
      const c = map.get(id);
      if (c) {
        sorted.push(c);
        map.delete(id);
      }
    }
    for (const c of map.values()) sorted.push(c);
    return sorted;
  }

  // Read the base's groupBy property. The groupBy field is not part of
  // BasesViewConfig's public API, but we try two routes:
  // 1. config.get('groupBy') — reads the full underlying view config dict
  // 2. direct cast on the config object — in case it's exposed as an instance field
  // The on-disk shape is `groupBy: {}` (opaque), but in practice it carries
  // a `property` key (BasesPropertyId). We also handle the case where it's
  // stored as a plain string.
  private getGroupByPropId(): BasesPropertyId | null {
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

  private cardTitle(entry: BasesEntry): string {
    const titlePid = viewProperty(this.config, 'cardTitleProperty');
    if (titlePid) {
      const v = entry.getValue(titlePid);
      if (v && !(v instanceof NullValue)) return v.toString();
    }
    if (entry.file instanceof TFile) return entry.file.basename;
    return 'Untitled';
  }

  /** Resolve a cover-image value (URL, vault path, or [[wikilink]]) to a displayable URL. */
  private resolveImageUrl(raw: string, sourcePath: string): string | null {
    let trimmed = raw.trim();
    if (!trimmed) return null;
    const wiki = trimmed.match(/^!?\[\[([^\]|]+)(\|[^\]]*)?\]\]$/);
    if (wiki) trimmed = wiki[1].trim();
    if (/^(https?:|data:|app:|file:)/i.test(trimmed)) return trimmed;
    const file =
      this.app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath) ??
      this.app.vault.getAbstractFileByPath(trimmed);
    if (file instanceof TFile) return this.app.vault.getResourcePath(file);
    return null;
  }

  // ── build ───────────────────────────────────────────────────────────────

  private buildBoard() {
    createBackground(this.wrap, this.app, this.config, 'wcc-kanban-bg-layer');

    const groups = viewGroups(this);

    const subgroupPid = viewProperty(this.config, 'subgroupProperty') ?? null;
    const donePid = checkboxProperty(this.config);
    const statusGrouped =
      statusProperty(this.config) !== null &&
      groupProperty(this.config) === statusProperty(this.config);
    const showEmpty = statusGrouped || this.config.get('showEmptyColumns') !== false;
    const colorMode = (this.config.get('columnColorMode') as string) || 'header';
    const hiddenCols = new Set(this.getHiddenColumns());
    const hiddenSubs = new Set(this.getHiddenSubgroups());
    const collapsedCols = new Set(this.getCollapsedColumns());

    const allColKeysRaw: string[] = [];
    const colKeySet = new Set<string>();
    for (const g of groups) {
      const key = g.hasKey() && g.key != null ? g.key.toString() : NULL_KEY;
      if (!colKeySet.has(key)) {
        colKeySet.add(key);
        allColKeysRaw.push(key);
      }
    }
    for (const key of this.getColumnOrder())
      if (!colKeySet.has(key)) {
        colKeySet.add(key);
        allColKeysRaw.push(key);
      }
    const allColKeys = this.orderColumns(allColKeysRaw);

    // Auto-color columns when no colors manually configured
    this.autoColorMap = new Map();
    if (this.colorMap.size === 0) {
      [...allColKeysRaw].sort().forEach((k, i) => {
        this.autoColorMap.set(k, AUTO_PALETTE[i % AUTO_PALETTE.length]);
      });
    }

    const mergedOrder = this.orderColumns(allColKeysRaw);
    const savedOrder = this.getColumnOrder();
    if (JSON.stringify(mergedOrder) !== JSON.stringify(savedOrder)) {
      this.config.set('columnOrder', mergedOrder);
    }

    const makeCard = (entry: BasesEntry, colKey: string, sgKey: string): KanbanCard | null => {
      if (!(entry.file instanceof TFile)) return null;
      let done = false;
      if (donePid) {
        const dv = entry.getValue(donePid);
        if (dv instanceof BooleanValue) done = dv.isTruthy();
      }
      const card = {
        id: entry.file.path,
        title: this.cardTitle(entry),
        file: entry.file,
        entry,
        columnKey: colKey,
        subgroupKey: sgKey,
        done,
      };
      this.dragCards.push(card);
      return card;
    };

    if (!subgroupPid || !groups.some((g) => g.entries.length)) {
      const cards: KanbanCard[] = [];
      for (const g of groups) {
        const colKey = g.hasKey() && g.key != null ? g.key.toString() : NULL_KEY;
        for (const entry of g.entries) {
          const card = makeCard(entry, colKey, '');
          if (card) cards.push(card);
        }
      }
      this.renderBoard(
        this.wrap,
        '',
        allColKeys,
        cards,
        hiddenCols,
        collapsedCols,
        showEmpty,
        colorMode,
        donePid,
      );
    } else {
      const subgroupOrder: string[] = [];
      const subgroupMap = new Map<string, Map<string, KanbanCard[]>>();

      for (const g of groups) {
        const colKey = g.hasKey() && g.key != null ? g.key.toString() : NULL_KEY;
        for (const entry of g.entries) {
          if (!(entry.file instanceof TFile)) continue;
          const sgVal = entry.getValue(subgroupPid);
          const sgKey = sgVal && !(sgVal instanceof NullValue) ? sgVal.toString() : NULL_KEY;
          if (!subgroupMap.has(sgKey)) {
            subgroupOrder.push(sgKey);
            subgroupMap.set(sgKey, new Map());
          }
          const colMap = subgroupMap.get(sgKey)!;
          if (!colMap.has(colKey)) colMap.set(colKey, []);
          const card = makeCard(entry, colKey, sgKey);
          if (card) colMap.get(colKey)!.push(card);
        }
      }

      for (const sgKey of subgroupOrder) {
        if (hiddenSubs.has(sgKey)) continue;
        const section = this.wrap.createDiv('wcc-kanban-section');
        const sHdr = section.createDiv('wcc-kanban-section-hdr');
        const collapsed = groupArrow(this, sHdr, `subgroup:${sgKey}`);
        sHdr.createSpan({ cls: 'wcc-kanban-section-title', text: sgKey });
        const kebab = sHdr.createEl('button', { cls: 'wcc-kanban-kebab', title: 'Options' });
        kebab.textContent = '⋮';
        kebab.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = new Menu();
          menu.addItem((i) =>
            i
              .setTitle('Hide sub-group')
              .setIcon('eye-off')
              .onClick(async () => {
                await this.hideSubgroup(sgKey);
              }),
          );
          menu.showAtMouseEvent(e);
        });

        if (collapsed) continue;
        const colMap = subgroupMap.get(sgKey)!;
        const cards: KanbanCard[] = [];
        for (const [, colCards] of colMap) cards.push(...colCards);
        this.renderBoard(
          section,
          sgKey,
          allColKeys,
          cards,
          hiddenCols,
          collapsedCols,
          showEmpty,
          colorMode,
          donePid,
        );
      }
    }
  }

  private renderBoard(
    container: HTMLElement,
    subgroupKey: string,
    allColKeys: string[],
    cards: KanbanCard[],
    hiddenCols: Set<string>,
    collapsedCols: Set<string>,
    showEmpty: boolean,
    colorMode: string,
    donePid: BasesPropertyId | null,
  ) {
    const board = container.createDiv('wcc-kanban-board');
    const groupPid = groupProperty(this.config);
    if (groupPid && parsePropertyId(groupPid).type === 'note') {
      const creator = board.createDiv('wcc-kanban-column-creator');
      const add = creator.createEl('button', {
        text: 'Add column',
        cls: 'wcc-kanban-add-column',
        attr: { type: 'button', 'aria-label': 'Add column', title: 'Add column' },
      });
      add.onclick = (event) => {
        event.stopPropagation();
        if (creator.querySelector('input')) return;
        const input = creator.createEl('input', {
          type: 'text',
          attr: { placeholder: 'New column name', 'aria-label': 'New column name' },
        });
        const save = creator.createEl('button', { text: 'Add', attr: { type: 'button' } });
        const cancel = creator.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
        const dismiss = () => {
          input.remove();
          save.remove();
          cancel.remove();
          add.focus();
        };
        const submit = () => {
          const value = input.value.trim();
          if (!value) {
            input.focus();
            return;
          }
          if (groupPid === statusProperty(this.config)) {
            this.config.set('statusValues', [
              ...new Set([...configuredStatuses(this.config), value]),
            ]);
          }
          this.config.set('columnOrder', [...new Set([...allColKeys, value])]);
          const hidden = this.getHiddenColumns();
          this.config.set(
            'hiddenColumns',
            hidden.filter((key) => key !== value),
          );
          this.config.set('showEmptyColumns', true);
          this.onDataUpdated();
        };
        save.onclick = submit;
        cancel.onclick = dismiss;
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') dismiss();
        };
        input.focus();
      };
    }

    const byCol = new Map<string, KanbanCard[]>();
    for (const c of cards) {
      if (!byCol.has(c.columnKey)) byCol.set(c.columnKey, []);
      byCol.get(c.columnKey)!.push(c);
    }

    const visibleCols = allColKeys.filter((k) => {
      if (hiddenCols.has(k)) return false;
      if (!showEmpty && !byCol.get(k)?.length) return false;
      return true;
    });

    const expandedCols = visibleCols.filter((k) => !collapsedCols.has(k));
    const collapsedVisible = visibleCols.filter((k) => collapsedCols.has(k));

    for (const colKey of expandedCols) {
      const rawCards = byCol.get(colKey) ?? [];
      const bucketKey = `${subgroupKey}||${colKey}`;
      const sorted = this.sortCardsInColumn(rawCards, bucketKey);
      this.renderColumn(
        board,
        colKey,
        sorted,
        subgroupKey,
        allColKeys,
        bucketKey,
        false,
        colorMode,
        donePid,
      );
    }
    for (const colKey of collapsedVisible) {
      const rawCards = byCol.get(colKey) ?? [];
      const bucketKey = `${subgroupKey}||${colKey}`;
      this.renderColumn(
        board,
        colKey,
        rawCards,
        subgroupKey,
        allColKeys,
        bucketKey,
        true,
        colorMode,
        donePid,
      );
    }
  }

  private renderColumn(
    board: HTMLElement,
    colKey: string,
    cards: KanbanCard[],
    subgroupKey: string,
    _allColKeys: string[],
    bucketKey: string,
    collapsed: boolean,
    colorMode: string,
    donePid: BasesPropertyId | null,
  ) {
    const color = this.getColumnColor(colKey);
    const col = board.createDiv(
      collapsed ? 'wcc-kanban-col wcc-kanban-col-collapsed' : 'wcc-kanban-col',
    );
    col.dataset.colKey = colKey;
    col.dataset.subgroupKey = subgroupKey;

    // Whole-column tint
    if (color && colorMode === 'column') {
      col.setCssStyles({
        background: `color-mix(in srgb, ${color} 20%, var(--background-secondary))`,
      });
    }

    // ── Header ──
    const hdr = col.createDiv('wcc-kanban-col-hdr');
    collapseArrow(hdr, colKey, collapsed, () => {
      this.toggleCollapsed(colKey);
      this.onDataUpdated();
    });
    dragGrip(hdr, `Drag column ${colKey} to reorder`);
    if (color && (colorMode === 'header' || colorMode === 'both')) {
      hdr.setCssStyles({ borderTop: `4px solid ${color}` });
      hdr.setCssStyles({
        background: `color-mix(in srgb, ${color} 30%, var(--background-secondary))`,
      });
    } else if (color && colorMode === 'column') {
      hdr.setCssStyles({
        background: `color-mix(in srgb, ${color} 22%, var(--background-secondary))`,
      });
    }

    if (collapsed) {
      hdr.createSpan({ cls: 'wcc-kanban-col-title', text: `${colKey} · ${cards.length}` });
    } else {
      const titleEl = hdr.createSpan({ cls: 'wcc-kanban-col-title', text: colKey });
      titleEl.createSpan({ cls: 'wcc-kanban-col-count', text: ` ${cards.length}` });
    }

    // ── Add card button ──
    if (!collapsed) {
      const addBtn = hdr.createEl('button', {
        cls: 'wcc-kanban-add',
        title: 'Add card',
        text: '+',
      });
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const body = col.querySelector<HTMLElement>('.wcc-kanban-col-body');
        if (body) this.showGhostCard(body, colKey, subgroupKey);
      });
    }

    // ── Kebab ──
    const kebab = hdr.createEl('button', { cls: 'wcc-kanban-kebab', title: 'Options' });
    kebab.textContent = '⋮';
    kebab.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = new Menu();
      const curOrder = this.getColumnOrder();
      const idx = curOrder.indexOf(colKey);

      if (!collapsed) {
        menu.addItem((i) =>
          i
            .setTitle('Move left')
            .setIcon('arrow-left')
            .onClick(async () => {
              if (idx <= 0) return;
              const o = [...curOrder];
              [o[idx - 1], o[idx]] = [o[idx], o[idx - 1]];
              await this.setColumnOrder(o);
            }),
        );
        menu.addItem((i) =>
          i
            .setTitle('Move right')
            .setIcon('arrow-right')
            .onClick(async () => {
              if (idx === -1 || idx >= curOrder.length - 1) return;
              const o = [...curOrder];
              [o[idx], o[idx + 1]] = [o[idx + 1], o[idx]];
              await this.setColumnOrder(o);
            }),
        );
        menu.addSeparator();
      }

      menu.addItem((i) =>
        i
          .setTitle('Set color…')
          .setIcon('palette')
          .onClick(() => {
            const picker = this.wrap.ownerDocument.body.createEl('input');
            picker.type = 'color';
            picker.value = color ?? '#3b82f6';
            picker.addClass('wcc-color-picker');
            this.wrap.ownerDocument.body.appendChild(picker);
            const t = this.win.setTimeout(() => picker.remove(), 60000);
            picker.addEventListener('change', () => {
              this.win.clearTimeout(t);
              this.setColumnColor(colKey, picker.value);
              picker.remove();
            });
            picker.click();
          }),
      );
      if (color) {
        menu.addItem((i) =>
          i
            .setTitle('Clear color')
            .setIcon('x')
            .onClick(() => {
              this.clearColumnColor(colKey);
            }),
        );
      }
      menu.addSeparator();

      menu.addItem((i) =>
        i
          .setTitle('Hide column')
          .setIcon('eye-off')
          .onClick(async () => {
            await this.hideColumn(colKey);
          }),
      );
      menu.showAtMouseEvent(e);
    });

    if (collapsed) {
      // Keep a visible drop area even when cards are collapsed.
      col.createDiv('wcc-kanban-col-body wcc-kanban-col-body-collapsed');
    } else {
      const body = col.createDiv('wcc-kanban-col-body');
      for (const card of cards) {
        this.renderCard(body, card, bucketKey, donePid);
      }

      // Apply card border in 'both' mode
      if (color && colorMode === 'both') {
        for (const cardEl of Array.from(body.querySelectorAll<HTMLElement>('.wcc-kanban-card'))) {
          if (!cardEl.dataset.caCardColor)
            cardEl.setCssStyles({ borderLeft: `3px solid ${color}` });
        }
      }

      // Restore an in-progress ghost card after a re-render
      if (
        this.pendingGhost &&
        this.pendingGhost.colKey === colKey &&
        this.pendingGhost.subgroupKey === subgroupKey
      ) {
        this.showGhostCard(body, colKey, subgroupKey, this.pendingGhost.text);
      }
    }
  }

  private renderCard(
    container: HTMLElement,
    card: KanbanCard,
    _bucketKey: string,
    donePid: BasesPropertyId | null,
  ) {
    const el = container.createDiv('wcc-kanban-card' + (card.done ? ' wcc-kanban-card-done' : ''));
    el.dataset.cardId = card.id;
    const cardColor = propertyColor(this.config, card.entry);
    if (cardColor) {
      el.dataset.caCardColor = cardColor;
      el.setCssStyles({ borderLeft: `3px solid ${cardColor}` });
      el.setCssStyles({
        background: `color-mix(in srgb, ${cardColor} 12%, var(--background-primary))`,
      });
    }

    // Cover image banner
    const coverPid = viewProperty(this.config, 'coverImageProperty');
    if (coverPid) {
      let coverVal: Value | null = card.entry.getValue(coverPid);
      if (coverVal instanceof ListValue) coverVal = coverVal.length() ? coverVal.get(0) : null;
      if (coverVal && !(coverVal instanceof NullValue)) {
        const url = this.resolveImageUrl(coverVal.toString(), card.file.path);
        if (url) {
          const cover = el.createDiv('wcc-kanban-card-cover');
          const img = cover.createEl('img');
          img.src = url;
          img.addEventListener('error', () => cover.remove());
        }
      }
    }

    const titleRow = el.createDiv('wcc-kanban-card-title');
    dragGrip(titleRow, `Drag ${card.title} to move or reorder`);

    // Completion controls share the same keyboard and save/error behavior.
    if (donePid && parsePropertyId(donePid).type === 'note') {
      const cb = titleRow.createEl('button', {
        cls: 'wcc-kanban-check' + (card.done ? ' wcc-kanban-check-on' : ''),
        attr: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(card.done),
          'aria-label': `Mark ${card.title} ${card.done ? 'incomplete' : 'complete'}`,
        },
      });
      colorCheckbox(cb, this.config, card.entry);
      cb.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        cb.disabled = true;
        try {
          const value = !card.done;
          await writeProp(this.app, card.file, donePid, value);
          card.done = value;
          el.toggleClass('wcc-kanban-card-done', value);
          cb.toggleClass('wcc-kanban-check-on', value);
          cb.setAttribute('aria-checked', String(value));
          cb.setAttribute('aria-label', `Mark ${card.title} ${value ? 'incomplete' : 'complete'}`);
        } catch (error) {
          console.error(error);
          new Notice('Failed to update completion');
        } finally {
          cb.disabled = false;
        }
      };
    }

    const link = titleRow.createEl('a', {
      text: card.title,
      cls: 'wcc-kanban-card-link internal-link',
      href: '#',
    });
    link.draggable = false;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
      void leaf?.openFile(card.file);
    });
    link.addEventListener('mouseover', (e) => {
      this.app.workspace.trigger('hover-link', {
        event: e,
        source: 'bases',
        hoverParent: this,
        targetEl: el,
        linktext: card.file.path,
      });
    });

    el.addEventListener('click', (e) => {
      if (
        (e.target as HTMLElement).closest(
          'a, button, input, textarea, select, .wcc-kanban-card-props, .wcc-kanban-check',
        )
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
      void leaf?.openFile(card.file);
    });

    // Middle-click opens in a new tab, like a normal Obsidian link
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    el.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      void this.app.workspace.getLeaf('tab').openFile(card.file);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCardMenu(e, card);
    });

    const propOrder = this.config.getOrder();
    if (propOrder.length) {
      const props = el.createDiv('wcc-kanban-card-props');
      for (const pid of propOrder) {
        const { type } = parsePropertyId(pid);
        if (pid === 'file.name') continue;
        if (donePid && pid === donePid) continue;
        if (
          statusProperty(this.config) &&
          (pid === statusProperty(this.config) ||
            pid === (viewProperty(this.config, 'doneProperty') ?? 'note.done'))
        )
          continue;
        if (coverPid && pid === coverPid) continue;
        const val = card.entry.getValue(pid);
        if ((!val || val instanceof NullValue) && type !== 'note') continue;
        const row = props.createDiv('wcc-kanban-prop-row');
        row.createSpan({
          cls: 'wcc-kanban-prop-label',
          text: this.config.getDisplayName(pid) + ': ',
        });
        this.renderPropVal(row, val ?? new NullValue(), card, pid);
      }
      this.cardDetails.render(titleRow, el, props, card.title, card.id, 'wcc-kanban', this.config);
    }
  }

  private renderPropVal(parent: HTMLElement, val: Value, card: KanbanCard, pid: BasesPropertyId) {
    new PropertyFieldRenderer(this, 'wcc-kanban').render(parent, val, card, pid);
  }

  private showCardMenu(e: MouseEvent, card: KanbanCard) {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle('Open in new tab')
        .setIcon('file-plus')
        .onClick(() => {
          void this.app.workspace.getLeaf('tab').openFile(card.file);
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle('Open to the right')
        .setIcon('separator-vertical')
        .onClick(() => {
          void this.app.workspace.getLeaf('split').openFile(card.file);
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle('Reveal in file explorer')
        .setIcon('folder-open')
        .onClick(() => {
          this.app.workspace.trigger('file-menu', card.file, e);
        }),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle('Delete')
        .setIcon('trash')
        .setWarning(true)
        .onClick(async () => {
          await this.app.fileManager.trashFile(card.file);
          new Notice(`Trashed "${card.title}"`);
        }),
    );
    menu.showAtMouseEvent(e);
  }

  // ── Drag persistence ────────────────────────────────────────────────────
  private clearKanbanDrop() {
    this.dropContainer?.classList.remove('wcc-drop-target');
    this.dropContainer = null;
    this.dropBefore = null;
    this.dropIndicator.hide();
  }

  private updateKanbanDrop(item: HTMLElement, point: DragPoint) {
    this.clearKanbanDrop();
    const hit = this.wrap.ownerDocument.elementFromPoint(point.x, point.y);
    if (!hit || !this.wrap.contains(hit)) return;
    const isColumn = item.classList.contains('wcc-kanban-col');
    if (isColumn) {
      const board = hit.closest<HTMLElement>('.wcc-kanban-board');
      if (!board || board !== item.parentElement) return;
      const cols = Array.from(
        board.querySelectorAll<HTMLElement>(':scope > .wcc-kanban-col'),
      ).filter((col) => col !== item);
      const before =
        cols.find(
          (col) =>
            point.x < col.getBoundingClientRect().left + col.getBoundingClientRect().width / 2,
        ) ?? null;
      this.dropContainer = board;
      this.dropBefore = before?.dataset.colKey ?? null;
      this.dropIndicator.show(
        board,
        before,
        cols[cols.length - 1] ?? null,
        before ? `Before ${before.dataset.colKey}` : 'Last column',
        true,
      );
    } else {
      const col = hit.closest<HTMLElement>('.wcc-kanban-col');
      const body = col?.querySelector<HTMLElement>('.wcc-kanban-col-body');
      if (!body) return;
      this.dropContainer = body;
      body.classList.add('wcc-drop-target');
      const cards = Array.from(
        body.querySelectorAll<HTMLElement>(':scope > .wcc-kanban-card:not(.wcc-kanban-ghost-card)'),
      );
      const before = beforeAt(cards, point.y, item.dataset.cardId!, 'cardId');
      this.dropBefore = before?.dataset.cardId ?? null;
      const remaining = cards.filter((card) => card !== item);
      this.dropIndicator.show(
        body,
        before,
        remaining[remaining.length - 1] ?? null,
        `${col!.dataset.colKey} · ${before ? 'Before ' + before.querySelector('a')?.textContent : 'At end'}`,
      );
    }
  }

  private async commitKanbanDrop(item: HTMLElement) {
    const target = this.dropContainer;
    if (!target) return;
    if (item.classList.contains('wcc-kanban-col')) {
      const key = item.dataset.colKey!;
      const order = this.getColumnOrder().filter((value) => value !== key);
      if (this.dropBefore) {
        await this.setColumnOrder(moveBefore(order, key, this.dropBefore));
      } else {
        const visible = Array.from(
          target.querySelectorAll<HTMLElement>(':scope > .wcc-kanban-col'),
        ).filter((col) => col !== item);
        const previous = visible[visible.length - 1]?.dataset.colKey;
        const idx = previous ? order.indexOf(previous) + 1 : order.length;
        order.splice(idx, 0, key);
        await this.setColumnOrder(order);
      }
      return;
    }
    const card = this.dragCards.find((value) => value.id === item.dataset.cardId);
    const col = target.closest<HTMLElement>('.wcc-kanban-col');
    if (!card || !col) return;
    const column = col.dataset.colKey ?? NULL_KEY;
    const subgroup = col.dataset.subgroupKey ?? '';
    const sourceBucket = `${card.subgroupKey}||${card.columnKey}`;
    const targetBucket = `${subgroup}||${column}`;
    const ids = this.sortCardsInColumn(
      this.dragCards.filter(
        (value) => value.columnKey === column && value.subgroupKey === subgroup,
      ),
      targetBucket,
    ).map((value) => value.id);
    const order = moveBefore(ids, card.id, this.dropBefore);
    if (sourceBucket === targetBucket && order.join('\n') === ids.join('\n')) return;
    if (sourceBucket !== targetBucket) {
      await this.moveCard(card.id, column, subgroup, card.subgroupKey);
    }
    const sortProp = this.getSortOrderProp();
    if (sortProp) {
      for (let i = 0; i < order.length; i++) {
        const file = this.app.vault.getFileByPath(order[i]);
        if (file) await writeProp(this.app, file, sortProp, i * 10);
      }
    }
    const saved = this.getManualCardOrder();
    saved[targetBucket] = order;
    if (sourceBucket !== targetBucket)
      saved[sourceBucket] = this.sortCardsInColumn(
        this.dragCards.filter(
          (value) =>
            value.columnKey === card.columnKey &&
            value.subgroupKey === card.subgroupKey &&
            value.id !== card.id,
        ),
        sourceBucket,
      ).map((value) => value.id);
    await this.setManualCardOrder(saved);
  }

  // ── inline card creation ────────────────────────────────────────────────

  private showGhostCard(body: HTMLElement, colKey: string, subgroupKey: string, initialText = '') {
    // Only one ghost at a time across the whole board
    this.wrap.querySelectorAll('.wcc-kanban-ghost-card').forEach((el) => el.remove());
    this.pendingGhost = { colKey, subgroupKey, text: initialText };

    const ghost = body.createDiv('wcc-kanban-card wcc-kanban-ghost-card');
    const input = ghost.createEl('input', {
      cls: 'wcc-kanban-ghost-input',
      type: 'text',
      placeholder: 'Note title…',
    });
    input.value = initialText;
    // Mirror text so a mid-typing re-render can restore the ghost
    input.addEventListener('input', () => {
      if (this.pendingGhost) this.pendingGhost.text = input.value;
    });

    let settled = false;
    const cancel = () => {
      if (settled) return;
      settled = true;
      this.pendingGhost = null;
      ghost.remove();
    };
    const commit = async () => {
      if (settled) return;
      const title = input.value.trim();
      if (!title) {
        cancel();
        return;
      }
      settled = true;
      this.pendingGhost = null;
      ghost.remove();
      await this.commitGhost(colKey, subgroupKey, title);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', () => void commit());

    ghost.scrollIntoView({ block: 'nearest' });
    input.focus();
  }

  private async commitGhost(colKey: string, subgroupKey: string, title: string) {
    const properties = groupDefaults(this, this.getGroupByPropId(), colKey);
    const subgroupPid = viewProperty(this.config, 'subgroupProperty');
    if (subgroupKey) Object.assign(properties, groupDefaults(this, subgroupPid, subgroupKey));
    await createViewNote(this, title, properties);
  }

  private async moveCard(
    cardId: string,
    newColKey: string,
    newSubgroupKey: string,
    srcSubgroupKey: string,
  ) {
    const group = this.getGroupByPropId();
    if (!group || parsePropertyId(group).type !== 'note')
      throw new Error('Choose a note property for Group By to move between columns.');
    const subgroup = viewProperty(this.config, 'subgroupProperty');
    if (
      newSubgroupKey !== srcSubgroupKey &&
      (!subgroup || parsePropertyId(subgroup).type !== 'note')
    )
      throw new Error('Choose a note property for subgroups to move between swimlanes.');
    const file = this.app.vault.getFileByPath(cardId);
    if (!file) throw new Error('The note no longer exists.');
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm[parsePropertyId(group).name] = newColKey === NULL_KEY ? null : newColKey;
      if (newSubgroupKey !== srcSubgroupKey && subgroup)
        fm[parsePropertyId(subgroup).name] = newSubgroupKey === NULL_KEY ? null : newSubgroupKey;
    });
  }
}
