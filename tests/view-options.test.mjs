import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';
const api = await loadModule('src/config/view-options.ts');
const values = {};
const config = { get: (key) => values[key] };
const fields = (options) =>
  Object.fromEntries(options.flatMap((group) => group.items).map((option) => [option.key, option]));
const visible = (option) => !option.shouldHide?.();
for (const kind of ['calendar', 'list', 'table', 'kanban', 'timeline']) {
  const groups = api[`${kind}Options`](config);
  assert.deepEqual(
    groups.map((g) => g.displayName),
    ['Setup', 'Appearance', 'Advanced'],
  );
  const options = fields(groups);
  values.status_type = 'checkbox';
  assert.ok(visible(options.doneProperty));
  assert.ok(!visible(options.statusProperty));
  assert.ok(!visible(options.statusValues));
  values.status_type = 'status';
  assert.ok(!visible(options.doneProperty));
  assert.ok(visible(options.statusProperty));
  assert.ok(visible(options.statusValues));
  assert.ok(!visible(options.checkboxColorProperty));
  assert.ok(!visible(options.checkboxColorValues));
  delete values.bgImage;
  assert.ok(visible(options.bgImage));
  for (const key of ['bgFit', 'bgBlur', 'bgOpacity']) assert.ok(!visible(options[key]));
  values.bgImage = 'background.png';
  for (const key of ['bgFit', 'bgBlur', 'bgOpacity']) assert.ok(visible(options[key]));
  if (kind === 'kanban') {
    assert.ok(!visible(options.showEmptyColumns));
    for (const key of ['columnOrder', 'hiddenColumns', 'collapsedColumns', 'hiddenSubgroups'])
      assert.ok(!visible(options[key]));
  }
}
const calendar = fields(api.calendarOptions(config));
values.viewMode = 'month';
values.monthExpand = false;
assert.ok(visible(calendar.maxPerDay));
assert.ok(!visible(calendar.agendaDays));
assert.ok(!visible(calendar.weekDays));
values.monthExpand = true;
assert.ok(!visible(calendar.maxPerDay));
values.viewMode = 'week';
assert.ok(visible(calendar.weekDays));
assert.ok(visible(calendar.weekRolling));
assert.ok(!visible(calendar.monthExpand));
values.viewMode = 'agenda';
assert.ok(visible(calendar.agendaDays));
assert.ok(!visible(calendar.weekDays));
const timeline = fields(api.timelineOptions(config));
for (const [zoom, active] of [
  ['day', 'daysVisible'],
  ['week', 'weeksVisible'],
  ['month', 'monthsVisible'],
]) {
  values.zoomLevel = zoom;
  for (const key of ['daysVisible', 'weeksVisible', 'monthsVisible'])
    assert.equal(visible(timeline[key]), key === active);
}
const other = fields(
  api.calendarOptions({ get: (key) => (key === 'status_type' ? 'checkbox' : undefined) }),
);
assert.ok(visible(other.doneProperty), 'one view does not inherit another view’s visibility');
assert.ok(!visible(other.statusProperty));
console.log(
  'Conditional settings follow each view’s task mode, image, calendar layout, and timeline zoom.',
);
