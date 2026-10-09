import type { CalEvent, DayInfo, WeekInfo } from './model';
import { calendarDay } from '../../shared/drag-dates';

export interface EventSegment {
  ev: CalEvent;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
}

/** Partition events without touching DOM state. Multi-day ends are inclusive. */
export function distributeEvents(
  events: readonly CalEvent[],
  days: readonly DayInfo[],
  weeks: readonly WeekInfo[],
  agenda: boolean,
) {
  const singleDayByDate = new Map<string, CalEvent[]>();
  const multiByWeek: EventSegment[][] = weeks.map(() => []);
  const add = (key: string, event: CalEvent) => {
    const list = singleDayByDate.get(key) ?? [];
    list.push(event);
    singleDayByDate.set(key, list);
  };
  for (const event of events) {
    const start = event.start.getTime();
    const end = event.end?.getTime() ?? start;
    if (end <= start) {
      add(event.dateKey, event);
      continue;
    }
    if (agenda) {
      for (const day of days) {
        const time = day.date.getTime();
        if (time >= start && time <= end) add(day.dateKey, event);
      }
      continue;
    }
    weeks.forEach((week, index) => {
      if (!week.days.length) return;
      const weekStart = week.days[0].date.getTime();
      const weekEnd = week.days[week.days.length - 1].date.getTime();
      if (end < weekStart || start > weekEnd) return;
      multiByWeek[index].push({
        ev: event,
        startCol:
          calendarDay(new Date(Math.max(start, weekStart))) - calendarDay(new Date(weekStart)),
        endCol: calendarDay(new Date(Math.min(end, weekEnd))) - calendarDay(new Date(weekStart)),
        isStart: start >= weekStart,
        isEnd: end <= weekEnd,
      });
    });
  }
  return { singleDayByDate, multiByWeek };
}

/** Longer segments with the same start occupy earlier lanes. */
export function sortSegments(segments: readonly EventSegment[]): EventSegment[] {
  return [...segments].sort(
    (a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol),
  );
}

/** Inclusive column bounds cannot share a lane when they touch. */
export function assignLanes(segments: readonly EventSegment[]) {
  const ends: number[] = [];
  const assignments = segments.map((segment) => {
    let lane = 0;
    while (lane < ends.length && ends[lane] >= segment.startCol) lane++;
    ends[lane] = segment.endCol;
    return lane;
  });
  return { assignments, laneCount: ends.length };
}
