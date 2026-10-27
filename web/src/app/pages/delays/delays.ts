import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChartConfiguration } from 'chart.js';

import { DataService } from '../../data/data.service';
import { Performance } from '../../data/models';
import { ChartComponent, alpha, cssVar, outcomeColors } from '../../shared/chart';
import { MONTHS, WEEKDAYS, fmt, hourLabel, tone } from '../../shared/format';

const CAUSE_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#06b6d4', '#a855f7'];

/** Delayed, cancelled and diverted shares as stacked bars, with the mean arrival delay as a line. */
function outcomeBars(labels: string[], rows: Performance[]): ChartConfiguration {
  const [, delayed, cancelled, diverted] = outcomeColors();
  const muted = cssVar('--text');
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Delayed 15+ min (%)',
          data: rows.map((r) => r.delayedPct),
          backgroundColor: delayed,
          stack: 's',
          yAxisID: 'y',
        },
        {
          label: 'Cancelled (%)',
          data: rows.map((r) => r.cancelledPct),
          backgroundColor: cancelled,
          stack: 's',
          yAxisID: 'y',
        },
        {
          label: 'Diverted (%)',
          data: rows.map((r) => r.divertedPct),
          backgroundColor: diverted,
          stack: 's',
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Mean arrival delay (min)',
          data: rows.map((r) => r.avgArrDelay),
          borderColor: muted,
          backgroundColor: muted,
          pointRadius: 2,
          borderWidth: 1.5,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => `${v}%` } },
        y1: { position: 'right', grid: { display: false }, ticks: { callback: (v) => `${v} min` } },
      },
    },
  } as ChartConfiguration;
}

@Component({
  selector: 'app-delays',
  imports: [ChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delays.html',
  styleUrl: './delays.css',
})
export class Delays {
  private readonly data = inject(DataService);
  protected readonly fmt = fmt;
  protected readonly tone = tone;
  protected readonly causeColors = CAUSE_COLORS;

  private readonly summary = toSignal(this.data.summary());
  private readonly hours = toSignal(this.data.hours());
  private readonly weekdays = toSignal(this.data.weekdays());
  private readonly months = toSignal(this.data.months());
  private readonly histogram = toSignal(this.data.histogram());
  protected readonly disruptions = toSignal(this.data.disruptions());
  private readonly airports = toSignal(this.data.airports(), { initialValue: [] });
  private readonly routes = toSignal(this.data.routes(), { initialValue: [] });

  protected readonly hourChart = computed(() => {
    const rows = this.hours();
    return rows
      ? outcomeBars(
          rows.map((r) => hourLabel(r.hour)),
          rows,
        )
      : null;
  });

  protected readonly weekdayChart = computed(() => {
    const rows = this.weekdays();
    return rows
      ? outcomeBars(
          rows.map((r) => WEEKDAYS[r.weekday - 1].slice(0, 3)),
          rows,
        )
      : null;
  });

  protected readonly monthChart = computed(() => {
    const rows = this.months();
    return rows
      ? outcomeBars(
          rows.map((r) => MONTHS[r.month - 1]),
          rows,
        )
      : null;
  });

  protected readonly histogramChart = computed<ChartConfiguration | null>(() => {
    const rows = this.histogram();
    if (!rows) return null;
    const [ontime, delayed, cancelled] = outcomeColors();
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: 'Flights (%)',
            data: rows.map((r) => r.pct),
            backgroundColor: rows.map((r) =>
              r.bucket <= 3 ? ontime : r.bucket <= 5 ? delayed : cancelled,
            ),
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: 'arrival delay (minutes)' },
          },
          y: { ticks: { callback: (v) => `${v}%` } },
        },
      },
    };
  });

  protected readonly causeChart = computed<ChartConfiguration | null>(() => {
    const d = this.disruptions();
    if (!d) return null;
    return {
      type: 'doughnut',
      data: {
        labels: d.delayCauses.map((c) => c.cause),
        datasets: [
          { data: d.delayCauses.map((c) => c.pct), backgroundColor: CAUSE_COLORS, borderWidth: 0 },
        ],
      },
      options: { cutout: '62%', plugins: { legend: { display: false } } },
    };
  });

  protected readonly cancellationChart = computed<ChartConfiguration | null>(() => {
    const d = this.disruptions();
    if (!d) return null;
    const accent = cssVar('--cancelled');
    return {
      type: 'bar',
      data: {
        labels: d.cancellationReasons.map((r) => r.reason),
        datasets: [
          {
            label: 'Cancellations (%)',
            data: d.cancellationReasons.map((r) => r.pct),
            backgroundColor: alpha(accent, 0.8),
          },
        ],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => `${v}%` } }, y: { grid: { display: false } } },
      },
    };
  });

  /** The 50 busiest airports, ranked by on-time departures. */
  protected readonly airportRanking = computed(() => {
    const big = this.airports()
      .filter((a) => a.departures)
      .slice(0, 50);
    const sorted = [...big].sort(
      (a, b) => (b.onTimeDeparturePct ?? 0) - (a.onTimeDeparturePct ?? 0),
    );
    return { best: sorted.slice(0, 6), worst: sorted.slice(-6).reverse() };
  });

  /** Routes flown at least once a day on average, ranked by on-time arrivals. */
  protected readonly routeRanking = computed(() => {
    const s = this.summary();
    if (!s) return null;
    const days = (Date.parse(s.lastDate) - Date.parse(s.firstDate)) / 86_400_000 + 1;
    const daily = this.routes().filter((r) => r.flights >= days);
    const sorted = [...daily].sort((a, b) => b.onTimePct - a.onTimePct);
    return { count: daily.length, best: sorted.slice(0, 6), worst: sorted.slice(-6).reverse() };
  });
}
