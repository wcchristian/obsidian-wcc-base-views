import type { QueryController } from 'obsidian';
import { BasesView } from 'obsidian';

export class DisabledView extends BasesView {
  readonly type: string;

  constructor(controller: QueryController, container: HTMLElement, id: string, name: string) {
    super(controller);
    this.type = id;
    container.createDiv({
      cls: 'wcc-disabled-view',
      text: `${name} is disabled. Enable it in WCC Base Views settings.`,
    });
  }

  async onDataUpdated(): Promise<void> {}
}
