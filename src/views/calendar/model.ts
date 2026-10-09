import type { TFile, BasesEntry } from 'obsidian';

export type ViewMode = 'month' | 'week' | 'agenda';

export interface CalEvent {
  id: string;
  title: string;
  dateKey: string;
  start: Date;
  end: Date | null;
  file: TFile;
  entry: BasesEntry;
  done: boolean;
  groupKey: string;
}

export interface DayInfo {
  dateKey: string;
  date: Date;
  weekIdx: number;
  colIdx: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalEvent[];
  cell: HTMLElement | null;
  numEl: HTMLElement | null;
  evList: HTMLElement | null;
}

export interface WeekInfo {
  days: DayInfo[];
  overlay: HTMLElement | null;
}
