import type { TFile, BasesEntry } from 'obsidian';

export interface KanbanCard {
  id: string;
  title: string;
  file: TFile;
  entry: BasesEntry;
  columnKey: string;
  subgroupKey: string;
  done: boolean;
}
