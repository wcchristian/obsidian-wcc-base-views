import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import { dateKey } from './drag-dates';

/** Resolves once on submit or dismissal; the resolver exists before onOpen. */
export class DatePromptModal extends Modal {
  private resolvePromise: ((d: Date | null) => void) | null = null;

  constructor(
    app: App,
    private initial: Date,
    private modalTitle: string,
  ) {
    super(app);
  }

  prompt(): Promise<Date | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      super.open();
    });
  }

  onClose() {
    this.resolvePromise?.(null);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl).setName(this.modalTitle).setHeading();
    const input = contentEl.createEl('input', { type: 'date' });
    input.value = dateKey(this.initial);
    input.addClass('wcc-date-prompt-input');
    input.focus();
    const submit = () => {
      if (!input.value) return;
      const d = new Date(input.value + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      this.resolvePromise?.(d);
      this.resolvePromise = null;
      this.close();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
    btnRow.addClass('wcc-date-prompt-buttons');
    const ok = btnRow.createEl('button', { text: 'OK', cls: 'mod-cta' });
    ok.onclick = submit;
    const cancel = btnRow.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => this.close();
  }
}
