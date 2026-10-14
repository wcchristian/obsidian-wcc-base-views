import { checkboxProperty, renderStatus, viewGroups, statusProperty } from '../../shared/status';
import { setIcon } from 'obsidian';
import { CardDetails } from '../../shared/card-details';
import { distributeEvents, sortSegments, assignLanes } from './layout';
import type { EventSegment } from './layout';
import type { ViewMode, CalEvent, DayInfo, WeekInfo } from './model';
import { createBackground } from '../../shared/background';
import { DatePromptModal } from '../../shared/date-prompt';
import { viewProperty } from '../../shared/view-properties';
import { createViewNote } from '../../shared/view-create';
import { applyViewDensity, hideProperty, isCompact } from '../../shared/view-density';
import { numericOrder } from '../../shared/list-properties';
import { colorCheckbox, propertyColor } from '../../shared/task-appearance';
import type { QueryController, HoverParent, HoverPopover, BasesPropertyId, Value } from 'obsidian';
import {
  BasesView,
  TFile,
  Notice,
  Keymap,
  parsePropertyId,
  BooleanValue,
  NullValue,
  Menu,
  Platform,
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
import { calendarDay, shiftDays, dateKey } from '../../shared/drag-dates';

export const VIEW_TYPE_BASE_CALENDAR = 'wcc-calendar';

const LANE_HEIGHT = 16;
const LANE_GAP = 2;

export class BaseCalendarView extends BasesView implements HoverParent {
  private get win(): Window {
    return this.wrap.ownerDocument.defaultView!;
  }
  private cardDetails?: CardDetails;
  readonly type = VIEW_TYPE_BASE_CALENDAR;
  hoverPopover: HoverPopover | null = null;

  private wrap: HTMLElement;
  private events: CalEvent[] = [];
  private days: DayInfo[] = [];
  private weeks: WeekInfo[] = [];
  private curDate = new Date();
  private viewMode: ViewMode = 'month';
  private configuredViewMode: ViewMode | null = null;
  private mobileLayout = false;
  private selectedDate: string | null = null;
  private mobilePanel: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private layoutWidth = 0;
  private titleEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private hrowEl: HTMLElement | null = null;
  private modeButtons: { month: HTMLElement; week: HTMLElement; agenda: HTMLElement } | null = null;
  private dateProp: BasesPropertyId | null = null;
  private endProp: BasesPropertyId | null = null;
  private doneProp: BasesPropertyId | null = null;
  private propOrder: BasesPropertyId[] = [];
  private plugin: BaseViewsPlugin;
  private maxPerDay = 3;
  private monthExpand = false;
  private agendaDays = 30;
  private weekDays = 7;
  private weekRolling = false;
  private sortOrderProp: string | null = null;
  private grouped = false;

  private dragOrderId: string | null = null;
  private pointerDrag: PointerDrag;
  private dragging = false;
  private dropDay: DayInfo | null = null;
  private dropBefore: string | null = null;
  private dragSourceDateKey: string | null = null;
  private dropIndicator: DropIndicator;

  private isSelecting = false;
  private selectionStart: DayInfo | null = null;
  private selectionEnd: DayInfo | null = null;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private morePopover: HTMLElement | null = null;
  private moreOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(ctrl: QueryController, parent: HTMLElement, plugin: BaseViewsPlugin) {
    super(ctrl);
    this.plugin = plugin;
    this.wrap = parent.createDiv('wcc-calendar-wrap');
    this.dropIndicator = new DropIndicator(this.wrap);
    this.pointerDrag = new PointerDrag(this.wrap, {
      owns: (element) => !!this.morePopover?.contains(element),
      items: '.wcc-calendar-chip, .wcc-calendar-md-bar, .wcc-calendar-md-inline',
      wholeItem: '.wcc-calendar-chip, .wcc-calendar-md-bar, .wcc-calendar-md-inline',
      ignore: 'a:not(.wcc-calendar-chip-link), button, input, textarea, .wcc-calendar-chip-props',
      onStart: (item, event) => {
        if (!this.dateProp || parsePropertyId(this.dateProp).type !== 'note') {
          new Notice('Select a note date property to move calendar events.');
          return false;
        }
        this.dragOrderId = item.dataset.eventId!;
        this.dragSourceDateKey =
          item.closest<HTMLElement>('[data-calendar-date]')?.dataset.calendarDate ??
          this.dayAtPoint(event.clientX, event.clientY)?.dateKey ??
          this.events.find((ev) => ev.id === this.dragOrderId)?.dateKey ??
          null;
        this.dragging = true;
      },
      onMove: (_item, point) => this.updateCalendarDrop(point),
      onDrop: async (_item, point) => {
        this.updateCalendarDrop(point);
        await this.commitCalendarDrop();
      },
      onEnd: () => {
        this.dragging = false;
        this.dragOrderId = null;
        this.dragSourceDateKey = null;
        this.clearCalendarDrop();
        this.closeMorePopover();
        void this.onDataUpdated();
      },
      onError: (error) => {
        console.error(error);
        new Notice('Failed to move calendar event. The calendar has been refreshed.');
      },
    });
    this.resizeObserver = new ResizeObserver(() => {
      if (this.dragging) return;
      const compact = this.useCompactLayout();
      const width = this.wrap.getBoundingClientRect().width;
      if (compact !== this.mobileLayout || width !== this.layoutWidth) {
        this.layoutWidth = width;
        this.mobileLayout = compact;
        this.render();
      }
    });
    this.resizeObserver.observe(this.wrap);
  }

  onDataUpdated(): void {
    if (this.dragging) return;
    applyViewDensity(this.wrap, this.config);
    const restoreScroll = rememberScroll(this.wrap, [
      '.wcc-calendar-body',
      '.wcc-calendar-compact-week-strip',
    ]);
    this.mobileLayout = this.useCompactLayout();
    this.events = [];
    this.wrap.empty();

    this.dateProp = viewProperty(this.config, 'dateProperty') ?? null;
    this.endProp = viewProperty(this.config, 'endDateProperty') ?? null;
    this.doneProp = checkboxProperty(this.config);
    this.propOrder = this.config.getOrder();

    const cfgMode = this.config.get('viewMode');
    const defaultMode: ViewMode = cfgMode === 'week' || cfgMode === 'agenda' ? cfgMode : 'month';
    if (this.configuredViewMode !== defaultMode) {
      this.configuredViewMode = defaultMode;
      this.viewMode = defaultMode;
    }
    const mpd = this.config.get('maxPerDay');
    if (typeof mpd === 'number' && mpd >= 1) this.maxPerDay = Math.floor(mpd);
    this.monthExpand = !!this.config.get('monthExpand');
    const ad = this.config.get('agendaDays');
    if (typeof ad === 'number' && ad >= 1) this.agendaDays = Math.min(30, Math.floor(ad));

    const wd = this.config.get('weekDays');
    if (typeof wd === 'number' && wd >= 1) this.weekDays = Math.min(10, Math.floor(wd));
    this.weekRolling = !!this.config.get('weekRolling');

    const sop = viewProperty(this.config, 'sortOrderProperty');
    this.sortOrderProp =
      sop && parsePropertyId(sop).type === 'note' ? parsePropertyId(sop).name : null;

    this.buildUI(this.wrap);
    this.loadData();
    restoreScroll();
  }

  private buildUI(container: HTMLElement) {
    container.addClass('wcc-calendar-wrap');
    container.toggleClass('wcc-calendar-mobile', this.mobileLayout);

    const hdr = container.createDiv('wcc-calendar-hdr');
    const nav = hdr.createDiv('wcc-calendar-nav');

    const prev = nav.createEl('button', {
      cls: 'wcc-calendar-btn',
      attr: { 'aria-label': 'Previous period', title: 'Previous period' },
    });
    setIcon(prev, 'chevron-left');

    const today = nav.createEl('button', { text: 'Today', cls: 'wcc-calendar-today' });

    const next = nav.createEl('button', {
      cls: 'wcc-calendar-btn',
      attr: { 'aria-label': 'Next period', title: 'Next period' },
    });
    setIcon(next, 'chevron-right');

    this.titleEl = hdr.createEl('h2', { cls: 'wcc-calendar-title' });

    const modeGroup = hdr.createDiv({
      cls: 'wcc-calendar-mode-group',
      attr: { role: 'group', 'aria-label': 'Calendar view' },
    });
    const mMonth = modeGroup.createEl('button', { text: 'Month', cls: 'wcc-calendar-mode' });
    const mWeek = modeGroup.createEl('button', { text: 'Week', cls: 'wcc-calendar-mode' });
    const mAgenda = modeGroup.createEl('button', { text: 'Agenda', cls: 'wcc-calendar-mode' });
    this.modeButtons = { month: mMonth, week: mWeek, agenda: mAgenda };
    mMonth.onclick = () => {
      this.viewMode = 'month';
      this.render();
    };
    mWeek.onclick = () => {
      this.viewMode = 'week';
      this.render();
    };
    mAgenda.onclick = () => {
      this.viewMode = 'agenda';
      this.render();
    };

    prev.onclick = () => {
      this.selectedDate = null;
      if (this.viewMode === 'month')
        this.curDate = new Date(this.curDate.getFullYear(), this.curDate.getMonth() - 1, 1);
      else if (this.viewMode === 'week') this.curDate = shiftDays(this.curDate, -this.weekDays);
      else this.curDate = shiftDays(this.curDate, -this.agendaDays);
      this.render();
    };
    next.onclick = () => {
      this.selectedDate = null;
      if (this.viewMode === 'month')
        this.curDate = new Date(this.curDate.getFullYear(), this.curDate.getMonth() + 1, 1);
      else if (this.viewMode === 'week') this.curDate = shiftDays(this.curDate, this.weekDays);
      else this.curDate = shiftDays(this.curDate, this.agendaDays);
      this.render();
    };
    today.onclick = () => {
      this.curDate = new Date();
      this.selectedDate = dateKey(this.curDate);
      this.render();
    };

    const grid = container.createDiv('wcc-calendar-grid');

    createBackground(grid, this.app, this.config, 'wcc-calendar-bg-layer');

    this.hrowEl = grid.createDiv('wcc-calendar-hrow');
    this.bodyEl = grid.createDiv('wcc-calendar-body');

    this.render();

    if (this.mouseUpHandler) {
      this.wrap.ownerDocument.removeEventListener('mouseup', this.mouseUpHandler);
    }

    const finishSelection = async () => {
      if (!this.isSelecting) return;
      this.isSelecting = false;
      const [start, end] = this.getSelectionRange();
      this.clearSelectionHighlight();
      const startDate = start?.date;
      const endDate = start !== end ? (end?.date ?? null) : null;
      if (startDate && endDate) {
        await this.createNote(startDate, endDate);
      }
      this.selectionStart = null;
      this.selectionEnd = null;
    };
    this.mouseUpHandler = () => {
      void finishSelection().catch((error: unknown) => {
        console.error(error);
        new Notice('Failed to create note from the selection.');
      });
    };
    this.wrap.ownerDocument.addEventListener('mouseup', this.mouseUpHandler);
  }

  private getSelectionRange(): [DayInfo | null, DayInfo | null] {
    if (!this.selectionStart) return [null, null];
    const a = this.selectionStart;
    const b = this.selectionEnd ?? this.selectionStart;
    if (a.date.getTime() <= b.date.getTime()) return [a, b === a ? null : b];
    return [b, a];
  }

  private updateSelectionHighlight() {
    this.days.forEach((d) => d.cell?.removeClass('wcc-calendar-selecting'));
    const [start, end] = this.getSelectionRange();
    if (!start) return;
    const startTime = start.date.getTime();
    const endTime = end ? end.date.getTime() : startTime;
    this.days.forEach((d) => {
      const t = d.date.getTime();
      if (t >= startTime && t <= endTime) {
        d.cell?.addClass('wcc-calendar-selecting');
      }
    });
  }

  private clearSelectionHighlight() {
    this.days.forEach((d) => d.cell?.removeClass('wcc-calendar-selecting'));
  }

  private render() {
    if (this.dragging) return;
    if (!this.titleEl || !this.bodyEl || !this.hrowEl) return;
    this.closeMorePopover();
    this.bodyEl.empty();
    this.hrowEl.empty();
    this.days = [];
    this.weeks = [];
    this.mobilePanel = null;
    this.wrap.toggleClass('wcc-calendar-mobile', this.mobileLayout);
    this.wrap.toggleClass('wcc-calendar-compact', this.mobileLayout && this.viewMode !== 'agenda');

    if (this.modeButtons) {
      Object.entries(this.modeButtons).forEach(([k, btn]) => {
        btn.toggleClass('wcc-calendar-mode-active', k === this.viewMode);
        btn.setAttribute('aria-pressed', String(k === this.viewMode));
      });
    }

    this.bodyEl.removeClass('wcc-calendar-body-month');
    this.bodyEl.removeClass('wcc-calendar-body-week');
    this.bodyEl.removeClass('wcc-calendar-body-agenda');
    this.bodyEl.removeClass('wcc-calendar-body-month-expand');
    this.hrowEl.setCssStyles({ display: '' });

    if (this.viewMode === 'month') {
      this.bodyEl.addClass('wcc-calendar-body-month');
      if (this.monthExpand && !this.mobileLayout)
        this.bodyEl.addClass('wcc-calendar-body-month-expand');
      if (this.mobileLayout) this.renderCompactMonth();
      else this.renderMonth();
    } else if (this.viewMode === 'week') {
      this.bodyEl.addClass('wcc-calendar-body-week');
      if (this.mobileLayout) this.renderCompactWeek();
      else this.renderWeek();
    } else {
      this.bodyEl.addClass('wcc-calendar-body-agenda');
      this.hrowEl.setCssStyles({ display: 'none' });
      this.renderAgenda();
    }

    this.placeEvents();
  }

  private useCompactLayout(): boolean {
    const width = this.wrap.getBoundingClientRect().width;
    return width > 0 && width <= 700;
  }

  private compactDay(parent: HTMLElement, date: Date, currentMonth = true): DayInfo {
    const today = dateKey(new Date());
    const key = dateKey(date);
    const cell = parent.createEl('button', {
      cls:
        'wcc-calendar-compact-date' +
        (key === today ? ' wcc-calendar-compact-today' : '') +
        (!currentMonth ? ' wcc-calendar-compact-other' : ''),
      attr: {
        type: 'button',
        'aria-label': date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      },
    });
    cell.dataset.calendarDate = key;
    if (this.viewMode === 'week')
      cell.createSpan({
        cls: 'wcc-calendar-compact-dow',
        text: date.toLocaleDateString('en-US', { weekday: 'short' }),
      });
    const number = cell.createSpan({
      cls: 'wcc-calendar-compact-number',
      text: String(date.getDate()),
    });
    cell.createSpan({ cls: 'wcc-calendar-compact-count' });
    cell.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.selectedDate = key;
      this.refreshCompactDays();
      this.renderCompactPanel();
    };
    const day: DayInfo = {
      dateKey: key,
      date,
      weekIdx: 0,
      colIdx: 0,
      isCurrentMonth: currentMonth,
      isToday: key === today,
      cell,
      numEl: number,
      evList: null,
      events: [],
    };
    this.days.push(day);
    return day;
  }

  private chooseCompactDay() {
    if (this.days.some((day) => day.dateKey === this.selectedDate)) return;
    const preferred = dateKey(this.curDate);
    this.selectedDate =
      this.days.find((day) => day.dateKey === preferred)?.dateKey ??
      this.days.find((day) => day.isToday && day.isCurrentMonth)?.dateKey ??
      this.days.find((day) => day.isCurrentMonth)?.dateKey ??
      null;
  }

  private renderCompactMonth() {
    if (!this.bodyEl || !this.hrowEl || !this.titleEl) return;
    this.titleEl.textContent = this.curDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    this.hrowEl.setCssProps({ ['--wcc-calendar-cols']: '7' });
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((name) =>
      this.hrowEl!.createDiv({ cls: 'wcc-calendar-dname', text: name }),
    );
    const grid = this.bodyEl.createDiv('wcc-calendar-compact-month-grid');
    const first = new Date(this.curDate.getFullYear(), this.curDate.getMonth(), 1);
    const start = shiftDays(first, -first.getDay());
    const last = new Date(this.curDate.getFullYear(), this.curDate.getMonth() + 1, 0);
    const cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      const date = shiftDays(start, i);
      this.compactDay(grid, date, date.getMonth() === this.curDate.getMonth());
    }
    this.chooseCompactDay();
    this.mobilePanel = this.bodyEl.createDiv('wcc-calendar-compact-panel');
  }

  private renderCompactWeek() {
    if (!this.bodyEl || !this.hrowEl || !this.titleEl) return;
    this.hrowEl.setCssStyles({ display: 'none' });
    const current = new Date(this.curDate);
    current.setHours(0, 0, 0, 0);
    const start = this.weekRolling ? current : shiftDays(current, -current.getDay());
    const end = shiftDays(start, this.weekDays - 1);
    const fmt = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    this.titleEl.textContent = `${fmt(start)} — ${fmt(end)}, ${end.getFullYear()}`;
    const strip = this.bodyEl.createDiv('wcc-calendar-compact-week-strip');
    for (let i = 0; i < this.weekDays; i++) this.compactDay(strip, shiftDays(start, i));
    this.chooseCompactDay();
    this.mobilePanel = this.bodyEl.createDiv('wcc-calendar-compact-panel');
  }

  private refreshCompactDays() {
    for (const day of this.days) {
      const selected = day.dateKey === this.selectedDate;
      day.cell?.toggleClass('wcc-calendar-compact-selected', selected);
      day.cell?.setAttribute('aria-pressed', String(selected));
      const count = day.cell?.querySelector<HTMLElement>('.wcc-calendar-compact-count');
      if (count) {
        count.textContent = day.events.length ? String(day.events.length) : '';
        count.setAttribute('aria-hidden', 'true');
      }
      const label = day.date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      day.cell?.setAttribute(
        'aria-label',
        `${label}, ${day.events.length} ${day.events.length === 1 ? 'event' : 'events'}`,
      );
    }
    if (this.viewMode === 'week') {
      const selected = this.days.find((day) => day.dateKey === this.selectedDate)?.cell;
      const strip = selected?.parentElement;
      if (selected && strip)
        strip.scrollLeft = Math.max(
          0,
          selected.offsetLeft - strip.clientWidth / 2 + selected.offsetWidth / 2,
        );
    }
  }

  private renderCompactPanel() {
    if (!this.mobilePanel) return;
    this.mobilePanel.empty();
    this.days.forEach((day) => {
      day.evList = null;
    });
    const day = this.days.find((value) => value.dateKey === this.selectedDate);
    if (!day) return;
    this.mobilePanel.dataset.calendarDate = day.dateKey;
    const header = this.mobilePanel.createDiv('wcc-calendar-compact-panel-header');
    header.createEl('h3', {
      text: day.date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    });
    const add = header.createEl('button', {
      text: 'Add note',
      cls: 'wcc-calendar-compact-add',
      attr: { type: 'button', 'aria-label': `Add note for ${day.dateKey}` },
    });
    add.onclick = (event) => {
      event.stopPropagation();
      void this.createNote(day.date, null);
    };
    day.evList = this.mobilePanel.createDiv('wcc-calendar-compact-events');
    if (!day.events.length)
      day.evList.createDiv({ cls: 'wcc-calendar-compact-empty', text: 'No events for this day' });
    this.renderDayChips(day.evList, day.events);
  }

  private placeCompactEvents() {
    for (const day of this.days) {
      day.events = this.events.filter(
        (event) =>
          calendarDay(day.date) >= calendarDay(event.start) &&
          calendarDay(day.date) <= calendarDay(event.end ?? event.start),
      );
      const saved = this.plugin.settings.localOrder[day.dateKey] ?? [];
      const rank = new Map(saved.map((id, index) => [id, index]));
      if (saved.length)
        day.events.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
      else if (this.sortOrderProp)
        day.events.sort(
          (a, b) =>
            numericOrder(a.entry.getValue(`note.${this.sortOrderProp}`)?.toString()) -
            numericOrder(b.entry.getValue(`note.${this.sortOrderProp}`)?.toString()),
        );
    }
    this.refreshCompactDays();
    this.renderCompactPanel();
  }

  private renderMonth() {
    if (!this.titleEl || !this.bodyEl || !this.hrowEl) return;
    this.titleEl.textContent = this.curDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Always 7 columns for month view
    this.bodyEl.setCssProps({ ['--wcc-calendar-cols']: '7' });
    this.hrowEl.setCssProps({ ['--wcc-calendar-cols']: '7' });
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) =>
      this.hrowEl!.createDiv({ text: d, cls: 'wcc-calendar-dname' }),
    );

    const yr = this.curDate.getFullYear();
    const mo = this.curDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const first = new Date(yr, mo, 1);
    const off = first.getDay();
    const dim = new Date(yr, mo + 1, 0).getDate();
    const dpm = new Date(yr, mo, 0).getDate();

    for (let w = 0; w < 6; w++) {
      const weekRow = this.bodyEl.createDiv('wcc-calendar-week');
      const weekDays: DayInfo[] = [];

      for (let c = 0; c < 7; c++) {
        const i = w * 7 + c;
        let dt: Date;
        let cur = true;
        if (i < off) {
          dt = new Date(yr, mo - 1, dpm - off + i + 1);
          cur = false;
        } else if (i >= off + dim) {
          dt = new Date(yr, mo + 1, i - off - dim + 1);
          cur = false;
        } else {
          dt = new Date(yr, mo, i - off + 1);
        }
        dt.setHours(0, 0, 0, 0);
        const info = this.makeCell(weekRow, dt, w, c, today, cur);
        weekDays.push(info);
      }

      const overlay = weekRow.createDiv('wcc-calendar-md-overlay');
      this.weeks.push({ days: weekDays, overlay });
    }
  }

  private renderWeek() {
    if (!this.titleEl || !this.bodyEl || !this.hrowEl) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let weekStart: Date;

    if (this.weekRolling) {
      // Rolling: start from today (or curDate)
      const cur = new Date(this.curDate);
      cur.setHours(0, 0, 0, 0);
      weekStart = cur;
    } else {
      // Fixed: start from Sunday of current week
      const cur = new Date(this.curDate);
      cur.setHours(0, 0, 0, 0);
      weekStart = shiftDays(cur, -cur.getDay());
    }

    const weekEnd = shiftDays(weekStart, this.weekDays - 1);

    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    this.titleEl.textContent = `${fmt(weekStart)} — ${fmt(weekEnd)}, ${weekEnd.getFullYear()}`;

    // Set CSS variable for column count
    this.bodyEl.setCssProps({ ['--wcc-calendar-cols']: String(this.weekDays) });
    this.hrowEl.setCssProps({ ['--wcc-calendar-cols']: String(this.weekDays) });

    // Generate day headers from actual dates
    for (let c = 0; c < this.weekDays; c++) {
      const dt = shiftDays(weekStart, c);
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      this.hrowEl.createDiv({ text: dayName, cls: 'wcc-calendar-dname' });
    }

    const weekRow = this.bodyEl.createDiv('wcc-calendar-week');
    const weekDays: DayInfo[] = [];
    for (let c = 0; c < this.weekDays; c++) {
      const dt = shiftDays(weekStart, c);
      dt.setHours(0, 0, 0, 0);
      const info = this.makeCell(weekRow, dt, 0, c, today, true);
      weekDays.push(info);
    }
    const overlay = weekRow.createDiv('wcc-calendar-md-overlay');
    this.weeks.push({ days: weekDays, overlay });
  }

  private renderAgenda() {
    if (!this.titleEl || !this.bodyEl) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(this.curDate);
    start.setHours(0, 0, 0, 0);
    const end = shiftDays(start, this.agendaDays - 1);

    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    this.titleEl.textContent = `${fmt(start)} — ${fmt(end)}, ${end.getFullYear()}`;

    for (let i = 0; i < this.agendaDays; i++) {
      const dt = shiftDays(start, i);
      dt.setHours(0, 0, 0, 0);
      const dk = dateKey(dt);
      const isT = dt.getTime() === today.getTime();
      const section = this.bodyEl.createDiv(
        'wcc-calendar-agenda-day' + (isT ? ' wcc-calendar-agenda-today' : ''),
      );
      const header = section.createDiv('wcc-calendar-agenda-date');
      header.createSpan({
        cls: 'wcc-calendar-agenda-dow',
        text: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      });
      header.createSpan({ cls: 'wcc-calendar-agenda-num', text: String(dt.getDate()) });
      header.createSpan({
        cls: 'wcc-calendar-agenda-mon',
        text: dt.toLocaleDateString('en-US', { month: 'short' }),
      });
      const list = section.createDiv('wcc-calendar-agenda-list');
      const addBtn = section.createEl('button', {
        cls: 'wcc-calendar-add wcc-calendar-add-agenda',
        attr: {
          'aria-label': 'Add note for this day',
          title: 'Add note for this day',
          type: 'button',
        },
      });
      setIcon(addBtn, 'plus');
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.createNote(dt, null);
      };
      const info: DayInfo = {
        dateKey: dk,
        date: dt,
        weekIdx: 0,
        colIdx: 0,
        isCurrentMonth: true,
        isToday: isT,
        events: [],
        cell: section,
        numEl: null,
        evList: list,
      };
      this.attachDropTarget(section, list, info);
      this.days.push(info);
    }
  }

  private makeCell(
    parent: HTMLElement,
    dt: Date,
    w: number,
    c: number,
    today: Date,
    cur: boolean,
  ): DayInfo {
    const dk = dateKey(dt);
    const isT = dt.getTime() === today.getTime();
    const cell = parent.createDiv(
      'wcc-calendar-cell' + (cur ? '' : ' wcc-calendar-other') + (isT ? ' wcc-calendar-today' : ''),
    );
    const num = cell.createSpan({ cls: 'wcc-calendar-num', text: String(dt.getDate()) });
    const addBtn = cell.createEl('button', {
      cls: 'wcc-calendar-add',
      attr: {
        'aria-label': 'Add note for this day',
        title: 'Add note for this day',
        type: 'button',
      },
    });
    setIcon(addBtn, 'plus');
    addBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.createNote(dt, null);
    };
    addBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    const el = cell.createDiv('wcc-calendar-evs');
    const info: DayInfo = {
      dateKey: dk,
      date: dt,
      weekIdx: w,
      colIdx: c,
      isCurrentMonth: cur,
      isToday: isT,
      events: [],
      cell,
      numEl: num,
      evList: el,
    };
    this.days.push(info);

    this.attachDropTarget(cell, el, info);

    cell.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-chip')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-md-bar')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-more')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-add')) return;
      this.isSelecting = true;
      this.selectionStart = info;
      this.selectionEnd = info;
      this.updateSelectionHighlight();
    });
    cell.addEventListener('mouseenter', () => {
      if (this.isSelecting) {
        this.selectionEnd = info;
        this.updateSelectionHighlight();
      }
    });
    cell.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.wcc-calendar-chip')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-md-bar')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-more')) return;
      if ((e.target as HTMLElement).closest('.wcc-calendar-add')) return;
      e.preventDefault();
      e.stopPropagation();
      void this.createNote(dt, null);
    });
    return info;
  }

  private placeEvents() {
    if (this.mobileLayout && this.viewMode !== 'agenda') {
      this.placeCompactEvents();
      return;
    }
    this.days.forEach((d) => {
      d.events = [];
    });
    this.weeks.forEach((wk) => {
      if (wk.overlay) {
        wk.overlay.empty();
        wk.overlay.parentElement!.setCssStyles({ minHeight: '' });
      }
    });

    const { singleDayByDate, multiByWeek } = distributeEvents(
      this.events,
      this.days,
      this.weeks,
      this.viewMode === 'agenda',
    );

    this.days.forEach((d) => {
      if (!d.evList) return;
      d.evList.empty();
      let evs = singleDayByDate.get(d.dateKey) ?? [];

      // Sort: localOrder first, then sortOrderProperty if configured, else Bases-supplied order
      const order = this.plugin.settings.localOrder[d.dateKey];
      if (order && order.length > 0) {
        const out: CalEvent[] = [];
        const remaining = [...evs];
        for (const id of order) {
          const idx = remaining.findIndex((e) => e.id === id);
          if (idx !== -1) out.push(remaining.splice(idx, 1)[0]);
        }
        evs = [...out, ...remaining];
      } else if (this.sortOrderProp) {
        evs = [...evs].sort((a, b) => {
          const va = a.entry.getValue(`note.${this.sortOrderProp}` as BasesPropertyId);
          const vb = b.entry.getValue(`note.${this.sortOrderProp}` as BasesPropertyId);
          const na = numericOrder(va?.toString());
          const nb = numericOrder(vb?.toString());
          return na - nb;
        });
      }
      // else: use Bases-supplied order (no modification)

      d.events = evs;

      if (this.viewMode === 'month' && !this.monthExpand && evs.length > this.maxPerDay) {
        const visible = evs.slice(0, this.maxPerDay - 1);
        this.renderDayChips(d.evList, visible);
        const more = d.evList.createDiv('wcc-calendar-more');
        const hidden = evs.length - visible.length;
        more.textContent = `+${hidden} more`;
        more.onclick = (e) => {
          e.stopPropagation();
          this.openMorePopover(d, more, false);
        };

        // Hover popover support
        let hoverTimer: number | null = null;
        d.cell!.addEventListener('mouseenter', () => {
          if (this.morePopover || this.dragging) return; // already open (click-pinned)
          hoverTimer = this.win.setTimeout(() => this.openMorePopover(d, more, true), 200);
        });
        d.cell!.addEventListener('mouseleave', () => {
          if (hoverTimer !== null) {
            this.win.clearTimeout(hoverTimer);
            hoverTimer = null;
          }
        });
      } else {
        this.renderDayChips(d.evList, evs);
      }
    });

    this.weeks.forEach((wk, wIdx) => {
      const segs = sortSegments(multiByWeek[wIdx]);

      if (this.monthExpand && this.viewMode === 'month') {
        // Inline mode: render a bar in each day's evList instead of the overlay
        if (segs.length === 0) return;
        for (const seg of segs) {
          for (let col = seg.startCol; col <= seg.endCol; col++) {
            const day = wk.days[col];
            if (!day?.evList) continue;
            const bar = day.evList.createDiv('wcc-calendar-md-inline');
            bar.dataset.eventId = seg.ev.id;
            const color = this.getEventColor(seg.ev);
            if (color) {
              bar.setCssStyles({
                background: `color-mix(in srgb, ${color} 60%, var(--background-primary))`,
              });
            } else {
              bar.setCssStyles({
                background: `color-mix(in srgb, var(--interactive-accent) 35%, var(--background-primary))`,
              });
            }
            if (col === seg.startCol) {
              bar.createSpan({ text: seg.ev.title });
              bar.title = seg.ev.title;
            } else {
              bar.setCssStyles({ opacity: '0.6' });
            }
            dragGrip(bar, `Drag ${seg.ev.title} to move dates`);
            bar.onclick = (e) => {
              e.stopPropagation();
              const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
              void leaf?.openFile(seg.ev.file);
            };
          }
        }
        return;
      }

      if (!wk.overlay) return;
      if (segs.length === 0) {
        wk.overlay.setCssStyles({ height: '0px' });
        wk.days.forEach((d) => {
          if (d.evList) d.evList.setCssStyles({ paddingTop: '0px' });
        });
        return;
      }

      const { assignments: assigned, laneCount } = assignLanes(segs);
      const laneHeights = Array.from({ length: laneCount }, () => this.getLaneHeight());
      const bars = segs.map((seg, i) => {
        const bar = this.makeMultiDayBar(wk.overlay!, seg, assigned[i]);
        laneHeights[assigned[i]] = Math.max(
          laneHeights[assigned[i]],
          Math.ceil(bar.getBoundingClientRect().height),
        );
        return bar;
      });
      let overlayHeight = 0;
      laneHeights.forEach((height, lane) => {
        bars.forEach((bar, i) => {
          if (assigned[i] === lane) {
            bar.setCssStyles({ top: `${overlayHeight}px` });
            bar.setCssStyles({ height: `${height}px` });
          }
        });
        overlayHeight += height + LANE_GAP;
      });
      overlayHeight -= LANE_GAP;
      wk.overlay.setCssStyles({ height: `${overlayHeight}px` });
      // Keep taller wrapped lanes within their own week instead of covering the next one.
      wk.overlay.parentElement!.setCssStyles({ minHeight: `${overlayHeight + 40}px` });

      wk.days.forEach((d) => {
        if (d.evList) d.evList.setCssStyles({ paddingTop: `${overlayHeight + 4}px` });
      });
    });
  }

  private renderDayChips(parent: HTMLElement, evs: CalEvent[]) {
    // Status belongs to the event pill; repeating group headings crowds the date grid.
    evs.forEach((ev) => this.makeChip(parent, ev));
  }

  private getEventColor(ev: CalEvent): string | null {
    return propertyColor(this.config, ev.entry);
  }

  private getLaneHeight(): number {
    return Platform.isMobile ||
      this.wrap.ownerDocument.defaultView?.matchMedia('(pointer: coarse)').matches
      ? 32
      : LANE_HEIGHT;
  }

  private makeMultiDayBar(overlay: HTMLElement, seg: EventSegment, lane: number) {
    const bar = overlay.createDiv(
      'wcc-calendar-md-bar' + (seg.ev.done ? ' wcc-calendar-md-done' : ''),
    );
    bar.dataset.eventId = seg.ev.id;
    bar.setCssStyles({ minHeight: `${this.getLaneHeight()}px` });
    dragGrip(bar, `Drag ${seg.ev.title} to move dates`);
    bar.setCssStyles({ gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}` });
    bar.setCssStyles({ top: `${lane * (this.getLaneHeight() + LANE_GAP)}px` });
    if (!seg.isStart) bar.addClass('wcc-calendar-md-cont-left');
    if (!seg.isEnd) bar.addClass('wcc-calendar-md-cont-right');

    const color = this.getEventColor(seg.ev);
    if (color) {
      bar.setCssStyles({
        background: `color-mix(in srgb, ${color} 35%, var(--background-primary))`,
      });
      if (seg.isStart) bar.setCssStyles({ borderLeft: `3px solid ${color}` });
    }

    if (!renderStatus(this, bar, seg.ev) && this.doneProp) {
      const cb = bar.createEl('button', {
        cls: 'wcc-calendar-md-check' + (seg.ev.done ? ' wcc-calendar-md-check-on' : ''),
        attr: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(seg.ev.done),
          'aria-label': `Mark ${seg.ev.title} ${seg.ev.done ? 'incomplete' : 'complete'}`,
        },
      });
      colorCheckbox(cb, this.config, seg.ev.entry);
      cb.onclick = async (e) => {
        e.stopPropagation();
        const newVal = !seg.ev.done;
        cb.disabled = true;
        try {
          await writeProp(this.app, seg.ev.file, this.doneProp!, newVal);
        } catch (err) {
          console.error(err);
          new Notice('Failed to update completion');
          return;
        } finally {
          cb.disabled = false;
        }
        seg.ev.done = newVal;
        bar.toggleClass('wcc-calendar-md-done', newVal);
        cb.toggleClass('wcc-calendar-md-check-on', newVal);
        cb.setAttribute('aria-checked', String(newVal));
        cb.setAttribute('aria-label', `Mark ${seg.ev.title} ${newVal ? 'incomplete' : 'complete'}`);
      };
    }

    const label = bar.createSpan({ cls: 'wcc-calendar-md-label', text: seg.ev.title });
    label.title = seg.ev.title;
    label.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
      void leaf?.openFile(seg.ev.file);
    };
    bar.onmouseover = (e) => {
      this.app.workspace.trigger('hover-link', {
        event: e,
        source: 'bases',
        hoverParent: this,
        targetEl: bar,
        linktext: seg.ev.file.path,
      });
    };
    bar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e, seg.ev);
    });
    return bar;
  }

  private makeChip(container: HTMLElement, ev: CalEvent) {
    const chip = container.createDiv(
      'wcc-calendar-chip' + (ev.done ? ' wcc-calendar-chip-done' : ''),
    );
    chip.dataset.eventId = ev.id;
    const compact = isCompact(this.config);
    const tint = compact ? 6 : 10;
    const color = this.getEventColor(ev);
    if (color) {
      chip.setCssStyles({ borderLeft: `2px solid ${color}` });
      chip.setCssStyles({
        background: `color-mix(in srgb, ${color} ${tint}%, var(--background-primary))`,
      });
    }

    const titleRow = chip.createDiv('wcc-calendar-chip-title');
    dragGrip(titleRow, `Drag ${ev.title} to move or reorder`);

    if (!renderStatus(this, titleRow, ev) && this.doneProp) {
      const cb = titleRow.createEl('button', {
        cls: 'wcc-calendar-check' + (ev.done ? ' wcc-calendar-check-on' : ''),
        attr: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(ev.done),
          'aria-label': `Mark ${ev.title} ${ev.done ? 'incomplete' : 'complete'}`,
        },
      });
      colorCheckbox(cb, this.config, ev.entry);
      cb.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newVal = !ev.done;
        cb.disabled = true;
        try {
          await writeProp(this.app, ev.file, this.doneProp!, newVal);
        } catch (err) {
          console.error(err);
          new Notice('Failed to update completion');
          return;
        } finally {
          cb.disabled = false;
        }
        ev.done = newVal;
        chip.toggleClass('wcc-calendar-chip-done', newVal);
        cb.toggleClass('wcc-calendar-check-on', newVal);
        cb.setAttribute('aria-checked', String(newVal));
        cb.setAttribute('aria-label', `Mark ${ev.title} ${newVal ? 'incomplete' : 'complete'}`);
      };
    }

    const link = titleRow.createEl('a', {
      text: ev.title,
      cls: 'wcc-calendar-chip-link',
      href: '#',
    });
    link.draggable = false;
    link.title = ev.title;
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
      void leaf?.openFile(ev.file);
    };
    link.onmouseover = (e) => {
      this.app.workspace.trigger('hover-link', {
        event: e,
        source: 'bases',
        hoverParent: this,
        targetEl: chip,
        linktext: ev.file.path,
      });
    };

    chip.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button, input, textarea, a, .wcc-calendar-chip-props'))
        return;
      e.preventDefault();
      e.stopPropagation();
      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e));
      void leaf?.openFile(ev.file);
    };

    chip.addEventListener('mousedown', (e) => {
      if (
        e.button === 1 &&
        !(e.target as HTMLElement).closest('.wcc-calendar-chip-props, button, input, textarea')
      )
        e.preventDefault();
    });
    chip.addEventListener('auxclick', (e) => {
      if (
        e.button !== 1 ||
        (e.target as HTMLElement).closest('.wcc-calendar-chip-props, button, input, textarea')
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      void this.app.workspace.getLeaf('tab').openFile(ev.file);
    });

    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e, ev);
    });

    if (color) {
      chip.addEventListener('mouseenter', () => {
        chip.setCssStyles({
          background: `color-mix(in srgb, ${color} ${compact ? 10 : 16}%, var(--background-primary))`,
        });
      });
      chip.addEventListener('mouseleave', () => {
        chip.setCssStyles({
          background: `color-mix(in srgb, ${color} ${tint}%, var(--background-primary))`,
        });
      });
    }

    chip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
    });

    if (
      this.mobileLayout &&
      this.viewMode !== 'agenda' &&
      ev.end &&
      calendarDay(ev.end) > calendarDay(ev.start)
    ) {
      const fmt = (date: Date) =>
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      chip.createDiv({
        cls: 'wcc-calendar-compact-event-range',
        text: `${fmt(ev.start)} — ${fmt(ev.end)}`,
      });
    }
    const props = chip.createDiv('wcc-calendar-chip-props');
    this.propOrder.forEach((pid) => {
      if (pid === 'file.name') return;
      if (this.doneProp && pid === this.doneProp) return;
      if (
        statusProperty(this.config) &&
        (pid === statusProperty(this.config) ||
          pid === (viewProperty(this.config, 'doneProperty') ?? 'note.done'))
      )
        return;
      if (compact && (pid === this.dateProp || pid === this.endProp)) return;
      const val = ev.entry.getValue(pid);
      if (hideProperty(val, this.config)) return;
      if ((!val || val instanceof NullValue) && parsePropertyId(pid).type !== 'note') return;
      const row = props.createDiv('wcc-calendar-prop-row');
      row.title = this.config.getDisplayName(pid);
      row.createSpan({
        cls: 'wcc-calendar-prop-label',
        text: this.config.getDisplayName(pid) + ': ',
      });
      this.renderPropVal(row, val ?? new NullValue(), ev, pid);
    });
    (this.cardDetails ??= new CardDetails()).render(
      titleRow,
      chip,
      props,
      ev.title,
      ev.id,
      'wcc-calendar',
      this.config,
    );
  }

  private showContextMenu(e: MouseEvent, ev: CalEvent) {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle('Open in new tab')
        .setIcon('file-plus')
        .onClick(() => {
          void this.app.workspace.getLeaf('tab').openFile(ev.file);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Open to the right')
        .setIcon('separator-vertical')
        .onClick(() => {
          void this.app.workspace.getLeaf('split').openFile(ev.file);
        }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Change date…')
        .setIcon('calendar')
        .onClick(async () => {
          const d = await new DatePromptModal(
            this.app,
            ev.start,
            `Change date for "${ev.title}"`,
          ).prompt();
          if (d) await this.moveEvent(ev.id, d);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Duplicate')
        .setIcon('copy')
        .onClick(async () => {
          await this.duplicateEvent(ev);
        }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Delete')
        .setIcon('trash')
        .setWarning(true)
        .onClick(async () => {
          await this.app.fileManager.trashFile(ev.file);
          new Notice(`Trashed "${ev.title}"`);
        }),
    );
    menu.showAtMouseEvent(e);
  }

  private async duplicateEvent(ev: CalEvent) {
    const dir = ev.file.parent?.path ?? '';
    let base = `${ev.file.basename} (copy)`;
    let path = dir ? `${dir}/${base}.md` : `${base}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      base = `${ev.file.basename} (copy ${i})`;
      path = dir ? `${dir}/${base}.md` : `${base}.md`;
      i++;
    }
    try {
      const newFile = await this.app.vault.copy(ev.file, path);
      void this.app.workspace.getLeaf(false)?.openFile(newFile);
    } catch (err) {
      console.error(err);
      new Notice('Failed to duplicate');
    }
  }

  private openMorePopover(day: DayInfo, anchor: HTMLElement, isHover: boolean) {
    this.closeMorePopover();
    const pop = this.wrap.ownerDocument.body.createDiv('wcc-calendar-more-popover');
    pop.classList.toggle('wcc-touch-drag', this.wrap.classList.contains('wcc-touch-drag'));
    applyViewDensity(pop, this.config);
    this.morePopover = pop;

    const title = pop.createDiv('wcc-calendar-more-title');
    title.textContent = day.date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const list = pop.createDiv('wcc-calendar-more-list');
    pop.dataset.calendarDate = day.dateKey;
    this.renderDayChips(list, day.events);

    const rect = anchor.getBoundingClientRect();
    pop.setCssStyles({ position: 'fixed' });
    pop.setCssStyles({ left: `${rect.left}px` });
    pop.setCssStyles({ top: `${rect.bottom + 4}px` });
    pop.setCssStyles({ minWidth: `${Math.max(rect.width, 220)}px` });

    this.win.requestAnimationFrame(() => {
      const popRect = pop.getBoundingClientRect();
      if (popRect.right > this.win.innerWidth - 8) {
        pop.setCssStyles({ left: `${this.win.innerWidth - popRect.width - 8}px` });
      }
      if (popRect.bottom > this.win.innerHeight - 8) {
        pop.setCssStyles({ top: `${rect.top - popRect.height - 4}px` });
      }
    });

    if (isHover) {
      // For hover: close when leaving both the cell and the popover
      const cellEl = day.cell;
      let insideCell = false;
      let insidePop = false;

      const checkClose = () => {
        if (!this.dragging && !insideCell && !insidePop) this.closeMorePopover();
      };

      if (cellEl) {
        cellEl.addEventListener('mouseleave', () => {
          insideCell = false;
          this.win.setTimeout(checkClose, 50);
        });
        cellEl.addEventListener('mouseenter', () => {
          insideCell = true;
        });
        insideCell = true;
      }
      pop.addEventListener('mouseenter', () => {
        insidePop = true;
      });
      pop.addEventListener('mouseleave', () => {
        insidePop = false;
        this.win.setTimeout(checkClose, 50);
      });
    } else {
      const handler = (e: MouseEvent) => {
        if (!this.morePopover || this.dragging) return;
        if (this.morePopover.contains(e.target as Node)) return;
        this.closeMorePopover();
      };
      this.moreOutsideHandler = handler;
      this.win.setTimeout(() => this.wrap.ownerDocument.addEventListener('mousedown', handler), 0);
    }
  }

  private closeMorePopover() {
    if (this.morePopover) {
      this.morePopover.remove();
      this.morePopover = null;
    }
    if (this.moreOutsideHandler) {
      this.wrap.ownerDocument.removeEventListener('mousedown', this.moreOutsideHandler);
      this.moreOutsideHandler = null;
    }
  }

  private renderPropVal(parent: HTMLElement, val: Value, ev: CalEvent, pid: BasesPropertyId) {
    new PropertyFieldRenderer(this, 'wcc-calendar').render(parent, val, ev, pid);
  }

  private attachDropTarget(cell: HTMLElement, _list: HTMLElement, info: DayInfo) {
    cell.dataset.calendarDate = info.dateKey;
  }

  private dayAtPoint(x: number, y: number): DayInfo | null {
    const hit = this.wrap.ownerDocument.elementFromPoint(x, y);
    if (!hit || (!this.wrap.contains(hit) && !this.morePopover?.contains(hit))) return null;
    const date = hit.closest<HTMLElement>('[data-calendar-date]')?.dataset.calendarDate;
    if (date) return this.days.find((day) => day.dateKey === date) ?? null;
    // Spanning bars overlay multiple cells; hit-test each cell beneath the overlay.
    return (
      this.days.find((day) => {
        const rect = day.cell?.getBoundingClientRect();
        return rect && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
      }) ?? null
    );
  }

  private clearCalendarDrop() {
    this.dropDay?.cell?.classList.remove('wcc-calendar-drop');
    this.dropDay = null;
    this.dropBefore = null;
    this.dropIndicator.hide();
  }

  private updateCalendarDrop(point: DragPoint) {
    this.clearCalendarDrop();
    const day = this.dayAtPoint(point.x, point.y);
    if (!day) return;
    this.dropDay = day;
    day.cell?.classList.add('wcc-calendar-drop');
    const dateLabel = day.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    if (!day.evList) {
      this.dropIndicator.show(day.cell!, null, day.cell, `Move to ${dateLabel}`);
      return;
    }
    const hit = this.wrap.ownerDocument.elementFromPoint(point.x, point.y);
    const list = hit?.closest<HTMLElement>('.wcc-calendar-more-list') ?? day.evList;
    const event = this.events.find((ev) => ev.id === this.dragOrderId);
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.wcc-calendar-chip')).filter(
      (row) =>
        !this.grouped ||
        this.events.find((ev) => ev.id === row.dataset.eventId)?.groupKey === event?.groupKey,
    );
    const before = beforeAt(rows, point.y, this.dragOrderId!, 'eventId');
    const remaining = rows.filter((row) => row.dataset.eventId !== this.dragOrderId);
    const lastVisible = remaining[remaining.length - 1];
    const ordered = day.events.filter((ev) => !this.grouped || ev.groupKey === event?.groupKey);
    const lastIndex = ordered.findIndex((ev) => ev.id === lastVisible?.dataset.eventId);
    // Dropping below the final visible card stays ahead of cards hidden by "more".
    this.dropBefore =
      before?.dataset.eventId ??
      (lastIndex >= 0
        ? ordered.slice(lastIndex + 1).find((ev) => ev.id !== this.dragOrderId)?.id
        : null) ??
      null;
    this.dropIndicator.show(
      list,
      before,
      remaining[remaining.length - 1] ?? null,
      `${dateLabel} · ${before ? 'Before ' + before.querySelector('a')?.textContent : 'At end'}`,
    );
  }

  private async commitCalendarDrop() {
    const day = this.dropDay;
    const id = this.dragOrderId;
    if (!day || !id || !this.dragSourceDateKey) return;
    const ev = this.events.find((event) => event.id === id);
    if (!ev) return;
    const source = new Date(this.dragSourceDateKey + 'T00:00:00');
    const delta = calendarDay(day.date) - calendarDay(source);
    const previousDate = this.dragSourceDateKey;
    const before = this.dropBefore;
    const original = [
      ...new Set([
        ...(this.plugin.settings.localOrder[day.dateKey] ?? []),
        ...day.events.map((event) => event.id),
      ]),
    ];
    const order = moveBefore(original, id, before);
    if (!delta && original.join('\n') === order.join('\n')) return;
    if (delta) {
      await this.moveEvent(id, shiftDays(ev.start, delta));
      if (this.mobileLayout) this.selectedDate = day.dateKey;
    }
    // Freeze rebuilds through date and rank writes; preserve hidden events via IDs.
    this.plugin.settings.localOrder[day.dateKey] = order;
    if (delta)
      this.plugin.settings.localOrder[previousDate] = (
        this.plugin.settings.localOrder[previousDate] ?? []
      ).filter((value) => value !== id);
    await this.plugin.saveSettings();
    if (this.sortOrderProp) {
      for (let i = 0; i < order.length; i++) {
        const event = this.events.find((value) => value.id === order[i]);
        if (event) await writeProp(this.app, event.file, `note.${this.sortOrderProp}`, i * 10);
      }
    }
  }

  onunload() {
    this.pointerDrag.destroy();
    this.resizeObserver?.disconnect();
    this.clearCalendarDrop();
    this.closeMorePopover();
    if (this.mouseUpHandler)
      this.wrap.ownerDocument.removeEventListener('mouseup', this.mouseUpHandler);
    this.dropIndicator.destroy();
    super.onunload();
  }

  private async moveEvent(id: string, newDate: Date) {
    const ev = this.events.find((event) => event.id === id);
    if (!ev || !this.dateProp || parsePropertyId(this.dateProp).type !== 'note') return;
    const delta = calendarDay(newDate) - calendarDay(ev.start);
    const newEnd = ev.end ? shiftDays(ev.end, delta) : null;
    const dateName = parsePropertyId(this.dateProp).name;
    const endName =
      this.endProp && parsePropertyId(this.endProp).type === 'note'
        ? parsePropertyId(this.endProp).name
        : null;
    await this.app.fileManager.processFrontMatter(ev.file, (fm: Record<string, unknown>) => {
      fm[dateName] = dateKey(newDate);
      if (newEnd && endName) fm[endName] = dateKey(newEnd);
    });
    ev.start = newDate;
    ev.dateKey = dateKey(newDate);
    ev.end = newEnd;
    if (!this.dragging) this.placeEvents();
  }

  private createNote(startDate: Date, endDate: Date | null) {
    const properties: Record<string, unknown> = {};
    if (this.dateProp && parsePropertyId(this.dateProp).type === 'note')
      properties[parsePropertyId(this.dateProp).name] = dateKey(startDate);
    if (endDate && this.endProp && parsePropertyId(this.endProp).type === 'note')
      properties[parsePropertyId(this.endProp).name] = dateKey(endDate);
    return createViewNote(this, `Note ${dateKey(startDate)}`, properties);
  }

  private loadData() {
    const groups = viewGroups(this);
    this.events = [];
    if (!groups?.length) return;

    this.grouped = false; // Calendar cards use a flat date layout regardless of native grouping.
    this.events = [];
    const dp = this.dateProp;
    const ep = this.endProp;
    const donePid = this.doneProp;

    for (const group of groups) {
      const gKey = group.hasKey() && group.key ? group.key.toString() : '';
      for (const entry of group.entries) {
        const file = entry.file;
        if (!(file instanceof TFile)) continue;
        if (!dp) continue;

        const val = entry.getValue(dp);
        if (!val) continue;

        const sd = new Date(val.toString() + 'T00:00:00');
        if (isNaN(sd.getTime())) continue;
        sd.setHours(0, 0, 0, 0);

        let ed: Date | null = null;
        if (ep) {
          const ev2 = entry.getValue(ep);
          if (ev2 && !(ev2 instanceof NullValue)) {
            const d2 = new Date(ev2.toString() + 'T00:00:00');
            if (!isNaN(d2.getTime())) {
              d2.setHours(0, 0, 0, 0);
              ed = d2;
            }
          }
        }

        let done = false;
        if (donePid) {
          const dv = entry.getValue(donePid);
          if (dv instanceof BooleanValue) done = dv.isTruthy();
        }

        this.events.push({
          id: file.path,
          title: file.basename,
          dateKey: dateKey(sd),
          start: sd,
          end: ed,
          file,
          entry,
          done,
          groupKey: gKey,
        });
      }
    }

    this.placeEvents();
  }
}
