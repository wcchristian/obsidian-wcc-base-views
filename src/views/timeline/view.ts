import { viewHelp } from '../../shared/view-help';
import { CardDetails } from '../../shared/card-details';
import {
  checkboxProperty,
  renderStatus,
  viewGroups,
  groupArrow,
  statusChoices,
  statusProperty,
  groupProperty,
  isCollapsed,
} from '../../shared/status';
import { setIcon } from 'obsidian';
import type { ZoomLevel, TimelineItem } from './model';
import { createBackground } from '../../shared/background';
import { DatePromptModal } from '../../shared/date-prompt';
import { viewProperty } from '../../shared/view-properties';
import { PropertyFieldRenderer } from '../../shared/property-field';
import { numericOrder } from '../../shared/list-properties';
import { createViewNote } from '../../shared/view-create';
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
import type { DragPoint } from '../../shared/drag';
import { PointerDrag, DropIndicator, rememberScroll, dragGrip } from '../../shared/drag';
import { calendarDay, shiftDays, dateKey } from '../../shared/drag-dates';

export const VIEW_TYPE_BASE_TIMELINE = 'wcc-timeline';

const DEFAULT_LABEL_WIDTH = 200;
const ROW_HEIGHT = 36;
const GROUP_ROW_HEIGHT = 30;
const BAR_HEIGHT = 22;
const MONTH_STRIP_H = 20;
const COL_STRIP_H = 28;
const HEADER_HEIGHT = MONTH_STRIP_H + COL_STRIP_H;
const COL_WIDTHS = { day: 30, week: 80, month: 60 } as const;
const NAV_SHIFTS_DAYS = { day: 14, week: 28, month: 91 } as const;

export class BaseTimelineView extends BasesView implements HoverParent {
  readonly type = VIEW_TYPE_BASE_TIMELINE;
  hoverPopover: HoverPopover | null = null;

  private wrap: HTMLElement;
  private scrollEl: HTMLElement | null = null;
  private barsLayerEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private zoomBtns: Record<ZoomLevel, HTMLElement> | null = null;

  private dateProp: BasesPropertyId | null = null;
  private endProp: BasesPropertyId | null = null;
  private cardDetails = new CardDetails();
  private doneProp: BasesPropertyId | null = null;
  private subtitleProp: BasesPropertyId | null = null;
  private sortOrderProp: BasesPropertyId | null = null;
  private zoomLevel: ZoomLevel = 'week';
  private configuredZoom: ZoomLevel | null = null;
  private labelWidth = DEFAULT_LABEL_WIDTH;

  private daysVisible = 30;
  private weeksVisible = 12;
  private monthsVisible = 6;

  private prevDaysVisible = 30;
  private prevWeeksVisible = 12;
  private prevMonthsVisible = 6;

  private windowStart: Date | null = null;
  private windowEnd: Date | null = null;
  private cols: Date[] = [];

  private items: TimelineItem[] = [];
  private rowYMap = new Map<string, number>();
  private rowHeightMap = new Map<string, number>();
  private rowObserver: ResizeObserver;
  private paneObserver: ResizeObserver;
  private mobileLayout = false;

  private pointerDrag: PointerDrag;
  private dropIndicator: DropIndicator;
  private dragging = false;
  private dragState: {
    item: TimelineItem;
    bar: HTMLElement;
    mode: 'move' | 'resize-left' | 'resize-right';
    start: Date;
    end: Date;
    scrollLeft: number;
    nextStart: Date;
    nextEnd: Date;
  } | null = null;

  constructor(ctrl: QueryController, parent: HTMLElement, _plugin: BaseViewsPlugin) {
    super(ctrl);
    this.wrap = parent.createDiv('wcc-timeline-wrap');
    this.rowObserver = new ResizeObserver(() => this.reflowRows());
    this.paneObserver = new ResizeObserver(() => {
      if (!this.config || this.dragging || !this.barsLayerEl?.isConnected || !this.scrollEl) return;
      const compact = this.useCompactLayout();
      this.wrap.setCssProps({ ['--wcc-timeline-pane-width']: `${this.scrollEl.clientWidth}px` });
      if (compact !== this.mobileLayout) {
        const restore = rememberScroll(this.wrap, ['.wcc-timeline-scroll']);
        this.scrollEl.empty();
        this.buildContent(this.scrollEl);
        restore();
      } else this.reflowRows();
    });
    this.paneObserver.observe(this.wrap);
    this.dropIndicator = new DropIndicator(this.wrap);
    this.pointerDrag = new PointerDrag(this.wrap, {
      items: '.wcc-timeline-bar, .wcc-timeline-row-label',
      wholeItem: '.wcc-timeline-bar, .wcc-timeline-row-label',
      ignore:
        'a, button, input, textarea, .wcc-timeline-bar-check, .wcc-timeline-row-props, .wcc-timeline-row-subtitle',
      preview: false,
      onStart: (bar, event) => this.startTimelineDrag(bar, event),
      onMove: (_bar, point) => this.updateTimelineDrag(point),
      onDrop: async (_bar, point) => {
        this.updateTimelineDrag(point);
        await this.commitTimelineDrag(point);
      },
      onEnd: () => {
        this.dragging = false;
        this.dragState = null;
        this.dropIndicator.hide();
        void this.onDataUpdated();
      },
      onError: (error) => {
        console.error(error);
        new Notice('Failed to save timeline dates. The timeline has been refreshed.');
      },
    });
  }

  onDataUpdated(): void {
    if (this.dragging) return;
    applyItemPadding(this.wrap, this.config);
    const width = this.config.get('labelWidth');
    this.setLabelWidth(
      typeof width === 'number' && Number.isFinite(width) ? width : DEFAULT_LABEL_WIDTH,
    );
    const restoreScroll = rememberScroll(this.wrap, ['.wcc-timeline-scroll']);
    this.dateProp = viewProperty(this.config, 'dateProperty') ?? null;
    this.endProp = viewProperty(this.config, 'endDateProperty') ?? null;
    this.doneProp = checkboxProperty(this.config);
    this.subtitleProp = viewProperty(this.config, 'subtitleProperty') ?? null;
    this.sortOrderProp = viewProperty(this.config, 'sortOrderProperty') ?? null;

    const cfgZoom = this.config.get('zoomLevel');
    const defaultZoom: ZoomLevel = cfgZoom === 'day' || cfgZoom === 'month' ? cfgZoom : 'week';
    if (this.configuredZoom !== defaultZoom) {
      this.configuredZoom = defaultZoom;
      this.zoomLevel = defaultZoom;
      this.windowStart = null;
      this.windowEnd = null;
    }

    const dv = this.config.get('daysVisible');
    if (typeof dv === 'number' && dv >= 1) this.daysVisible = Math.floor(dv);
    const wv = this.config.get('weeksVisible');
    if (typeof wv === 'number' && wv >= 1) this.weeksVisible = Math.floor(wv);
    const mv = this.config.get('monthsVisible');
    if (typeof mv === 'number' && mv >= 1) this.monthsVisible = Math.floor(mv);

    // Invalidate cached window when the active zoom's range changes
    if (
      this.daysVisible !== this.prevDaysVisible ||
      this.weeksVisible !== this.prevWeeksVisible ||
      this.monthsVisible !== this.prevMonthsVisible
    ) {
      this.windowStart = null;
      this.windowEnd = null;
      this.prevDaysVisible = this.daysVisible;
      this.prevWeeksVisible = this.weeksVisible;
      this.prevMonthsVisible = this.monthsVisible;
    }

    this.wrap.empty();
    this.buildUI(this.wrap);
    restoreScroll();
  }

  private buildUI(container: HTMLElement) {
    createBackground(container, this.app, this.config, 'wcc-timeline-bg-layer');

    this.renderToolbar(container);

    const scroll = container.createDiv('wcc-timeline-scroll');
    this.scrollEl = scroll;

    this.loadItems();
    if (!this.windowStart || !this.windowEnd) this.computeWindow();
    this.buildContent(scroll);
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  private renderToolbar(container: HTMLElement) {
    const toolbar = container.createDiv('wcc-timeline-toolbar');
    viewHelp(this.app, toolbar, 'timeline');

    const nav = toolbar.createDiv('wcc-timeline-nav');
    const prev = nav.createEl('button', {
      cls: 'wcc-timeline-btn',
      attr: { 'aria-label': 'Previous period', title: 'Previous period' },
    });
    setIcon(prev, 'chevron-left');
    const todayBtn = nav.createEl('button', { text: 'Today', cls: 'wcc-timeline-today' });
    const next = nav.createEl('button', {
      cls: 'wcc-timeline-btn',
      attr: { 'aria-label': 'Next period', title: 'Next period' },
    });
    setIcon(next, 'chevron-right');

    this.titleEl = toolbar.createSpan({ cls: 'wcc-timeline-title' });

    const zoomGroup = toolbar.createDiv({
      cls: 'wcc-timeline-zoom-group',
      attr: { role: 'group', 'aria-label': 'Timeline zoom' },
    });
    const zDay = zoomGroup.createEl('button', { text: 'Day', cls: 'wcc-timeline-zoom' });
    const zWeek = zoomGroup.createEl('button', { text: 'Week', cls: 'wcc-timeline-zoom' });
    const zMonth = zoomGroup.createEl('button', { text: 'Month', cls: 'wcc-timeline-zoom' });
    this.zoomBtns = { day: zDay, week: zWeek, month: zMonth };

    const addBtn = toolbar.createEl('button', {
      cls: 'wcc-timeline-add-btn',
      title: 'Add new note',
      text: '+',
    });
    addBtn.addEventListener('click', () => {
      void this.createTimelineNote();
    });

    const setZoom = (z: ZoomLevel) => {
      this.zoomLevel = z;
      this.configuredZoom = z;
      this.config.set('zoomLevel', z);
      this.windowStart = null;
      this.windowEnd = null;
      this.wrap.empty();
      this.buildUI(this.wrap);
    };
    zDay.onclick = () => setZoom('day');
    zWeek.onclick = () => setZoom('week');
    zMonth.onclick = () => setZoom('month');

    const shift = (dir: 1 | -1) => {
      if (!this.windowStart || !this.windowEnd || !this.scrollEl) return;
      const days = NAV_SHIFTS_DAYS[this.zoomLevel] * dir;
      this.windowStart = shiftDays(this.windowStart, days);
      this.windowEnd = shiftDays(this.windowEnd, days);
      this.normalizeWindowBoundaries();
      this.cols = this.buildCols();
      this.scrollEl.empty();
      this.barsLayerEl = null;
      this.buildContent(this.scrollEl);
    };
    prev.onclick = () => shift(-1);
    next.onclick = () => shift(1);

    todayBtn.onclick = () => {
      this.windowStart = null;
      this.windowEnd = null;
      this.wrap.empty();
      this.buildUI(this.wrap);
    };
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  private loadItems() {
    this.items = [];
    const groups = viewGroups(this);
    if (!groups?.length || !this.dateProp) return;

    for (const group of groups) {
      const gKey = group.hasKey() && group.key ? group.key.toString() : '';

      for (const entry of group.entries) {
        const file = entry.file;
        if (!(file instanceof TFile)) continue;

        const val = entry.getValue(this.dateProp);
        if (!val || val instanceof NullValue) continue;

        const sd = new Date(val.toString() + 'T00:00:00');
        if (isNaN(sd.getTime())) continue;
        sd.setHours(0, 0, 0, 0);

        let ed: Date = new Date(sd);
        let isSingleDay = true;
        if (this.endProp) {
          const ev2 = entry.getValue(this.endProp);
          if (ev2 && !(ev2 instanceof NullValue)) {
            const d2 = new Date(ev2.toString() + 'T00:00:00');
            if (!isNaN(d2.getTime())) {
              d2.setHours(0, 0, 0, 0);
              if (d2.getTime() >= sd.getTime()) {
                ed = d2;
                isSingleDay = false;
              }
            }
          }
        }

        let done = false;
        if (this.doneProp) {
          const dv = entry.getValue(this.doneProp);
          if (dv instanceof BooleanValue) done = dv.isTruthy();
        }

        let subtitle = '';
        if (this.subtitleProp) {
          const sv = entry.getValue(this.subtitleProp);
          if (sv && !(sv instanceof NullValue)) subtitle = sv.toString();
        }

        let sortOrder = Infinity;
        if (this.sortOrderProp) {
          const sv = entry.getValue(this.sortOrderProp);
          sortOrder = numericOrder(sv?.toString());
        }

        this.items.push({
          id: file.path,
          title: file.basename,
          subtitle,
          start: sd,
          end: ed,
          isSingleDay,
          done,
          color: this.getItemColor(entry),
          groupKey: gKey,
          sortOrder,
          file,
          entry,
        });
      }
    }
  }

  private getItemColor(entry: BasesEntry): string | null {
    return propertyColor(this.config, entry);
  }

  // ── Window / column math ───────────────────────────────────────────────────

  private computeWindow() {
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    for (const item of this.items) {
      if (!minStart || item.start < minStart) minStart = new Date(item.start);
      if (!maxEnd || item.end > maxEnd) maxEnd = new Date(item.end);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const padDays = { day: 7, week: 28, month: 60 } as const;

    if (!minStart || !maxEnd) {
      // Use configured visible range, starting from today
      const configuredDays = this.getConfiguredDays();
      minStart = new Date(today);
      maxEnd = shiftDays(today, configuredDays);
    } else {
      // Use max of data range and configured range
      const configuredDays = this.getConfiguredDays();
      const pad = padDays[this.zoomLevel];
      const dataMin = shiftDays(minStart, -pad);
      const dataMax = shiftDays(maxEnd, pad);
      const cfgMin = new Date(today);
      const cfgMax = shiftDays(today, configuredDays);
      minStart = dataMin < cfgMin ? dataMin : cfgMin;
      maxEnd = dataMax > cfgMax ? dataMax : cfgMax;
    }

    this.windowStart = minStart;
    this.windowEnd = maxEnd;
    this.normalizeWindowBoundaries();
    this.cols = this.buildCols();
  }

  private getConfiguredDays(): number {
    switch (this.zoomLevel) {
      case 'day':
        return this.daysVisible;
      case 'week':
        return this.weeksVisible * 7;
      case 'month':
        return this.monthsVisible * 30;
    }
  }

  private normalizeWindowBoundaries() {
    if (!this.windowStart) return;
    if (this.zoomLevel === 'week') {
      const dow = this.windowStart.getDay();
      const back = dow === 0 ? 6 : dow - 1;
      this.windowStart = shiftDays(this.windowStart, -back);
    } else if (this.zoomLevel === 'month') {
      this.windowStart = new Date(this.windowStart.getFullYear(), this.windowStart.getMonth(), 1);
    }
  }

  private buildCols(): Date[] {
    if (!this.windowStart || !this.windowEnd) return [];
    const cols: Date[] = [];
    if (this.zoomLevel === 'day') {
      let d = new Date(this.windowStart);
      while (d <= this.windowEnd) {
        cols.push(new Date(d));
        d = shiftDays(d, 1);
      }
    } else if (this.zoomLevel === 'week') {
      let d = new Date(this.windowStart);
      while (d <= this.windowEnd) {
        cols.push(new Date(d));
        d = shiftDays(d, 7);
      }
    } else {
      let yr = this.windowStart.getFullYear(),
        mo = this.windowStart.getMonth();
      const endYr = this.windowEnd.getFullYear(),
        endMo = this.windowEnd.getMonth();
      while (yr < endYr || (yr === endYr && mo <= endMo)) {
        cols.push(new Date(yr, mo, 1));
        mo++;
        if (mo > 11) {
          mo = 0;
          yr++;
        }
      }
    }
    return cols;
  }

  private getColWidth(): number {
    return this.mobileLayout
      ? { day: 44, week: 96, month: 100 }[this.zoomLevel]
      : COL_WIDTHS[this.zoomLevel];
  }

  private useCompactLayout(): boolean {
    const width = this.wrap.clientWidth;
    return this.config.get('mobileLayout') !== false && width > 0 && width <= 700;
  }

  private getBarTop(rowY: number, height: number): number {
    return (
      rowY - HEADER_HEIGHT + (this.mobileLayout ? height - 64 + 14 : (height - BAR_HEIGHT) / 2)
    );
  }

  private dateToColFraction(d: Date): number {
    if (!this.windowStart) return 0;
    if (this.zoomLevel === 'day') return calendarDay(d) - calendarDay(this.windowStart);
    if (this.zoomLevel === 'week') return (calendarDay(d) - calendarDay(this.windowStart)) / 7;
    const yr0 = this.windowStart.getFullYear(),
      mo0 = this.windowStart.getMonth();
    const yr1 = d.getFullYear(),
      mo1 = d.getMonth();
    const monthIdx = (yr1 - yr0) * 12 + (mo1 - mo0);
    const daysInMonth = new Date(yr1, mo1 + 1, 0).getDate();
    return monthIdx + (d.getDate() - 1) / daysInMonth;
  }

  private dateToPixel(d: Date): number {
    return this.dateToColFraction(d) * this.getColWidth();
  }

  private updateToolbarTitle() {
    if (!this.titleEl || !this.windowStart || !this.windowEnd) return;
    const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', opts);
    const s = fmt(this.windowStart, { month: 'short', year: 'numeric' });
    const e = fmt(this.windowEnd, { month: 'short', year: 'numeric' });
    this.titleEl.textContent = s === e ? s : `${s} — ${e}`;
    if (this.zoomBtns) {
      (Object.entries(this.zoomBtns) as [ZoomLevel, HTMLElement][]).forEach(([k, btn]) => {
        btn.toggleClass('wcc-timeline-zoom-active', k === this.zoomLevel);
        btn.setAttribute('aria-pressed', String(k === this.zoomLevel));
      });
    }
  }

  // ── DOM building ───────────────────────────────────────────────────────────

  private buildContent(scroll: HTMLElement) {
    this.rowObserver.disconnect();
    this.scrollEl = scroll;
    this.mobileLayout = this.useCompactLayout();
    this.wrap.toggleClass('wcc-timeline-mobile', this.mobileLayout);
    this.wrap.setCssProps({ ['--wcc-timeline-pane-width']: `${scroll.clientWidth}px` });
    this.wrap.setCssProps({
      ['--wcc-timeline-track-offset']: this.mobileLayout
        ? '0px'
        : 'var(--wcc-timeline-label-width, 200px)',
    });
    this.updateToolbarTitle();
    const cw = this.getColWidth();
    const colCount = this.cols.length;
    const totalWidth = (this.mobileLayout ? 0 : this.labelWidth) + colCount * cw;

    const content = scroll.createDiv('wcc-timeline-content');
    content.setCssStyles({
      minWidth: `calc(var(--wcc-timeline-track-offset, 200px) + ${colCount * cw}px)`,
    });

    this.renderHeader(content, cw, colCount);

    let rowY = HEADER_HEIGHT;
    this.rowYMap.clear();
    this.rowHeightMap.clear();

    const isGrouped = viewGroups(this).some((g) => g.hasKey());

    const sortItems = (arr: TimelineItem[]) =>
      this.sortOrderProp ? [...arr].sort((a, b) => a.sortOrder - b.sortOrder) : arr;

    if (isGrouped) {
      const order: string[] = [];
      const byGroup = new Map<string, TimelineItem[]>();
      for (const item of this.items) {
        const k = item.groupKey;
        if (!byGroup.has(k)) {
          byGroup.set(k, []);
          order.push(k);
        }
        byGroup.get(k)!.push(item);
      }
      if (
        statusProperty(this.config) &&
        groupProperty(this.config) === statusProperty(this.config)
      ) {
        for (const k of statusChoices(this))
          if (!byGroup.has(k)) {
            byGroup.set(k, []);
            order.push(k);
          }
      }
      for (const k of order) {
        rowY = this.renderSwimlaneHeader(content, k, rowY, totalWidth);
        if (isCollapsed(this.config, k)) continue;
        for (const item of sortItems(byGroup.get(k)!)) {
          rowY = this.renderItemRow(content, item, rowY, cw, colCount);
        }
      }
    } else {
      for (const item of sortItems(this.items)) {
        rowY = this.renderItemRow(content, item, rowY, cw, colCount);
      }
    }

    if (this.items.length === 0) {
      const empty = content.createDiv('wcc-timeline-empty');
      empty.textContent = this.dateProp
        ? 'No items with a start date found.'
        : 'Configure a start date property in the view settings.';
    }

    content.setCssStyles({ minHeight: `${rowY}px` });

    const barsLayer = content.createDiv('wcc-timeline-bars-layer');
    barsLayer.setCssStyles({ top: `${HEADER_HEIGHT}px` });
    barsLayer.setCssStyles({ height: `${Math.max(rowY - HEADER_HEIGHT, 0)}px` });
    this.barsLayerEl = barsLayer;

    this.renderTodayLine(barsLayer);
    this.renderBars(barsLayer);

    this.scrollToToday(scroll, cw);
  }

  private renderMobileDates(label: HTMLElement, item: TimelineItem) {
    const dates = label.createDiv('wcc-timeline-mobile-dates');
    const fields: HTMLInputElement[] = [];
    for (const [caption, pid, isEnd] of [
      ['Start', this.dateProp, false],
      ['End', this.endProp, true],
    ] as const) {
      if (!pid) continue;
      const field = dates.createEl('label', { cls: 'wcc-timeline-mobile-date' });
      field.createSpan({ text: caption });
      if (parsePropertyId(pid).type !== 'note') {
        field.createSpan({ text: dateKey(isEnd ? item.end : item.start) });
        continue;
      }
      const input = field.createEl('input', {
        type: 'date',
        attr: { 'aria-label': `${caption} date for ${item.title}` },
      });
      input.value = isEnd && item.isSingleDay ? '' : dateKey(isEnd ? item.end : item.start);
      input.dataset.timelineEnd = String(isEnd);
      fields.push(input);
      input.onchange = async () => {
        const value = input.value;
        if ((!value && !isEnd) || (value && !input.checkValidity())) {
          input.value = dateKey(isEnd ? item.end : item.start);
          return;
        }
        const date = value ? new Date(value + 'T00:00:00') : new Date(item.start);
        if (isNaN(date.getTime()) || (isEnd && date < item.start)) {
          input.value = dateKey(item.end);
          new Notice('End date must be on or after the start date.');
          return;
        }
        fields.forEach((field) => (field.disabled = true));
        try {
          const start = isEnd ? item.start : date;
          const end = isEnd ? date : item.end < date || item.isSingleDay ? date : item.end;
          await this.app.fileManager.processFrontMatter(
            item.file,
            (fm: Record<string, unknown>) => {
              fm[parsePropertyId(pid).name] = value || null;
              if (!isEnd && this.endProp && parsePropertyId(this.endProp).type === 'note') {
                const endName = parsePropertyId(this.endProp).name;
                if (fm[endName] != null && calendarDay(end) !== calendarDay(item.end))
                  fm[endName] = dateKey(end);
              }
            },
          );
          item.start = start;
          item.end = end;
          item.isSingleDay = !value || calendarDay(start) === calendarDay(end);
          const bar = Array.from(this.wrap.querySelectorAll<HTMLElement>('.wcc-timeline-bar')).find(
            (bar) => bar.dataset.itemId === item.id,
          );
          if (bar) this.updateBarPosition(bar, start, end);
          for (const field of fields)
            field.value =
              field.dataset.timelineEnd === 'true'
                ? item.isSingleDay
                  ? ''
                  : dateKey(end)
                : dateKey(start);
        } catch (error) {
          console.error(error);
          input.value = isEnd && item.isSingleDay ? '' : dateKey(isEnd ? item.end : item.start);
          new Notice('Failed to update timeline date.');
        } finally {
          fields.forEach((field) => (field.disabled = false));
        }
      };
    }
    const locate = dates.createEl('button', {
      cls: 'wcc-timeline-locate-range',
      text: 'Show range',
      attr: { type: 'button', 'aria-label': `Show ${item.title} on timeline` },
    });
    locate.onclick = () => {
      if (this.scrollEl) this.scrollEl.scrollLeft = Math.max(0, this.dateToPixel(item.start) - 24);
    };
  }

  private setLabelWidth(width: number) {
    this.labelWidth = Math.max(120, Math.min(600, Math.round(width)));
    this.wrap.setCssProps({ ['--wcc-timeline-label-width']: `${this.labelWidth}px` });
  }

  private renderLabelResize(corner: HTMLElement) {
    const divider = corner.createDiv({
      cls: 'wcc-timeline-label-resize',
      attr: {
        role: 'separator',
        tabindex: '0',
        'aria-label': 'Resize title column',
        'aria-orientation': 'vertical',
        'aria-valuemin': '120',
        'aria-valuemax': '600',
      },
    });
    divider.title = 'Drag to resize title column; arrow keys adjust width';
    const update = (width: number) => {
      this.setLabelWidth(width);
      divider.setAttribute('aria-valuenow', String(this.labelWidth));
    };
    update(this.labelWidth);
    let active: { id: number; x: number; width: number } | null = null;
    divider.onpointerdown = (event) => {
      if (event.button !== 0 || active || this.dragging) return;
      event.preventDefault();
      event.stopPropagation();
      active = { id: event.pointerId, x: event.clientX, width: this.labelWidth };
      divider.setPointerCapture(event.pointerId);
      divider.addClass('wcc-timeline-label-resizing');
    };
    divider.onpointermove = (event) => {
      if (!active || event.pointerId !== active.id) return;
      event.preventDefault();
      update(active.width + event.clientX - active.x);
    };
    const finish = (event: PointerEvent, cancel: boolean) => {
      if (!active || event.pointerId !== active.id) return;
      const initial = active.width;
      active = null;
      if (cancel) update(initial);
      else this.config.set('labelWidth', this.labelWidth);
      divider.removeClass('wcc-timeline-label-resizing');
      if (divider.hasPointerCapture(event.pointerId))
        divider.releasePointerCapture(event.pointerId);
    };
    divider.onpointerup = (event) => finish(event, false);
    divider.onpointercancel = (event) => finish(event, true);
    divider.onlostpointercapture = (event) => finish(event, true);
    divider.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      update(
        event.key === 'Home'
          ? DEFAULT_LABEL_WIDTH
          : this.labelWidth + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10),
      );
      this.config.set('labelWidth', this.labelWidth);
    };
  }

  private renderHeader(content: HTMLElement, cw: number, colCount: number) {
    const headerRow = content.createDiv('wcc-timeline-header-row');

    const corner = headerRow.createDiv('wcc-timeline-corner');
    corner.setCssStyles({
      width: 'var(--wcc-timeline-track-offset, var(--wcc-timeline-label-width, 200px))',
    });
    if (!this.mobileLayout) this.renderLabelResize(corner);

    const headerMain = headerRow.createDiv('wcc-timeline-header-main');
    headerMain.setCssStyles({ width: `${colCount * cw}px` });

    const monthStrip = headerMain.createDiv('wcc-timeline-month-strip');
    const colStrip = headerMain.createDiv('wcc-timeline-col-strip');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build month/year band segments
    interface Seg {
      label: string;
      colStart: number;
      colEnd: number;
    }
    const segs: Seg[] = [];
    let curLabel = '';
    let curStart = 0;

    for (let i = 0; i < this.cols.length; i++) {
      const col = this.cols[i];
      const label =
        this.zoomLevel === 'month'
          ? String(col.getFullYear())
          : col.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (label !== curLabel) {
        if (curLabel) segs.push({ label: curLabel, colStart: curStart, colEnd: i - 1 });
        curLabel = label;
        curStart = i;
      }
    }
    if (curLabel) segs.push({ label: curLabel, colStart: curStart, colEnd: this.cols.length - 1 });

    for (const seg of segs) {
      const el = monthStrip.createDiv('wcc-timeline-month-seg');
      el.setCssStyles({ width: `${(seg.colEnd - seg.colStart + 1) * cw}px` });
      el.textContent = seg.label;
    }

    // Column labels
    for (let i = 0; i < this.cols.length; i++) {
      const col = this.cols[i];
      const colHdr = colStrip.createDiv('wcc-timeline-col-hdr');
      colHdr.setCssStyles({ width: `${cw}px` });

      let label = '';
      let cls = '';
      if (this.zoomLevel === 'day') {
        label = String(col.getDate());
        const dow = col.getDay();
        if (dow === 0 || dow === 6) cls = 'wcc-timeline-col-weekend';
        if (dow === 1) cls = 'wcc-timeline-col-monday';
        if (col.getTime() === today.getTime()) cls = 'wcc-timeline-col-today';
      } else if (this.zoomLevel === 'week') {
        label = col.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const weekEnd = shiftDays(col, 6);
        if (today >= col && today <= weekEnd) cls = 'wcc-timeline-col-today';
      } else {
        label = col.toLocaleDateString(
          'en-US',
          col.getMonth() === 0 ? { month: 'short', year: 'numeric' } : { month: 'short' },
        );
        if (col.getFullYear() === today.getFullYear() && col.getMonth() === today.getMonth())
          cls = 'wcc-timeline-col-today';
      }

      colHdr.textContent = label;
      if (cls) colHdr.addClass(cls);
    }
  }

  private renderSwimlaneHeader(
    content: HTMLElement,
    label: string,
    rowY: number,
    _totalWidth: number,
  ): number {
    const hdr = content.createDiv('wcc-timeline-swimlane-hdr');
    groupArrow(this, hdr, label);
    hdr.createSpan({ cls: 'wcc-timeline-swimlane-label', text: label || '(no value)' });
    hdr.setCssStyles({ top: `${rowY}px` });
    hdr.setCssStyles({ width: '100%' });
    return rowY + GROUP_ROW_HEIGHT;
  }

  private renderItemRow(
    content: HTMLElement,
    item: TimelineItem,
    rowY: number,
    cw: number,
    colCount: number,
  ): number {
    this.rowYMap.set(item.id, rowY);

    const row = content.createDiv('wcc-timeline-row');
    row.setCssStyles({ top: `${rowY}px` });

    // Label cell (sticky left)
    const label = row.createDiv('wcc-timeline-row-label');
    label.setCssStyles({
      width: this.mobileLayout
        ? 'var(--wcc-timeline-pane-width)'
        : 'var(--wcc-timeline-label-width, 200px)',
    });
    label.dataset.itemId = item.id;

    const titleEl = label.createDiv('wcc-timeline-row-title');
    titleEl.textContent = item.title;
    titleEl.title = item.title;
    titleEl.tabIndex = 0;
    titleEl.setAttribute('role', 'link');
    titleEl.onclick = (event) =>
      this.app.workspace.getLeaf(Keymap.isModEvent(event))?.openFile(item.file);
    titleEl.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void this.app.workspace.getLeaf(Keymap.isModEvent(event))?.openFile(item.file);
      }
    };

    if (this.mobileLayout) this.renderMobileDates(label, item);

    if (
      item.subtitle ||
      (this.subtitleProp && parsePropertyId(this.subtitleProp).type === 'note')
    ) {
      const subEl = label.createDiv('wcc-timeline-row-subtitle');
      if (this.subtitleProp)
        this.renderPropVal(
          subEl,
          item.entry.getValue(this.subtitleProp) ?? new NullValue(),
          item,
          this.subtitleProp,
        );
      else subEl.textContent = item.subtitle;
      subEl.title = item.subtitle;
    }

    const props = label.createDiv('wcc-timeline-row-props');
    for (const pid of this.config.getOrder()) {
      if (
        pid === 'file.name' ||
        pid === this.doneProp ||
        pid === this.subtitleProp ||
        (this.mobileLayout && (pid === this.dateProp || pid === this.endProp))
      )
        continue;
      const value = item.entry.getValue(pid);
      if ((!value || value instanceof NullValue) && parsePropertyId(pid).type !== 'note') continue;
      const field = props.createDiv('wcc-timeline-prop-row');
      field.createSpan({
        cls: 'wcc-timeline-prop-label',
        text: this.config.getDisplayName(pid) + ': ',
      });
      this.renderPropVal(field, value ?? new NullValue(), item, pid);
    }

    this.cardDetails.render(label, row, props, item.title, item.id, 'wcc-timeline', this.config);

    // Track cells (one per column, for grid lines and shading)
    const track = row.createDiv('wcc-timeline-row-track');
    track.setCssStyles({ width: `${colCount * cw}px` });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < colCount; i++) {
      const col = this.cols[i];
      const cell = track.createDiv('wcc-timeline-row-cell');
      cell.setCssStyles({ width: `${cw}px` });
      if (this.zoomLevel === 'day') {
        const dow = col.getDay();
        if (dow === 0 || dow === 6) cell.addClass('wcc-timeline-cell-weekend');
        if (col.getTime() === today.getTime()) cell.addClass('wcc-timeline-cell-today');
      } else if (this.zoomLevel === 'week') {
        const weekEnd = shiftDays(col, 6);
        if (today >= col && today <= weekEnd) cell.addClass('wcc-timeline-cell-today');
      } else {
        if (col.getFullYear() === today.getFullYear() && col.getMonth() === today.getMonth())
          cell.addClass('wcc-timeline-cell-today');
      }
    }

    const rowHeight = this.mobileLayout
      ? Math.ceil(label.getBoundingClientRect().height) + 64
      : Math.max(ROW_HEIGHT, Math.ceil(label.getBoundingClientRect().height));
    row.setCssStyles({ height: `${rowHeight}px` });
    label.setCssProps({
      ['--wcc-timeline-label-height']: `${this.mobileLayout ? rowHeight - 64 : rowHeight}px`,
    });
    this.rowHeightMap.set(item.id, rowHeight);
    this.rowObserver.observe(label);
    return rowY + rowHeight;
  }

  /** Keep growing editors and wrapped properties within their own timeline row. */
  private reflowRows() {
    if (this.dragging || !this.barsLayerEl?.isConnected) return;
    const content = this.barsLayerEl.parentElement!;
    const bars = new Map(
      Array.from(this.barsLayerEl.querySelectorAll<HTMLElement>('.wcc-timeline-bar')).map((bar) => [
        bar.dataset.itemId,
        bar,
      ]),
    );
    let y = HEADER_HEIGHT;
    for (const row of Array.from(
      content.querySelectorAll<HTMLElement>(
        ':scope > .wcc-timeline-row, :scope > .wcc-timeline-swimlane-hdr',
      ),
    )) {
      row.setCssStyles({ top: `${y}px` });
      const label = row.querySelector<HTMLElement>('.wcc-timeline-row-label');
      const height = label
        ? this.mobileLayout
          ? Math.ceil(label.getBoundingClientRect().height) + 64
          : Math.max(ROW_HEIGHT, Math.ceil(label.getBoundingClientRect().height))
        : GROUP_ROW_HEIGHT;
      row.setCssStyles({ height: `${height}px` });
      label?.setCssProps({
        ['--wcc-timeline-label-height']: `${this.mobileLayout ? height - 64 : height}px`,
      });
      if (label?.dataset.itemId) {
        this.rowHeightMap.set(label.dataset.itemId, height);
        this.rowYMap.set(label.dataset.itemId, y);
        const bar = bars.get(label.dataset.itemId);
        if (bar) bar.setCssStyles({ top: `${this.getBarTop(y, height)}px` });
      }
      y += height;
    }
    content.setCssStyles({ minHeight: `${y}px` });
    this.barsLayerEl.setCssStyles({ height: `${Math.max(0, y - HEADER_HEIGHT)}px` });
  }

  private renderTodayLine(barsLayer: HTMLElement) {
    if (!this.windowStart || !this.windowEnd) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < this.windowStart || today > this.windowEnd) return;

    const line = barsLayer.createDiv('wcc-timeline-today-line');
    line.setCssStyles({ left: `${this.dateToPixel(today)}px` });
  }

  private renderBars(barsLayer: HTMLElement) {
    for (const item of this.items) {
      const rowY = this.rowYMap.get(item.id);
      if (rowY === undefined) continue;

      const rowHeight = this.rowHeightMap.get(item.id) ?? ROW_HEIGHT;
      const barTop = this.getBarTop(rowY, rowHeight);
      const cw = this.getColWidth();
      const left = this.dateToPixel(item.start);
      const endNext = shiftDays(item.end, 1);
      const width = Math.max(
        this.dateToPixel(endNext) - left,
        this.mobileLayout ? 44 : item.isSingleDay ? cw * 0.5 : 4,
      );

      const bar = barsLayer.createDiv('wcc-timeline-bar');
      bar.dataset.itemId = item.id;
      bar.setCssStyles({ left: `${left}px` });
      bar.setCssStyles({ width: `${width}px` });
      bar.setCssStyles({ top: `${barTop}px` });

      if (item.color) {
        bar.setCssStyles({
          background: `color-mix(in srgb, ${item.color} 35%, var(--background-primary))`,
        });
        bar.setCssStyles({ borderLeftColor: item.color });
      }
      if (item.done) bar.addClass('wcc-timeline-bar-done');

      // Left resize handle
      const handleL = bar.createDiv(
        'wcc-timeline-bar-handle wcc-timeline-bar-handle-left wcc-drag-grip',
      );
      handleL.setAttribute('aria-label', 'Drag to resize start date');
      handleL.title = 'Drag to resize start date';
      // Completion button keeps its state until the save succeeds.
      {
        const completionHost = this.mobileLayout
          ? (Array.from(this.wrap.querySelectorAll<HTMLElement>('.wcc-timeline-row-label')).find(
              (label) => label.dataset.itemId === item.id,
            ) ?? bar)
          : bar;
        if (!renderStatus(this, completionHost, item) && this.doneProp) {
          const cb = completionHost.createEl('button', {
            cls: 'wcc-timeline-bar-check' + (item.done ? ' wcc-timeline-bar-check-on' : ''),
            attr: {
              type: 'button',
              role: 'checkbox',
              'aria-checked': String(item.done),
              'aria-label': `Mark ${item.title} ${item.done ? 'incomplete' : 'complete'}`,
            },
          });
          colorCheckbox(cb, this.config, item.entry);
          cb.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            cb.disabled = true;
            try {
              const value = !item.done;
              await writeProp(this.app, item.file, this.doneProp!, value);
              item.done = value;
              bar.toggleClass('wcc-timeline-bar-done', value);
              cb.toggleClass('wcc-timeline-bar-check-on', value);
              cb.setAttribute('aria-checked', String(value));
              cb.setAttribute(
                'aria-label',
                `Mark ${item.title} ${value ? 'incomplete' : 'complete'}`,
              );
            } catch (error) {
              console.error(error);
              new Notice('Failed to update completion');
            } finally {
              cb.disabled = false;
            }
          };
        }
      }

      // Label
      dragGrip(bar, `Drag ${item.title} to move dates`);
      const labelEl = bar.createSpan({ cls: 'wcc-timeline-bar-label', text: item.title });
      labelEl.title = item.title;
      // Right resize handle
      const handleR = bar.createDiv(
        'wcc-timeline-bar-handle wcc-timeline-bar-handle-right wcc-drag-grip',
      );
      handleR.setAttribute('aria-label', 'Drag to resize end date');
      handleR.title = 'Drag to resize end date';

      bar.onclick = (event) => {
        if ((event.target as HTMLElement).closest('.wcc-drag-grip, .wcc-timeline-bar-check'))
          return;
        event.preventDefault();
        void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(item.file);
      };
      this.attachBarContextMenu(bar, item);
    }
  }

  // ── Bar drag & resize ──────────────────────────────────────────────────────

  private updateBarPosition(barEl: HTMLElement, start: Date, end: Date) {
    const left = this.dateToPixel(start);
    const endNext = shiftDays(end, 1);
    const width = Math.max(this.dateToPixel(endNext) - left, this.mobileLayout ? 44 : 4);
    barEl.setCssStyles({ left: `${left}px` });
    barEl.setCssStyles({ width: `${width}px` });
  }

  private startTimelineDrag(surface: HTMLElement, event: PointerEvent): boolean {
    const bar = surface.classList.contains('wcc-timeline-bar')
      ? surface
      : Array.from(this.wrap.querySelectorAll<HTMLElement>('.wcc-timeline-bar')).find(
          (el) => el.dataset.itemId === surface.dataset.itemId,
        );
    if (!bar) return false;
    const item = this.items.find((value) => value.id === bar.dataset.itemId);
    if (!item || !this.dateProp || parsePropertyId(this.dateProp).type !== 'note') return false;
    const target = event.target as HTMLElement;
    const mode = target.closest('.wcc-timeline-bar-handle-left')
      ? 'resize-left'
      : target.closest('.wcc-timeline-bar-handle-right')
        ? 'resize-right'
        : 'move';
    if (mode !== 'move' && (!this.endProp || parsePropertyId(this.endProp).type !== 'note')) {
      new Notice('Choose a note end-date property to resize a timeline item.');
      return false;
    }
    this.dragging = true;
    this.dragState = {
      item,
      bar,
      mode,
      start: new Date(item.start),
      end: new Date(item.end),
      scrollLeft: this.wrap.querySelector('.wcc-timeline-scroll')?.scrollLeft ?? 0,
      nextStart: new Date(item.start),
      nextEnd: new Date(item.end),
    };
    bar.classList.add(mode === 'move' ? 'wcc-timeline-bar-dragging' : 'wcc-timeline-bar-resizing');
    return true;
  }

  private shiftedTimelineDate(date: Date, deltaX: number): Date {
    const columns = deltaX / this.getColWidth();
    if (this.zoomLevel === 'month') {
      const shifted = new Date(date);
      const targetMonth = new Date(date.getFullYear(), date.getMonth() + Math.round(columns), 1);
      const last = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
      shifted.setDate(1);
      shifted.setFullYear(
        targetMonth.getFullYear(),
        targetMonth.getMonth(),
        Math.min(date.getDate(), last),
      );
      return shifted;
    }
    return shiftDays(date, Math.round(columns) * (this.zoomLevel === 'week' ? 7 : 1));
  }

  private updateTimelineDrag(point: DragPoint) {
    const state = this.dragState;
    if (!state) return;
    const scroll = this.wrap.querySelector('.wcc-timeline-scroll')?.scrollLeft ?? 0;
    const delta = point.x - point.startX + scroll - state.scrollLeft;
    const duration = calendarDay(state.end) - calendarDay(state.start);
    if (state.mode === 'move') {
      state.nextStart = this.shiftedTimelineDate(state.start, delta);
      state.nextEnd = shiftDays(state.nextStart, duration);
    } else if (state.mode === 'resize-left') {
      const date = this.shiftedTimelineDate(state.start, delta);
      state.nextStart = date > state.end ? new Date(state.end) : date;
    } else {
      const date = this.shiftedTimelineDate(state.end, delta);
      state.nextEnd = date < state.start ? new Date(state.start) : date;
    }
    this.updateBarPosition(state.bar, state.nextStart, state.nextEnd);
    const pane = this.wrap.querySelector<HTMLElement>('.wcc-timeline-scroll');
    const bounds = this.wrap.getBoundingClientRect();
    if (
      pane &&
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    ) {
      const fmt = (date: Date) =>
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this.dropIndicator.show(
        pane,
        state.mode === 'resize-right' ? null : state.bar,
        state.mode === 'resize-right' ? state.bar : null,
        `${fmt(state.nextStart)} – ${fmt(state.nextEnd)}`,
        true,
      );
    } else this.dropIndicator.hide();
  }

  private async commitTimelineDrag(point: DragPoint) {
    const state = this.dragState;
    if (!state || !this.dateProp) return;
    const rect = this.wrap.getBoundingClientRect();
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom)
      return;
    if (
      dateKey(state.nextStart) === dateKey(state.start) &&
      dateKey(state.nextEnd) === dateKey(state.end)
    )
      return;
    const dateName = parsePropertyId(this.dateProp).name;
    const endName =
      this.endProp && parsePropertyId(this.endProp).type === 'note'
        ? parsePropertyId(this.endProp).name
        : null;
    await this.app.fileManager.processFrontMatter(
      state.item.file,
      (fm: Record<string, unknown>) => {
        fm[dateName] = dateKey(state.nextStart);
        if (endName) fm[endName] = dateKey(state.nextEnd);
      },
    );
    state.item.start = state.nextStart;
    state.item.end = state.nextEnd;
    state.item.isSingleDay = calendarDay(state.nextStart) === calendarDay(state.nextEnd);
  }

  onunload() {
    this.pointerDrag.destroy();
    this.rowObserver.disconnect();
    this.paneObserver.disconnect();
    this.dropIndicator.destroy();
    super.onunload();
  }

  // ── Context menu ───────────────────────────────────────────────────────────

  private attachBarContextMenu(bar: HTMLElement, item: TimelineItem) {
    bar.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();

      menu.addItem((i) =>
        i
          .setTitle('Open')
          .setIcon('file-text')
          .onClick(() => this.app.workspace.getLeaf(false)?.openFile(item.file)),
      );
      menu.addItem((i) =>
        i
          .setTitle('Open in new tab')
          .setIcon('file-plus')
          .onClick(() => this.app.workspace.getLeaf(true)?.openFile(item.file)),
      );
      menu.addItem((i) =>
        i
          .setTitle('Open to the right')
          .setIcon('separator-vertical')
          .onClick(() => this.app.workspace.getLeaf('split')?.openFile(item.file)),
      );

      menu.addSeparator();

      menu.addItem((i) =>
        i
          .setTitle('Change start date…')
          .setIcon('calendar')
          .onClick(async () => {
            if (!this.dateProp) return;
            const modal = new DatePromptModal(this.app, item.start, 'Change start date');
            const newDate = await modal.prompt();
            if (!newDate || dateKey(newDate) === dateKey(item.start)) return;
            await writeProp(this.app, item.file, this.dateProp, dateKey(newDate));
            item.start = newDate;
            if (newDate > item.end) item.end = new Date(newDate);
            this.updateBarPosition(bar, item.start, item.end);
          }),
      );

      if (this.endProp) {
        menu.addItem((i) =>
          i
            .setTitle('Change end date…')
            .setIcon('calendar-range')
            .onClick(async () => {
              const modal = new DatePromptModal(this.app, item.end, 'Change end date');
              const newDate = await modal.prompt();
              if (!newDate || dateKey(newDate) === dateKey(item.end)) return;
              if (newDate >= item.start) {
                await writeProp(this.app, item.file, this.endProp!, dateKey(newDate));
                item.end = newDate;
                item.isSingleDay = item.start.getTime() === newDate.getTime();
                this.updateBarPosition(bar, item.start, item.end);
              }
            }),
        );
      }

      if (this.doneProp) {
        menu.addItem((i) =>
          i
            .setTitle(item.done ? 'Mark as not done' : 'Mark as done')
            .setIcon(item.done ? 'circle' : 'check-circle')
            .onClick(async () => {
              const newVal = !item.done;
              await writeProp(this.app, item.file, this.doneProp!, newVal);
              item.done = newVal;
              bar.toggleClass('wcc-timeline-bar-done', newVal);
              const cb = bar.querySelector('.wcc-timeline-bar-check');
              if (cb) cb.toggleClass('wcc-timeline-bar-check-on', newVal);
            }),
        );
      }

      menu.addSeparator();
      menu.addItem((i) =>
        i
          .setTitle('Delete')
          .setIcon('trash')
          .onClick(async () => {
            await this.app.fileManager.trashFile(item.file);
          }),
      );

      menu.showAtMouseEvent(e);
    });
  }

  // ── Scroll to today ────────────────────────────────────────────────────────

  private scrollToToday(scroll: HTMLElement, _cw: number) {
    if (!this.windowStart || !this.windowEnd) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let focus = today;
    if (this.mobileLayout && this.items.length) {
      const ordered = [...this.items].sort((a, b) => a.start.getTime() - b.start.getTime());
      focus = (
        ordered.find((item) => item.start <= today && item.end >= today) ??
        ordered.find((item) => item.start >= today) ??
        ordered[ordered.length - 1]
      ).start;
    }
    const todayPx = (this.mobileLayout ? 0 : this.labelWidth) + this.dateToPixel(focus);
    const targetLeft = todayPx - scroll.clientWidth / 2;
    scroll.scrollLeft = Math.max(0, targetLeft);
  }

  private renderPropVal(
    parent: HTMLElement,
    value: Value,
    item: TimelineItem,
    pid: BasesPropertyId,
  ) {
    new PropertyFieldRenderer(this, 'wcc-timeline').render(parent, value, item, pid);
  }

  // ── Create new note ────────────────────────────────────────────────────────

  private createTimelineNote() {
    return createViewNote(this);
  }
}
