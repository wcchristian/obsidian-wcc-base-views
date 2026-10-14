import type { BasesView, BasesPropertyId, BasesEntry, TFile } from 'obsidian';
import { Menu, Notice, NullValue, StringValue, parsePropertyId, setIcon } from 'obsidian';
import { viewProperty, propertyId } from './view-properties';
import { writeProp } from './frontmatter';

type Config = { get(key: string): unknown };
export function statusType(config: Config): 'checkbox' | 'status' | 'none' {
  const value = config.get('status_type');
  if (value === 'status' || value === 'checkbox' || value === 'none') return value;
  return 'checkbox';
}
export function statusProperty(config: Config): BasesPropertyId | null {
  if (statusType(config) !== 'status') return null;
  const pid = viewProperty(config, 'statusProperty') ?? 'note.status';
  return parsePropertyId(pid).type === 'note' ? pid : null;
}
export function checkboxProperty(config: Config): BasesPropertyId | null {
  if (statusType(config) !== 'checkbox') return null;
  const pid = viewProperty(config, 'doneProperty');
  return pid && parsePropertyId(pid).type === 'note' ? pid : null;
}
export function configuredStatuses(config: Config): string[] {
  const raw = config.get('statusValues');
  return [
    ...new Set(
      Array.isArray(raw)
        ? raw
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
    ),
  ];
}
export function groupProperty(config: Config): BasesPropertyId | null {
  const raw = config.get('groupBy') ?? (config as Config & { groupBy?: unknown }).groupBy;
  return propertyId(
    typeof raw === 'object' && raw ? (raw as { property?: unknown }).property : raw,
  );
}
export function statusChoices(view: Pick<BasesView, 'config' | 'data'>): string[] {
  const pid = statusProperty(view.config);
  const values = configuredStatuses(view.config);
  if (pid)
    for (const group of view.data.groupedData ?? [])
      for (const entry of group.entries) {
        const value = entry.getValue(pid);
        if (value && !(value instanceof NullValue) && value.toString())
          values.push(value.toString());
      }
  return [...new Set(values)];
}
/** Add configured empty groups only when this view groups by its status field. */
export function viewGroups(view: Pick<BasesView, 'config' | 'data'>) {
  let groups = [...(view.data.groupedData ?? [])].map((g) => ({
    hasKey: () => g.hasKey(),
    key: g.key,
    entries: [...g.entries],
  }));
  const pid = statusProperty(view.config);
  if (!pid || groupProperty(view.config) !== pid) return groups;
  groups = groups.filter((g) => g.entries.length || (g.hasKey() && g.key != null));
  const keys = new Set(
    groups.filter((g) => g.hasKey() && g.key != null).map((g) => g.key!.toString()),
  );
  for (const value of configuredStatuses(view.config))
    if (!keys.has(value)) {
      groups.push({ hasKey: () => true, key: new StringValue(value), entries: [] });
      keys.add(value);
    }
  return groups;
}
export function renderStatus(
  view: Pick<BasesView, 'app' | 'config' | 'data' | 'onDataUpdated'>,
  parent: HTMLElement,
  item: { file: TFile; entry?: BasesEntry; title?: string },
): boolean {
  const pid = statusProperty(view.config);
  if (!pid) return false;
  const cached = view.app.metadataCache.getFileCache(item.file)?.frontmatter?.[
    parsePropertyId(pid).name
  ] as unknown;
  const val = item.entry?.getValue(pid);
  let current =
    val && !(val instanceof NullValue) ? val.toString() : typeof cached === 'string' ? cached : '';
  const button = parent.createEl('button', {
    cls: 'wcc-status-pill',
    text: current || 'No status',
    attr: {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-label': `Change status for ${item.title ?? item.file.basename}`,
    },
  });
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    const choices = statusChoices(view);
    if (current && !choices.includes(current)) choices.push(current);
    for (const value of ['', ...choices])
      menu.addItem((i) =>
        i
          .setTitle(value || 'No status')
          .setChecked(value === current)
          .onClick(async () => {
            button.disabled = true;
            try {
              await writeProp(view.app, item.file, pid, value);
              current = value;
              button.textContent = value || 'No status';
            } catch (error) {
              console.error(error);
              new Notice('Failed to update status');
            } finally {
              button.disabled = false;
            }
          }),
      );
    menu.showAtMouseEvent(event);
  };
  return true;
}
export function isCollapsed(config: Config, key: string): boolean {
  const values = config.get('collapsedGroups');
  return Array.isArray(values) && values.includes(key);
}
export function collapseArrow(
  parent: HTMLElement,
  label: string,
  collapsed: boolean,
  toggle: () => void,
) {
  const button = parent.createEl('button', {
    cls: 'wcc-collapse-arrow',
    attr: {
      type: 'button',
      'aria-expanded': String(!collapsed),
      'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${label}`,
    },
  });
  setIcon(button, collapsed ? 'chevron-right' : 'chevron-down');
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };
  return button;
}
export function groupArrow(
  view: Pick<BasesView, 'config' | 'onDataUpdated'>,
  parent: HTMLElement,
  key: string,
) {
  const collapsed = isCollapsed(view.config, key);
  collapseArrow(parent, key || 'group', collapsed, () => {
    const raw = view.config.get('collapsedGroups');
    const values: string[] = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string')
      : [];
    view.config.set(
      'collapsedGroups',
      collapsed ? values.filter((v) => v !== key) : [...values, key],
    );
    view.onDataUpdated();
  });
  return collapsed;
}
