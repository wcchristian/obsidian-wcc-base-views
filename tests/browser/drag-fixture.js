import { BaseTableView } from '../../src/views/table/view';
import { BaseListView } from '../../src/views/list/view';
import { BaseCalendarView } from '../../src/views/calendar/view';
import { BaseKanbanView } from '../../src/views/kanban/view';
import { BaseTimelineView } from '../../src/views/timeline/view';
import { TFile, StringValue, NumberValue, BooleanValue, ListValue, NullValue } from 'obsidian';
import { PointerDrag, dragGrip, rememberScroll } from '../../src/shared/drag';
import { applyItemPadding } from '../../src/shared/view-spacing';
import { applyViewDensity } from '../../src/shared/view-density';
import { viewProperty } from '../../src/shared/view-properties';
window.rememberDragScroll = rememberScroll;

// Real renderers with populated and blank fields for density and visual checks.
window.setupDensity = (density) => {
  window.setupDrag('list');
  const app = view.app;
  const fixture = document.getElementById('fixture');
  fixture.empty();
  fixture.style.height = 'auto';
  fixture.style.display = 'grid';
  fixture.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))';
  fixture.style.gap = '16px';
  fixture.style.setProperty('--color-orange', '#e2a45f');
  const values = {
    density,
    colorProperty: 'project',
    colorValues: ['Datasite:orange'],
    checkboxColorProperty: 'priority',
    checkboxColorValues: ['high:#e85d5d'],
  };
  const order = [
    'note.date',
    'note.priority',
    'note.project',
    'note.section',
    'note.parent',
    'note.recurring',
  ];
  const config = {
    get: (key) => values[key],
    getOrder: () => ['file.name', ...order],
    getDisplayName: (pid) => pid.replace('note.', ''),
  };
  const items = [
    'Review the weekly project plan',
    'A longer task title that wraps naturally instead of reserving a large empty card for every task',
    'Send release notes',
  ].map((title, i) => {
    const fields = {
      'note.date': new StringValue('2026-10-09'),
      'note.priority': new StringValue(i === 1 ? '' : 'high'),
      'note.project': new StringValue('[[Projects/Datasite]]'),
      'note.section': new StringValue(''),
      'note.parent': new NullValue(),
      'note.recurring': new StringValue(i === 0 ? 'every friday' : ''),
    };
    return {
      id: `${i}.md`,
      title,
      done: false,
      file: new TFile(`${i}.md`),
      entry: { getValue: (pid) => fields[pid] },
      start: new Date(2026, 9, 9),
      end: null,
    };
  });
  for (const mode of ['List', 'Agenda', 'Calendar']) {
    const panel = fixture.createDiv();
    panel.createEl('h3', { text: `${mode} · ${density}` });
    const list = mode === 'List';
    const instance = Object.create((list ? BaseListView : BaseCalendarView).prototype);
    Object.assign(instance, {
      app,
      config,
      doneProp: 'note.done',
      dateProp: 'note.date',
      propOrder: order,
      mobileLayout: false,
      viewMode: mode === 'Agenda' ? 'agenda' : 'month',
    });
    instance.wrap = panel.createDiv(list ? 'wcc-list-wrap' : 'wcc-calendar-wrap');
    applyViewDensity(instance.wrap, config);
    let container;
    if (mode === 'Agenda') {
      instance.titleEl = instance.wrap.createDiv();
      instance.bodyEl = instance.wrap.createDiv('wcc-calendar-body-agenda');
      instance.curDate = new Date(2026, 9, 9);
      instance.agendaDays = 1;
      instance.days = [];
      instance.renderAgenda();
      container = instance.days[0].evList;
    } else container = instance.wrap.createDiv(list ? 'wcc-list-items' : 'wcc-calendar-evs');
    for (const item of items) {
      if (list) instance.makeRow(container, item, '(no value)');
      else instance.makeChip(container, item);
    }
  }
};

let view;
window.refreshTable = () => BaseTableView.prototype.onDataUpdated.call(view);
window.setupDrag = (mode) => {
  view?.pointerDrag.destroy();
  view?.columnDrag?.destroy();
  view?.columnDrop?.destroy();
  view?.resizeObserver?.disconnect();
  view?.rowObserver?.disconnect();
  view?.paneObserver?.disconnect();
  view?.dropIndicator?.destroy();
  document.querySelectorAll('.wcc-calendar-more-popover').forEach((el) => el.remove());
  const fixture = document.getElementById('fixture');
  fixture.empty();
  const state = (window.dragState = {
    writes: [],
    opens: [],
    links: [],
    notices: [],
    refreshes: 0,
    fail: false,
    menus: 0,
  });
  const files = Object.fromEntries(
    ['A', 'B', 'C'].map((name) => [name + '.md', new TFile(name + '.md')]),
  );
  const frontmatter = {
    'A.md': { order: 0, status: 'Todo', start: '2026-03-07', end: '2026-03-08' },
    'B.md': { order: 10, status: 'Todo' },
    'C.md': { order: 20, status: 'Done' },
  };
  state.frontmatter = frontmatter;
  const configValues = { groupBy: 'note.status', columnOrder: ['Todo', 'Hidden', 'Done'] };
  const config = {
    get: (key) => configValues[key],
    set: (key, value) => {
      if (key === 'order') throw Error('Column order is not a custom option');
      configValues[key] = value;
    },
    setOrder: (order) => {
      configValues.order = order;
    },
    getOrder: () => [],
    getDisplayName: (pid) => pid,
    getAsPropertyId: (key) => configValues[key] ?? null,
  };
  const app = {
    vault: { getFileByPath: (path) => files[path] },
    fileManager: {
      async processFrontMatter(file, fn) {
        if (state.fail) throw Error('Test save failure');
        if (state.holdSave) await new Promise((resolve) => (state.releaseSave = resolve));
        const fm = { ...frontmatter[file.path] };
        fn(fm);
        frontmatter[file.path] = fm;
        state.writes.push({ path: file.path, fm });
        await view.onDataUpdated();
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    },
    workspace: {
      getLeaf: () => ({ openFile: (file) => state.opens.push(file.path) }),
      openLinkText: (...args) => state.links.push(args),
      trigger() {},
    },
  };
  const plugin = {
    settings: { localOrder: {} },
    async saveSettings() {
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
  const View = {
    list: BaseListView,
    calendar: BaseCalendarView,
    kanban: BaseKanbanView,
    timeline: BaseTimelineView,
    table: BaseTableView,
  }[mode];
  view = new View({ app, config }, fixture, plugin);
  // Obsidian assigns configuration only after the view factory returns.
  view.config = config;
  const originalRefresh = view.onDataUpdated.bind(view);
  view.onDataUpdated = async () => {
    if (view.dragging || view.isDragging) return originalRefresh();
    state.refreshes++;
  };
  view.showContextMenu = view.showCardMenu = () => state.menus++;
  state.config = configValues;
  state.plugin = plugin.settings;
  const item = (id, status = 'Todo') => ({
    id: id + '.md',
    title: id,
    file: files[id + '.md'],
    done: false,
    entry: {
      getValue(pid) {
        const value = frontmatter[id + '.md'][pid.slice(5)];
        return typeof value === 'number'
          ? new NumberValue(value)
          : typeof value === 'boolean'
            ? new BooleanValue(value)
            : Array.isArray(value)
              ? new ListValue(value)
              : value
                ? new StringValue(value)
                : new NullValue();
      },
    },
    columnKey: status,
    subgroupKey: '',
    groupKey: '',
    start: new Date('2026-03-07T00:00:00'),
    end: new Date('2026-03-08T00:00:00'),
    dateKey: '2026-03-07',
  });
  view.data = {
    groupedData: [
      {
        hasKey: () => false,
        key: null,
        entries: ['A', 'B', 'C'].map((id) => ({ ...item(id).entry, file: files[id + '.md'] })),
      },
    ],
  };
  if (mode === 'list') {
    view.sortOrderProp = 'note.order';
    view.doneProp = null;
    for (const group of ['Todo', 'Done']) {
      const section = view.wrap.createDiv('wcc-list-group');
      section.createDiv({ cls: 'wcc-list-group-header', text: group });
      const list = section.createDiv('wcc-list-items');
      list.dataset.listGroup = group;
      for (const id of group === 'Todo' ? ['A', 'B'] : ['C'])
        view.makeRow(list, item(id, group), group);
    }
  } else if (mode === 'calendar') {
    view.dateProp = 'note.start';
    view.endProp = 'note.end';
    view.propOrder = [];
    view.grouped = false;
    view.events = [item('A'), item('B')];
    view.wrap.classList.add('fixture-calendar');
    view.days = ['2026-03-07', '2026-03-09'].map((date, i) => {
      const cell = view.wrap.createDiv('wcc-calendar-cell');
      cell.dataset.calendarDate = date;
      cell.createDiv({ text: date });
      const evList = cell.createDiv('wcc-calendar-evs');
      const day = {
        dateKey: date,
        date: new Date(date + 'T00:00:00'),
        cell,
        evList,
        events: i ? [] : view.events,
      };
      day.events.forEach((event) => view.makeChip(evList, event));
      return day;
    });
    state.openOverflow = () => view.openMorePopover(view.days[0], view.days[0].cell, false);
  } else if (mode === 'kanban') {
    view.dragCards = [item('A'), item('B'), item('C', 'Done')];
    const board = view.wrap.createDiv('wcc-kanban-board');
    for (const group of ['Todo', 'Done']) {
      const col = board.createDiv('wcc-kanban-col');
      col.dataset.colKey = group;
      col.dataset.subgroupKey = '';
      const header = col.createDiv('wcc-kanban-col-hdr');
      dragGrip(header);
      header.createSpan({ text: group });
      const body = col.createDiv('wcc-kanban-col-body');
      view.dragCards
        .filter((card) => card.columnKey === group)
        .forEach((card) => view.renderCard(body, card, '||' + group, null));
    }
  } else if (mode === 'table') {
    state.config.sortOrderProperty = 'order';
    view.sortOrderProp = 'note.order';
    view.config.getOrder = () =>
      window.dragState.config.order ?? ['file.name', 'note.project', 'note.order', 'note.flag'];
    view.data = {
      groupedData: ['Todo', 'Done'].map((group) => ({
        hasKey: () => true,
        key: new StringValue(group),
        entries: ['A', 'B', 'C']
          .filter((id) => (id === 'C' ? 'Done' : 'Todo') === group)
          .map((id) => ({ ...item(id).entry, file: files[id + '.md'] })),
      })),
    };
    view.buildList();
  } else {
    view.dateProp = 'note.start';
    view.endProp = 'note.end';
    view.windowStart = new Date('2026-03-01T00:00:00');
    view.zoomLevel = 'day';
    const row = item('A');
    row.isSingleDay = false;
    view.items = [row];
    const scroll = view.wrap.createDiv('wcc-timeline-scroll');
    const content = scroll.createDiv('fixture-track');
    const bar = content.createDiv('wcc-timeline-bar');
    bar.dataset.itemId = row.id;
    bar.style.cssText = 'left:100px;top:90px;width:60px';
    const left = bar.createDiv(
      'wcc-timeline-bar-handle wcc-timeline-bar-handle-left wcc-drag-grip',
    );
    left.title = 'Resize start';
    dragGrip(bar);
    bar.createSpan({ cls: 'wcc-timeline-bar-label', text: 'A' });
    const right = bar.createDiv(
      'wcc-timeline-bar-handle wcc-timeline-bar-handle-right wcc-drag-grip',
    );
    right.title = 'Resize end';
    bar.onclick = () => state.opens.push('A.md');
  }
  window.currentDragView = view;
  state.makeItem = item;
};

window.setupCompactCalendar = (mode = 'month', rolling = false) => {
  window.setupDrag('calendar');
  view.wrap.empty();
  view.wrap.classList.remove('fixture-calendar');
  view.curDate = new Date('2026-03-07T00:00:00');
  view.viewMode = mode;
  view.weekRolling = rolling;
  view.mobileLayout = view.useCompactLayout();
  window.dragState.config.detailsExpanded = true;
  view.propOrder = ['note.project', 'note.order'];
  window.dragState.frontmatter['A.md'].project = '[[Project|Work]]';
  view.events[0].title = 'Prepare project release notes';
  view.events[1].title = 'Review design updates';
  view.buildUI(view.wrap);
  const guardedRefresh = BaseCalendarView.prototype.onDataUpdated.bind(view);
  view.onDataUpdated = async () => {
    if (view.dragging) return guardedRefresh();
    window.dragState.refreshes++;
    view.render();
  };
};

window.setupCalendarDefault = async (mode) => {
  window.setupCompactCalendar();
  window.dragState.config.viewMode = mode;
  view.loadData = async () => view.render();
  view.onDataUpdated = BaseCalendarView.prototype.onDataUpdated.bind(view);
  await view.onDataUpdated();
};

window.setupLongTitles = (mode, padding) => {
  window.setupDrag(mode);
  if (mode === 'calendar') {
    window.setupCompactCalendar('week');
    view.events.forEach((event) => (event.end = null));
    view.render();
  }
  window.dragState.config.itemPadding = padding;
  applyItemPadding(view.wrap, view.config);
  const title =
    'A very long note name that should wrap across several lines without hiding any words '.repeat(
      3,
    ) + 'UnbrokenName'.repeat(8);
  if (mode === 'timeline') {
    view.wrap.empty();
    view.cols = Array.from({ length: 20 }, (_, i) => new Date(2026, 2, i + 1));
    view.windowEnd = new Date(2026, 2, 20);
    view.items[0].title = title;
    view.items[0].subtitle = 'A subtitle that also needs room';
    view.items.push({ ...view.items[0], id: 'B.md', title: 'Short note' });
    view.buildContent(view.wrap.createDiv('wcc-timeline-scroll'));
  } else {
    if (mode === 'calendar') {
      view.events[0].title = title;
      view.render();
      return;
    }
    const selector = {
      list: '.wcc-list-row-link',
      calendar: '.wcc-calendar-chip-link',
      kanban: '.wcc-kanban-card-link',
    }[mode];
    view.wrap.querySelector(selector).textContent = title;
  }
};

window.setupLongCalendarBars = () => {
  window.setupCompactCalendar('week');
  view.useCompactLayout = () => false;
  view.mobileLayout = false;
  view.events.forEach(
    (event, i) =>
      (event.title = ('A long calendar event name ' + 'UnbrokenName'.repeat(8)).repeat(i + 1)),
  );
  view.render();
};

window.installCompetingDrag = () => {
  window.dragState.competingStarts = 0;
  window.competingDrag = new PointerDrag(view.wrap, {
    items: '.wcc-calendar-chip',
    onStart() {
      window.dragState.competingStarts++;
    },
    onMove() {},
    async onDrop() {},
    onEnd() {},
    onError() {},
  });
};

window.setupCrowdedCalendar = (expand = false) => {
  window.setupCompactCalendar('month');
  view.useCompactLayout = () => false;
  view.mobileLayout = false;
  view.monthExpand = expand;
  const original = view.events[0];
  view.events = Array.from({ length: 7 }, (_, i) => ({
    ...original,
    id: `${String.fromCharCode(65 + i)}.md`,
    title:
      i === 0
        ? 'A long calendar note title that wraps and still leaves its properties readable'
        : `Event ${i + 1}`,
    end: null,
  }));
  view.render();
};

window.setupViewFields = (mode) => {
  window.setupDrag(mode);
  const state = window.dragState;
  // This scenario explicitly exercises editing blanks in the expanded layout.
  state.config.density = 'comfortable';
  state.config.detailsExpanded = true;
  state.config.hideEmptyProperties = false;
  Object.assign(state.frontmatter['A.md'], {
    project: '[[Project|Work]]',
    flag: false,
    tags: ['[[Project|Work]]'],
  });
  state.config.doneProperty = 'newCompletion';
  view.doneProp = viewProperty(view.config, 'doneProperty');
  view.config.getOrder = () => [
    'note.project',
    'note.order',
    'note.empty',
    'note.flag',
    'note.tags',
    'file.flag',
  ];
  if (mode === 'calendar') {
    view.wrap.empty();
    view.wrap.classList.remove('fixture-calendar');
    view.viewMode = 'week';
    view.curDate = new Date(2026, 2, 7);
    view.mobileLayout = view.useCompactLayout();
    view.events.forEach((event) => (event.end = null));
    view.propOrder = view.config.getOrder();
    view.buildUI(view.wrap);
  } else if (mode === 'list') {
    view.wrap.empty();
    const list = view.wrap.createDiv('wcc-list-ungrouped');
    list.dataset.listGroup = 'Todo';
    view.makeRow(list, state.makeItem('A'), 'Todo');
  } else if (mode === 'kanban') {
    const body = view.wrap.querySelector('.wcc-kanban-col-body');
    body.empty();
    view.renderCard(body, view.dragCards[0], '||Todo', view.doneProp);
  } else if (mode === 'table') {
    view.doneProp = null;
    view.config.getOrder = () =>
      state.config.order ?? [
        'file.name',
        'note.project',
        'note.order',
        'note.empty',
        'note.flag',
        'note.tags',
        'file.flag',
      ];
    view.wrap.empty();
    view.buildList();
  } else {
    state.config.mobileLayout = false;
    view.wrap.empty();
    view.cols = Array.from({ length: 20 }, (_, i) => new Date(2026, 2, i + 1));
    view.windowEnd = new Date(2026, 2, 20);
    view.subtitleProp = 'note.empty';
    view.items.push(state.makeItem('B'));
    view.buildContent(view.wrap.createDiv('wcc-timeline-scroll'));
  }
};

window.setupCardSurface = (mode) => {
  window.setupDrag(mode);
  const state = window.dragState;
  for (const name of ['A.md', 'B.md', 'C.md']) {
    Object.assign(state.frontmatter[name], { project: '[[Project|Work]]', done: false });
  }
  state.config.detailsExpanded = true;
  state.config.colorProperty = 'project';
  state.config.colorValues = ['Project:#e2a45f'];
  view.doneProp = 'note.done';
  view.config.getOrder = () => ['note.project'];
  view.propOrder = ['note.project'];
  view.viewMode = 'agenda'; // Show metadata while exercising calendar-card drag targets.
  if (mode === 'list') {
    view.wrap.empty();
    for (const group of ['Todo', 'Done']) {
      const section = view.wrap.createDiv('wcc-list-group');
      const list = section.createDiv('wcc-list-items');
      list.dataset.listGroup = group;
      for (const id of group === 'Todo' ? ['A', 'B'] : ['C']) {
        view.makeRow(list, state.makeItem(id, group), group);
      }
    }
  } else {
    for (const day of view.days) {
      day.evList.empty();
      for (const event of day.events) view.makeChip(day.evList, event);
    }
  }
};

window.setupTimelineDefault = async (mode) => {
  window.setupDrag('timeline');
  window.dragState.config.zoomLevel = mode;
  view.buildUI = (container) => {
    view.renderToolbar(container);
    view.windowStart = new Date(2026, 2, 1);
    view.windowEnd = new Date(2026, 2, 20);
    view.updateToolbarTitle();
  };
  view.onDataUpdated = BaseTimelineView.prototype.onDataUpdated.bind(view);
  await view.onDataUpdated();
};

window.setupMobileTimeline = () => {
  window.setupViewFields('timeline');
  window.dragState.config.mobileLayout = true;
  view.items[0].title = 'Prepare project release notes and follow up with the design team';
  view.items[0].groupKey = 'Work';
  view.items[1].groupKey = 'Personal';
  view.data = {
    groupedData: view.items.map((item) => ({
      hasKey: () => true,
      key: new StringValue(item.groupKey),
      entries: [{ ...item.entry, file: item.file }],
    })),
  };
  view.config.getOrder = () => ['note.project', 'note.order'];
  view.wrap.empty();
  view.buildContent(view.wrap.createDiv('wcc-timeline-scroll'));
};

window.setupUngroupedTable = (initial = false) => {
  window.setupViewFields('table');
  view.data = {
    groupedData: [
      {
        hasKey: () => false,
        key: new NullValue(),
        entries: view.data.groupedData.flatMap((group) => group.entries),
      },
    ],
  };
  view.data.groupedData[0].entries[0].file.basename =
    'Investigate agents, RAG, and next steps for the portal integration';
  view.allProperties = [
    'file.name',
    'note.project',
    'note.order',
    'note.flag',
    'note.tags',
    'formula.summary',
  ];
  if (initial) {
    window.dragState.config.order = ['file.name'];
    view.config.getOrder = () => window.dragState.config.order;
  }
  view.wrap.empty();
  view.buildList();
};
