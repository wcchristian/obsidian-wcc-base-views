import type { BasesAllOptions } from 'obsidian';
import { propertyOption } from '../shared/view-properties';
import { itemPaddingOption } from '../shared/view-spacing';
import { densityOptions } from '../shared/view-density';

/** Fresh option objects keep view configuration independent. */
function appearanceOptions(density = false): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Spacing',
      items: [...(density ? densityOptions() : []), { ...itemPaddingOption }],
    },
    {
      type: 'group',
      displayName: 'Color',
      items: [
        propertyOption('Color by property', 'colorProperty'),
        {
          type: 'multitext',
          displayName: 'Value colors (value:color)',
          key: 'colorValues',
          default: [],
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Checkbox color',
      items: [
        propertyOption('Color checkbox by property', 'checkboxColorProperty'),
        {
          type: 'multitext',
          displayName: 'Checkbox value colors (value:color)',
          key: 'checkboxColorValues',
          default: [],
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Background image',
      items: [
        {
          type: 'text',
          displayName: 'Image URL or vault path',
          key: 'bgImage',
          placeholder: 'https://... or path/to/image.png',
        },
        {
          type: 'dropdown',
          displayName: 'Fit',
          key: 'bgFit',
          default: 'cover',
          options: { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' },
        },
        {
          type: 'slider',
          displayName: 'Blur',
          key: 'bgBlur',
          default: 0,
          min: 0,
          max: 20,
          step: 1,
        },
        {
          type: 'slider',
          displayName: 'Opacity',
          key: 'bgOpacity',
          default: 0.3,
          min: 0,
          max: 1,
          step: 0.05,
        },
      ],
    },
  ];
}

export function calendarOptions(): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Properties',
      items: [
        propertyOption('Date property', 'dateProperty'),
        propertyOption('End date property', 'endDateProperty'),
        propertyOption('Done property', 'doneProperty'),
        propertyOption('Sort order property', 'sortOrderProperty'),
      ],
    },
    {
      type: 'group',
      displayName: 'Display',
      items: [
        {
          type: 'dropdown',
          displayName: 'Default view',
          key: 'viewMode',
          default: 'month',
          options: { month: 'Month', week: 'Week', agenda: 'Agenda' },
        },
        {
          type: 'slider',
          displayName: 'Max events per day (month view)',
          key: 'maxPerDay',
          default: 3,
          min: 1,
          max: 10,
          step: 1,
        },
        {
          type: 'toggle',
          displayName: 'Expand month rows (month view)',
          key: 'monthExpand',
          default: false,
        },
        {
          type: 'slider',
          displayName: 'Agenda day count (agenda view)',
          key: 'agendaDays',
          default: 30,
          min: 1,
          max: 30,
          step: 1,
        },
        {
          type: 'slider',
          displayName: 'Days per week (week view)',
          key: 'weekDays',
          default: 7,
          min: 1,
          max: 10,
          step: 1,
        },
        {
          type: 'toggle',
          displayName: 'Rolling week (week view)',
          key: 'weekRolling',
          default: false,
        },
      ],
    },
    ...appearanceOptions(true),
  ];
}

export function kanbanOptions(): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Properties',
      items: [
        propertyOption('Sub-group by', 'subgroupProperty'),
        propertyOption('Sort order property', 'sortOrderProperty'),
        propertyOption('Card title property', 'cardTitleProperty'),
        propertyOption('Done property', 'doneProperty'),
        propertyOption('Cover image property', 'coverImageProperty'),
      ],
    },
    {
      type: 'group',
      displayName: 'Layout',
      items: [
        {
          type: 'toggle',
          displayName: 'Show empty columns',
          key: 'showEmptyColumns',
          default: true,
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Column order',
      items: [
        {
          type: 'multitext',
          displayName: 'Column order',
          key: 'columnOrder',
          default: [],
        },
        {
          type: 'multitext',
          displayName: 'Hidden columns',
          key: 'hiddenColumns',
          default: [],
        },
        {
          type: 'multitext',
          displayName: 'Collapsed columns',
          key: 'collapsedColumns',
          default: [],
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Sub-groups',
      items: [
        {
          type: 'multitext',
          displayName: 'Hidden sub-groups',
          key: 'hiddenSubgroups',
          default: [],
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Color',
      items: [
        propertyOption('Card color by property', 'colorProperty'),
        {
          type: 'multitext',
          displayName: 'Card value colors (value:color)',
          key: 'colorValues',
          default: [],
        },
        {
          type: 'multitext',
          displayName: 'Column colors (value:color)',
          key: 'columnColors',
          default: [],
        },
        {
          type: 'dropdown',
          displayName: 'Apply color to',
          key: 'columnColorMode',
          default: 'header',
          options: {
            header: 'Header accent',
            column: 'Whole column',
            both: 'Header + card border',
          },
        },
      ],
    },
    ...appearanceOptions().filter(
      (option) => option.type !== 'group' || option.displayName !== 'Color',
    ),
  ];
}

export function timelineOptions(): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Properties',
      items: [
        propertyOption('Start date', 'dateProperty'),
        propertyOption('End date', 'endDateProperty'),
        propertyOption('Done', 'doneProperty'),
        propertyOption('Subtitle', 'subtitleProperty'),
        propertyOption('Sort order property', 'sortOrderProperty'),
      ],
    },
    {
      type: 'group',
      displayName: 'Spacing',
      items: [
        { ...itemPaddingOption },
        {
          type: 'slider',
          displayName: 'Title column width (px)',
          key: 'labelWidth',
          default: 200,
          min: 120,
          max: 600,
          step: 10,
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Mobile',
      items: [
        {
          type: 'toggle',
          displayName: 'Stack details above timeline in narrow panes',
          key: 'mobileLayout',
          default: true,
        },
      ],
    },
    {
      type: 'group',
      displayName: 'Display',
      items: [
        {
          type: 'dropdown',
          displayName: 'Default zoom level',
          key: 'zoomLevel',
          default: 'week',
          options: { day: 'Day', week: 'Week', month: 'Month' },
        },
        {
          type: 'slider',
          displayName: 'Days visible (day zoom)',
          key: 'daysVisible',
          default: 30,
          min: 7,
          max: 120,
          step: 1,
        },
        {
          type: 'slider',
          displayName: 'Weeks visible (week zoom)',
          key: 'weeksVisible',
          default: 12,
          min: 4,
          max: 52,
          step: 1,
        },
        {
          type: 'slider',
          displayName: 'Months visible (month zoom)',
          key: 'monthsVisible',
          default: 6,
          min: 3,
          max: 24,
          step: 1,
        },
      ],
    },
    ...appearanceOptions().filter(
      (option) => option.type !== 'group' || option.displayName !== 'Spacing',
    ),
  ];
}

export function listOptions(): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Properties',
      items: [
        propertyOption('Done property', 'doneProperty'),
        propertyOption('Sort order property', 'sortOrderProperty'),
      ],
    },
    ...appearanceOptions(true),
  ];
}

export function tableOptions(): BasesAllOptions[] {
  return [
    {
      type: 'group',
      displayName: 'Properties',
      items: [propertyOption('Sort order property', 'sortOrderProperty')],
    },
    ...appearanceOptions(),
  ];
}
