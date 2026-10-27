import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { of, switchMap } from 'rxjs';

import { DataService } from '../../data/data.service';
import { MonthRow } from '../../data/models';
import { AirportMap, MapRoute } from '../../shared/airport-map';
import { ChartComponent, alpha, cssVar, outcomeColors } from '../../shared/chart';
import { MONTHS, fmt } from '../../shared/format';
import { Kpi } from '../../shared/kpi';

@Component({
  selector: 'app-overview',
  imports: [Kpi, ChartComponent, AirportMap, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class Overview {
  protected readonly data = inject(DataService);
  protected readonly fmt = fmt;

  protected readonly summary = toSignal(this.data.summary());
  private readonly months = toSignal(this.data.months());
  private readonly otherMonths = toSignal(
    toObservable(this.data.otherYear).pipe(
      switchMap((y) => (y ? this.data.of<MonthRow[]>('months', y) : of(null))),
    ),
  );
  protected readonly airports = toSignal(this.data.airports(), { initialValue: [] });
  private readonly routes = toSignal(this.data.routes(), { initialValue: [] });
  private readonly airlines = toSignal(this.data.airlines(), { initialValue: [] });
  private readonly aircraft = toSignal(this.data.aircraft(), { initialValue: [] });

  /** The summary of the year to compare with. */
  protected readonly other = computed(
    () => this.data.years().find((y) => y.year === this.data.otherYear()) ?? null,
  );

  /** "+2.1 pts vs 2013", for a share in percent. */
  protected delta(key: 'onTimePct' | 'delayedPct' | 'cancelledPct' | 'divertedPct'): string {
    const [s, o] = [this.summary(), this.other()];
    return s && o ? `${fmt.points(s[key] - o[key])} vs ${o.year}` : '';
  }

  protected readonly flightsDelta = computed(() => {
    const [s, o] = [this.summary(), this.other()];
    if (!s || !o) return '';
    const change = (100 * (s.flights - o.flights)) / o.flights;
    return `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}% vs ${o.year}`;
  });

  protected readonly delayDelta = computed(() => {
    const [s, o] = [this.summary(), this.other()];
    return s && o
      ? `${fmt.minutes(s.avgArrDelay - o.avgArrDelay)} vs ${o.year}`
      : 'early arrivals count as negative';
  });

  protected readonly outcomes = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const colors = outcomeColors();
    return [
      { label: 'On time', pct: s.onTimePct, color: colors[0] },
      { label: 'Delayed 15+ min', pct: s.delayedPct, color: colors[1] },
      { label: 'Cancelled', pct: s.cancelledPct, color: colors[2] },
      { label: 'Diverted', pct: s.divertedPct, color: colors[3] },
    ];
  });

  /** Flights of the chosen year as bars, on-time rate of both years as lines. */
  protected readonly monthChart = computed<ChartConfiguration | null>(() => {
    const [rows, other, year, otherYear] = [
      this.months(),
      this.otherMonths(),
      this.data.year(),
      this.data.otherYear(),
    ];
    if (!rows?.length) return null;
    const accent = cssVar('--accent');
    const ontime = cssVar('--ontime');
    const muted = cssVar('--muted');
    const datasets: ChartConfiguration['data']['datasets'] = [
      {
        type: 'bar',
        label: `Flights ${year}`,
        data: rows.map((r) => r.flights),
        backgroundColor: alpha(accent, 0.35),
        borderRadius: 4,
        yAxisID: 'y',
        order: 3,
      },
      {
        type: 'line',
        label: `On time ${year} (%)`,
        data: rows.map((r) => r.onTimePct),
        borderColor: ontime,
        backgroundColor: ontime,
        borderWidth: 2.5,
        pointRadius: 3,
        yAxisID: 'y1',
        order: 1,
      },
    ];
    if (other) {
      datasets.push({
        type: 'line',
        label: `On time ${otherYear} (%)`,
        data: other.map((r) => r.onTimePct),
        borderColor: muted,
        backgroundColor: muted,
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 2,
        yAxisID: 'y1',
        order: 2,
      });
    }
    return {
      type: 'bar',
      data: { labels: rows.map((r) => MONTHS[r.month - 1]), datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => fmt.compact(Number(v)) } },
          y1: {
            position: 'right',
            min: 50,
            max: 100,
            grid: { display: false },
            ticks: { callback: (v) => `${v}%` },
          },
        },
      },
    } as ChartConfiguration;
  });

  /** The busiest routes, as arcs whose width grows with traffic. */
  protected readonly mapRoutes = computed<MapRoute[]>(() => {
    const index = new Map(this.airports().map((a) => [a.code, a]));
    const top = this.routes()
      .filter((r) => r.origin < r.dest)
      .slice(0, 80);
    const busiest = top[0]?.flights ?? 1;
    return top.flatMap((r) => {
      const [from, to] = [index.get(r.origin), index.get(r.dest)];
      return from && to ? [{ from, to, weight: r.flights / busiest }] : [];
    });
  });

  protected readonly facts = computed(() => {
    const routes = this.routes();
    const airports = this.airports();
    const airlines = this.airlines();
    const aircraft = this.aircraft();
    if (!routes.length || !airports.length || !airlines.length) return [];
    const daily = routes.filter((r) => r.flights >= 365);
    const busiestAirport = airports[0];
    const longest = routes.reduce((a, b) => (b.distance > a.distance ? b : a));
    const punctual = [...airlines].sort((a, b) => b.onTimePct - a.onTimePct);
    const [first, last] = [punctual[0], punctual[punctual.length - 1]];
    const worstRoute = daily.length
      ? daily.reduce((a, b) => (b.onTimePct < a.onTimePct ? b : a))
      : null;
    return [
      {
        title: 'Busiest route',
        value: `${routes[0].origin} → ${routes[0].dest}`,
        note: `${fmt.int(routes[0].flights)} flights, ${fmt.pct(routes[0].onTimePct)} on time`,
      },
      {
        title: 'Busiest airport',
        value: busiestAirport.code,
        note: `${busiestAirport.city}: ${fmt.int(busiestAirport.departures)} departures`,
      },
      {
        title: 'Longest route',
        value: `${longest.origin} → ${longest.dest}`,
        note: fmt.miles(longest.distance),
      },
      {
        title: 'Most punctual airline',
        value: first.name,
        note: `${fmt.pct(first.onTimePct)} on time; the least is ${last.name} (${fmt.pct(last.onTimePct)})`,
      },
      {
        title: 'Least punctual daily route',
        value: worstRoute ? `${worstRoute.origin} → ${worstRoute.dest}` : '–',
        note: worstRoute
          ? `${fmt.pct(worstRoute.onTimePct)} on time over ${fmt.int(worstRoute.flights)} flights`
          : '',
      },
      {
        title: 'Hardest-working aircraft',
        value: aircraft[0]?.tail ?? '–',
        note: aircraft[0]
          ? `${fmt.int(aircraft[0].flights)} flights and ${fmt.int(aircraft[0].miles)} miles with ${aircraft[0].airline}`
          : '',
      },
    ];
  });
}
