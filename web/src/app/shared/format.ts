/** Number formatting shared by the pages. */

const integer = new Intl.NumberFormat('en-US');
const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const fmt = {
  int: (n: number | null | undefined) => (n == null ? '–' : integer.format(Math.round(n))),
  compact: (n: number | null | undefined) => (n == null ? '–' : compactNumber.format(n)),
  pct: (n: number | null | undefined, digits = 1) => (n == null ? '–' : `${n.toFixed(digits)}%`),
  minutes: (n: number | null | undefined) =>
    n == null ? '–' : `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(1)} min`,
  miles: (n: number | null | undefined) =>
    n == null
      ? '–'
      : `${integer.format(Math.round(n))} mi · ${integer.format(Math.round(n * 1.609344))} km`,
  points: (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)} pts`,
};

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Green at or above `good`, amber in between, red at or below `bad`. */
export function tone(value: number | null, good: number, bad: number): string {
  if (value == null) return '';
  return value >= good ? 'tone-good' : value <= bad ? 'tone-bad' : 'tone-warn';
}
