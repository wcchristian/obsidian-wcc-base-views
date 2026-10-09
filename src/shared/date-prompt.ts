import type { App } from 'obsidian';
import { Modal } from 'obsidian';
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

  open(): Promise<Date | null> {
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
    contentEl.createEl('h3', { text: this.modalTitle });
    const input = contentEl.createEl('input', { type: 'date' });
    input.value = dateKey(this.initial);
    input.style.width = '100%';
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
    btnRow.style.marginTop = '12px';
    const ok = btnRow.createEl('button', { text: 'OK', cls: 'mod-cta' });
    ok.onclick = submit;
    const cancel = btnRow.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => this.close();
  }
}
