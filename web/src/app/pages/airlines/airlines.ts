import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChartConfiguration } from 'chart.js';

import { DataService } from '../../data/data.service';
import { Airline } from '../../data/models';
import { ChartComponent, outcomeColors } from '../../shared/chart';
import { fmt, tone } from '../../shared/format';

type SortKey = keyof Pick<
  Airline,
  | 'name'
  | 'flights'
  | 'flightsPerDay'
  | 'onTimePct'
  | 'delayedPct'
  | 'cancelledPct'
  | 'divertedPct'
  | 'avgArrDelay'
  | 'routes'
  | 'aircraft'
>;

@Component({
  selector: 'app-airlines',
  imports: [ChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './airlines.html',
  styleUrl: './airlines.css',
})
export class Airlines {
  protected readonly fmt = fmt;
  protected readonly tone = tone;
  private readonly airlines = toSignal(inject(DataService).airlines(), { initialValue: [] });

  protected readonly columns: { key: SortKey; label: string; num: boolean }[] = [
    { key: 'name', label: 'Airline', num: false },
    { key: 'flights', label: 'Flights', num: true },
    { key: 'flightsPerDay', label: 'Per day', num: true },
    { key: 'onTimePct', label: 'On time', num: true },
    { key: 'delayedPct', label: 'Delayed', num: true },
    { key: 'cancelledPct', label: 'Cancelled', num: true },
    { key: 'divertedPct', label: 'Diverted', num: true },
    { key: 'avgArrDelay', label: 'Mean delay', num: true },
    { key: 'routes', label: 'Routes', num: true },
    { key: 'aircraft', label: 'Aircraft', num: true },
  ];
  protected readonly sortKey = signal<SortKey>('flights');
  protected readonly descending = signal(true);

  protected readonly sorted = computed(() => {
    const key = this.sortKey();
    const sign = this.descending() ? -1 : 1;
    return [...this.airlines()].sort((a, b) => {
      const [x, y] = [a[key], b[key]];
      return (
        sign *
        (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number))
      );
    });
  });

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.descending.update((d) => !d);
    else {
      this.sortKey.set(key);
      this.descending.set(key !== 'name');
    }
  }

  /** Every airline's flights split by outcome, most punctual first. */
  protected readonly outcomeChart = computed<ChartConfiguration | null>(() => {
    const rows = [...this.airlines()].sort((a, b) => b.onTimePct - a.onTimePct);
    if (!rows.length) return null;
    const colors = outcomeColors();
    const series: { label: string; key: keyof Airline }[] = [
      { label: 'On time', key: 'onTimePct' },
      { label: 'Delayed', key: 'delayedPct' },
      { label: 'Cancelled', key: 'cancelledPct' },
      { label: 'Diverted', key: 'divertedPct' },
    ];
    return {
      type: 'bar',
      data: {
        labels: rows.map((a) => a.name),
        datasets: series.map((s, i) => ({
          label: s.label,
          data: rows.map((a) => a[s.key] as number),
          backgroundColor: colors[i],
          stack: 'all',
        })),
      },
      options: {
        indexAxis: 'y',
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } },
          y: { stacked: true, grid: { display: false } },
        },
      },
    };
  });

  protected readonly chartHeight = computed(
    () => `${Math.max(240, 28 * this.airlines().length + 60)}px`,
  );
}
