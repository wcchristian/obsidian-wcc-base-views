import type { BasesAllOptions, BasesOptions } from 'obsidian';
import { propertyOption } from '../shared/view-properties';
import { itemPaddingOption } from '../shared/view-spacing';
import { densityOptions } from '../shared/view-density';
import { statusType } from '../shared/status';

type Config = { get(key: string): unknown };
type Kind = 'calendar' | 'kanban' | 'timeline' | 'list' | 'table';
const emptyConfig: Config = { get: () => undefined };

/** Each menu captures its own view config; visibility follows the current selections. */
function options(kind: Kind, config: Config): BasesAllOptions[] {
  const status = () => statusType(config) === 'status';
  const blank = (key: string) => !config.get(key);
  const mode = () => config.get('viewMode') || 'month';
  const zoom = () => config.get('zoomLevel') || 'week';
  const setup: BasesOptions[] = [
    {
      type: 'dropdown',
      displayName: 'Task control',
      key: 'status_type',
      default: 'checkbox',
      options: { checkbox: 'Checkbox', status: 'Status' },
    },
    { ...propertyOption('Checkbox property', 'doneProperty'), default: 'done', shouldHide: status },
    {
      ...propertyOption('Status property', 'statusProperty'),
      default: 'status',
      shouldHide: () => !status(),
    },
    {
      type: 'multitext',
      displayName: kind === 'calendar' ? 'Extra status choices' : 'Keep empty statuses',
      key: 'statusValues',
      default: [],
      shouldHide: () => !status(),
    },
  ];
  const appearance: BasesOptions[] = [];
  const advanced: BasesOptions[] = [];
  if (kind === 'calendar' || kind === 'timeline') {
    setup.push(
      propertyOption(kind === 'timeline' ? 'Start date property' : 'Date property', 'dateProperty'),
      propertyOption('End date property (optional)', 'endDateProperty'),
    );
  }
  if (kind === 'calendar') {
    setup.push({
      type: 'dropdown',
      displayName: 'Calendar layout',
      key: 'viewMode',
      default: 'month',
      options: { month: 'Month', week: 'Week', agenda: 'Agenda' },
    });
  }
  if (kind === 'timeline') {
    setup.push({
      type: 'dropdown',
      displayName: 'Timeline zoom',
      key: 'zoomLevel',
      default: 'week',
      options: { day: 'Day', week: 'Week', month: 'Month' },
    });
  }
  if (kind === 'list' || kind === 'calendar') {
    appearance.push(
      ...densityOptions().map((option) => ({
        ...option,
        displayName: option.key === 'density' ? 'Card spacing' : option.displayName,
      })),
    );
  } else if (kind !== 'table') {
    appearance.push({
      type: 'toggle',
      displayName: 'Expand details by default',
      key: 'detailsExpanded',
      default: true,
    });
  }
  appearance.push(propertyOption('Color cards by', 'colorProperty'));
  advanced.push(
    propertyOption('Manual order property (number)', 'sortOrderProperty'),
    { ...itemPaddingOption, displayName: 'Custom padding' },
    {
      type: 'multitext',
      displayName: 'Custom colors (value:color)',
      key: 'colorValues',
      default: [],
      shouldHide: () => blank('colorProperty'),
    },
    {
      ...propertyOption('Color checkboxes by', 'checkboxColorProperty'),
      shouldHide: () => status() || kind === 'table',
    },
    {
      type: 'multitext',
      displayName: 'Checkbox colors (value:color)',
      key: 'checkboxColorValues',
      default: [],
      shouldHide: () => status() || kind === 'table' || blank('checkboxColorProperty'),
    },
    {
      type: 'text',
      displayName: 'Background image',
      key: 'bgImage',
      placeholder: 'Image URL or vault path',
    },
    {
      type: 'dropdown',
      displayName: 'Image fit',
      key: 'bgFit',
      default: 'cover',
      options: { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' },
      shouldHide: () => blank('bgImage'),
    },
    {
      type: 'slider',
      displayName: 'Image blur',
      key: 'bgBlur',
      default: 0,
      min: 0,
      max: 20,
      step: 1,
      shouldHide: () => blank('bgImage'),
    },
    {
      type: 'slider',
      displayName: 'Image opacity',
      key: 'bgOpacity',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.05,
      shouldHide: () => blank('bgImage'),
    },
  );
  if (kind === 'calendar') {
    advanced.push(
      {
        type: 'toggle',
        displayName: 'Expand month rows to fit events',
        key: 'monthExpand',
        default: false,
        shouldHide: () => mode() !== 'month',
      },
      {
        type: 'slider',
        displayName: 'Events before showing more',
        key: 'maxPerDay',
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        shouldHide: () => mode() !== 'month' || config.get('monthExpand') === true,
      },
      {
        type: 'slider',
        displayName: 'Agenda days',
        key: 'agendaDays',
        default: 30,
        min: 1,
        max: 30,
        step: 1,
        shouldHide: () => mode() !== 'agenda',
      },
      {
        type: 'slider',
        displayName: 'Week days',
        key: 'weekDays',
        default: 7,
        min: 1,
        max: 10,
        step: 1,
        shouldHide: () => mode() !== 'week',
      },
      {
        type: 'toggle',
        displayName: 'Start the week on today',
        key: 'weekRolling',
        default: false,
        shouldHide: () => mode() !== 'week',
      },
    );
  }
  if (kind === 'kanban') {
    advanced.push(
      propertyOption('Swimlane property (optional)', 'subgroupProperty'),
      propertyOption('Card title property (optional)', 'cardTitleProperty'),
      propertyOption('Cover image property (optional)', 'coverImageProperty'),
      {
        type: 'toggle',
        displayName: 'Show empty columns',
        key: 'showEmptyColumns',
        default: true,
        shouldHide: status,
      },
      {
        type: 'multitext',
        displayName: 'Column colors (value:color)',
        key: 'columnColors',
        default: [],
      },
      {
        type: 'dropdown',
        displayName: 'Column color style',
        key: 'columnColorMode',
        default: 'header',
        options: {
          header: 'Header accent',
          column: 'Whole column',
          both: 'Header and card border',
        },
      },
      // Keep existing state registered, while drag, arrow, and restore controls own its UI.
      ...['columnOrder', 'hiddenColumns', 'collapsedColumns', 'hiddenSubgroups'].map((key) => ({
        type: 'multitext' as const,
        displayName: key,
        key,
        default: [],
        shouldHide: () => true,
      })),
    );
  }
  if (kind === 'timeline') {
    advanced.push(
      propertyOption('Subtitle property (optional)', 'subtitleProperty'),
      {
        type: 'slider',
        displayName: 'Title column width',
        key: 'labelWidth',
        default: 200,
        min: 120,
        max: 600,
        step: 10,
      },
      { type: 'toggle', displayName: 'Adapt to narrow panes', key: 'mobileLayout', default: true },
      {
        type: 'slider',
        displayName: 'Visible days',
        key: 'daysVisible',
        default: 30,
        min: 7,
        max: 120,
        step: 1,
        shouldHide: () => zoom() !== 'day',
      },
      {
        type: 'slider',
        displayName: 'Visible weeks',
        key: 'weeksVisible',
        default: 12,
        min: 4,
        max: 52,
        step: 1,
        shouldHide: () => zoom() !== 'week',
      },
      {
        type: 'slider',
        displayName: 'Visible months',
        key: 'monthsVisible',
        default: 6,
        min: 3,
        max: 24,
        step: 1,
        shouldHide: () => zoom() !== 'month',
      },
    );
  }
  return [
    { type: 'group', displayName: 'Setup', items: setup },
    { type: 'group', displayName: 'Appearance', items: appearance },
    { type: 'group', displayName: 'Advanced', items: advanced },
  ];
}
export function calendarOptions(config: Config = emptyConfig) {
  return options('calendar', config);
}
export function kanbanOptions(config: Config = emptyConfig) {
  return options('kanban', config);
}
export function timelineOptions(config: Config = emptyConfig) {
  return options('timeline', config);
}
export function listOptions(config: Config = emptyConfig) {
  return options('list', config);
}
export function tableOptions(config: Config = emptyConfig) {
  return options('table', config);
}
