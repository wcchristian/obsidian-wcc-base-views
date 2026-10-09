import type { BasesAllOptions, BasesView, QueryController } from 'obsidian';
import type BaseViewsPlugin from '../main';
import { BaseCalendarView, VIEW_TYPE_BASE_CALENDAR } from '../views/calendar/view';
import { BaseKanbanView, VIEW_TYPE_BASE_KANBAN } from '../views/kanban/view';
import { BaseTimelineView, VIEW_TYPE_BASE_TIMELINE } from '../views/timeline/view';
import { BaseListView, VIEW_TYPE_BASE_LIST } from '../views/list/view';
import { BaseTableView, VIEW_TYPE_BASE_TABLE } from '../views/table/view';
import {
  calendarOptions,
  kanbanOptions,
  timelineOptions,
  listOptions,
  tableOptions,
} from './view-options';
import type { ViewSettingKey } from './settings';

export interface ViewDefinition {
  id: string;
  name: string;
  icon: string;
  setting: ViewSettingKey;
  description: string;
  create(controller: QueryController, container: HTMLElement, plugin: BaseViewsPlugin): BasesView;
  options(): BasesAllOptions[];
}

/** Registration and settings use the same metadata so names cannot drift. */
export const VIEW_DEFINITIONS: readonly ViewDefinition[] = [
  {
    id: VIEW_TYPE_BASE_CALENDAR,
    name: 'WCC - Calendar',
    icon: 'calendar',
    setting: 'enableCalendar',
    description: 'Month, week, and agenda layouts for date-based notes.',
    create: (ctrl, el, plugin) => new BaseCalendarView(ctrl, el, plugin),
    options: calendarOptions,
  },
  {
    id: VIEW_TYPE_BASE_KANBAN,
    name: 'WCC - Kanban',
    icon: 'columns-3',
    setting: 'enableKanban',
    description: 'Cards grouped into columns and optional swimlanes.',
    create: (ctrl, el, plugin) => new BaseKanbanView(ctrl, el, plugin),
    options: kanbanOptions,
  },
  {
    id: VIEW_TYPE_BASE_TIMELINE,
    name: 'WCC - Timeline',
    icon: 'gantt-chart',
    setting: 'enableTimeline',
    description: 'Date ranges with movable and resizable bars.',
    create: (ctrl, el, plugin) => new BaseTimelineView(ctrl, el, plugin),
    options: timelineOptions,
  },
  {
    id: VIEW_TYPE_BASE_LIST,
    name: 'WCC - List',
    icon: 'list',
    setting: 'enableList',
    description: 'Flat or grouped lists with inline property editing.',
    create: (ctrl, el, plugin) => new BaseListView(ctrl, el, plugin),
    options: listOptions,
  },
  {
    id: VIEW_TYPE_BASE_TABLE,
    name: 'WCC - Table',
    icon: 'table',
    setting: 'enableTable',
    description: 'Editable property columns with resizing and reordering.',
    create: (ctrl, el, plugin) => new BaseTableView(ctrl, el, plugin),
    options: tableOptions,
  },
];
