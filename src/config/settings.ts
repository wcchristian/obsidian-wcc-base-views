export type ViewSettingKey =
  | 'enableCalendar'
  | 'enableKanban'
  | 'enableTimeline'
  | 'enableList'
  | 'enableTable';

export interface BaseViewsSettings extends Record<ViewSettingKey, boolean> {
  localOrder: Record<string, string[]>;
  /** Retired capture profiles are retained for recovery, never executed. */
  quickAddProfiles?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate disk data and return fresh collections for each plugin instance. */
export function migrateSettings(value: unknown): BaseViewsSettings {
  const raw = isRecord(value) ? value : {};
  const order = isRecord(raw.localOrder) ? raw.localOrder : {};
  const localOrder = Object.fromEntries(
    Object.entries(order)
      .filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((path) => typeof path === 'string'),
      )
      .map(([key, paths]) => [key, [...paths]]),
  );
  const settings: BaseViewsSettings = {
    enableCalendar: raw.enableCalendar !== false,
    enableKanban: raw.enableKanban !== false,
    enableTimeline: raw.enableTimeline !== false,
    enableList: raw.enableList !== false,
    enableTable: raw.enableTable !== false,
    localOrder,
  };
  if (Array.isArray(raw.quickAddProfiles))
    settings.quickAddProfiles = [...(raw.quickAddProfiles as unknown[])];
  return settings;
}
