import type { TFile, BasesEntry } from 'obsidian';

export type ZoomLevel = 'day' | 'week' | 'month';

export interface TimelineItem {
  id: string;
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  isSingleDay: boolean;
  done: boolean;
  color: string | null;
  groupKey: string;
  sortOrder: number;
  file: TFile;
  entry: BasesEntry;
}
