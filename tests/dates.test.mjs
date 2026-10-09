import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
process.env.TZ = 'America/Chicago';
const { calendarDay, shiftDays, dateKey } = await loadModule('src/shared/drag-dates.ts');

test('shifting across spring and fall DST retains the local date and hour', () => {
  for (const text of ['2026-03-08T00:00:00', '2026-11-01T00:00:00']) {
    const start = new Date(text);
    const shifted = shiftDays(start, 1);
    assert.equal(calendarDay(shifted) - calendarDay(start), 1);
    assert.equal(shifted.getHours(), 0);
    assert.equal(start.toISOString(), new Date(text).toISOString(), 'input is not mutated');
    assert.notEqual(shifted - start, 86400000, 'fixture crosses a DST clock change');
  }
});

test('date keys and day shifts handle leap days and year boundaries', () => {
  assert.equal(dateKey(shiftDays(new Date(2024, 1, 28), 1)), '2024-02-29');
  assert.equal(dateKey(shiftDays(new Date(2026, 11, 31), 1)), '2027-01-01');
  assert.equal(dateKey(shiftDays(new Date(2026, 0, 1), -1)), '2025-12-31');
});

class Modal {
  open() {
    this.onOpen();
  }
  close() {
    this.onClose();
  }
}
const { DatePromptModal } = await loadModule('src/shared/date-prompt.ts', { Modal });
test('date dialog dismissal resolves even when the host closes during opening', async () => {
  const modal = new DatePromptModal({}, new Date(), 'Choose date');
  modal.onOpen = () => modal.close();
  assert.equal(await modal.open(), null);
});
