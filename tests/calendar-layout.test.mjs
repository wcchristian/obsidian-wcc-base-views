import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers.mjs';
process.env.TZ = 'America/Chicago';
const { distributeEvents, sortSegments, assignLanes } = await loadModule(
  'src/views/calendar/layout.ts',
);
const date = (text) => new Date(`${text}T00:00:00`);
const day = (text) => ({ date: date(text), dateKey: text });
const weeks = [
  { days: ['2026-03-07', '2026-03-08'].map(day) },
  { days: ['2026-03-09', '2026-03-10'].map(day) },
];
const days = weeks.flatMap((week) => week.days);
const event = (id, start, end = null) => ({
  id,
  dateKey: start,
  start: date(start),
  end: end ? date(end) : null,
});

test('multi-day segments clip to visible weeks and remain aligned across DST', () => {
  const events = [
    event('span', '2026-03-06', '2026-03-09'),
    event('single', '2026-03-08'),
    event('outside', '2026-03-11', '2026-03-12'),
  ];
  const layout = distributeEvents(events, days, weeks, false);
  assert.deepEqual(
    layout.singleDayByDate.get('2026-03-08').map((value) => value.id),
    ['single'],
  );
  assert.deepEqual(
    layout.multiByWeek.map((segments) =>
      segments.map(({ startCol, endCol, isStart, isEnd }) => ({
        startCol,
        endCol,
        isStart,
        isEnd,
      })),
    ),
    [
      [{ startCol: 0, endCol: 1, isStart: false, isEnd: false }],
      [{ startCol: 0, endCol: 0, isStart: false, isEnd: true }],
    ],
  );
});

test('agenda repeats multi-day events through their inclusive end and keeps input order', () => {
  const layout = distributeEvents(
    [event('span', '2026-03-07', '2026-03-09'), event('single', '2026-03-08')],
    days,
    weeks,
    true,
  );
  assert.deepEqual(
    layout.singleDayByDate.get('2026-03-08').map((value) => value.id),
    ['span', 'single'],
  );
  assert.deepEqual(
    layout.singleDayByDate.get('2026-03-09').map((value) => value.id),
    ['span'],
  );
  assert.equal(layout.singleDayByDate.has('2026-03-10'), false);
  assert.deepEqual(layout.multiByWeek, [[], []]);
});

test('overlapping inclusive bounds use separate lanes; later segments reuse free lanes', () => {
  const segments = [
    { startCol: 0, endCol: 1 },
    { startCol: 0, endCol: 2 },
    { startCol: 2, endCol: 3 },
    { startCol: 4, endCol: 5 },
  ];
  const sorted = sortSegments(segments);
  assert.equal(sorted[0], segments[1], 'longer event comes first at the same start');
  assert.deepEqual(assignLanes(sorted), { assignments: [0, 1, 1, 0], laneCount: 2 });
  assert.equal(segments[0].endCol, 1, 'sorting does not mutate the input array');
  assert.deepEqual(distributeEvents([], [], [], false).multiByWeek, []);
});
