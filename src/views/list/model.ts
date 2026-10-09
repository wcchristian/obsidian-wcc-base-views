import type { TFile, BasesEntry } from 'obsidian';

export interface ListItem {
  id: string;
  title: string;
  file: TFile;
  entry: BasesEntry;
  done: boolean;
}
