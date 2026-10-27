import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChartConfiguration } from 'chart.js';
import { switchMap } from 'rxjs';

import { DataService } from '../../data/data.service';
import { Airline, Airport, ModelFeature, Route } from '../../data/models';
import { ChartComponent, alpha, cssVar } from '../../shared/chart';
import { MONTHS, WEEKDAYS, fmt, hourLabel } from '../../shared/format';
import { Flight, calendar, predict } from './delay-model';

const FEATURE_LABELS: Record<ModelFeature, string> = {
  airline: 'Airline',
  origin: 'Origin airport',
  dest: 'Destination airport',
  month: 'Month',
  weekday: 'Day of the week',
  hour: 'Departure hour',
};

@Component({
  selector: 'app-predict',
  imports: [ChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './predict.html',
  styleUrl: './predict.css',
})
export class Predict {
  private readonly data = inject(DataService);
  protected readonly fmt = fmt;
  protected readonly hourLabel = hourLabel;

  protected readonly model = toSignal(this.data.model());
  protected readonly comparison = toSignal(this.data.comparison(), { initialValue: [] });
  // The choices come from the year the model was trained on, whatever year the header shows.
  protected readonly airlines = toSignal(
    this.data.model().pipe(switchMap((m) => this.data.of<Airline[]>('airlines', m.year))),
    {
      initialValue: [],
    },
  );
  private readonly airports = toSignal(
    this.data.model().pipe(switchMap((m) => this.data.of<Airport[]>('airports', m.year))),
    {
      initialValue: [],
    },
  );
  private readonly routes = toSignal(
    this.data.model().pipe(switchMap((m) => this.data.of<Route[]>('routes', m.year))),
    {
      initialValue: [],
    },
  );

  protected readonly airline = signal('');
  protected readonly origin = signal('');
  protected readonly dest = signal('');
  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly hour = signal(17);

  private readonly airportIndex = computed(() => new Map(this.airports().map((a) => [a.code, a])));

  protected readonly sortedAirlines = computed(() =>
    [...this.airlines()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly origins = computed(() =>
    this.airports()
      .filter((a) => a.departures)
      .map((a) => ({ code: a.code, label: `${a.code} — ${a.city ?? a.name ?? ''}` }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );

  /** Destinations served nonstop from the chosen origin. */
  protected readonly destinations = computed(() =>
    this.routes()
      .filter((r) => r.origin === this.origin())
      .map((r) => {
        const a = this.airportIndex().get(r.dest);
        return {
          code: r.dest,
          label: `${r.dest} — ${a?.city ?? a?.name ?? ''}`,
          airlines: r.airlines,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  );

  /** Whether the chosen airline flew the chosen route in the data. */
  protected readonly served = computed(
    () =>
      this.destinations()
        .find((d) => d.code === this.dest())
        ?.airlines.includes(this.airline()) ?? false,
  );

  protected readonly flight = computed<Flight | null>(() => {
    const day = new Date(`${this.date()}T12:00:00`);
    if (!this.airline() || !this.origin() || !this.dest() || isNaN(day.getTime())) return null;
    return {
      airline: this.airline(),
      origin: this.origin(),
      dest: this.dest(),
      hour: String(this.hour()),
      ...calendar(day),
    };
  });

  protected readonly prediction = computed(() => {
    const [m, f] = [this.model(), this.flight()];
    return m && f ? predict(m, f) : null;
  });

  protected readonly factors = computed(() => {
    const p = this.prediction();
    if (!p) return [];
    const max = Math.max(1, ...p.factors.map((f) => Math.abs(f.impact)));
    return p.factors.map((f) => ({
      ...f,
      label: FEATURE_LABELS[f.feature],
      text: this.describe(f.feature, f.value),
      width: (50 * Math.abs(f.impact)) / max,
    }));
  });

  protected readonly calibrationChart = computed<ChartConfiguration | null>(() => {
    const m = this.model();
    if (!m) return null;
    const accent = cssVar('--accent');
    const muted = cssVar('--muted');
    const top =
      Math.ceil(Math.max(...m.calibration.map((c) => Math.max(c.predicted, c.observed))) * 10) / 10;
    return {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Test flights, by tenth of predicted risk',
            data: m.calibration.map((c) => ({ x: 100 * c.predicted, y: 100 * c.observed })),
            borderColor: accent,
            backgroundColor: alpha(accent, 0.8),
            showLine: true,
            pointRadius: 4,
          },
          {
            label: 'Perfect calibration',
            data: [
              { x: 0, y: 0 },
              { x: 100 * top, y: 100 * top },
            ],
            borderColor: muted,
            borderDash: [4, 4],
            pointRadius: 0,
            showLine: true,
          },
        ],
      },
      options: {
        scales: {
          x: {
            min: 0,
            max: 100 * top,
            title: { display: true, text: 'predicted probability of a 15+ min delay (%)' },
          },
          y: {
            min: 0,
            max: 100 * top,
            title: { display: true, text: 'share actually delayed (%)' },
          },
        },
      },
    };
  });

  constructor() {
    // Start on the classic transcontinental route (or the busiest one) with its biggest airline.
    effect(() => {
      const routes = this.routes();
      const start = routes.find((r) => r.origin === 'JFK' && r.dest === 'LAX') ?? routes[0];
      if (start && !this.origin()) {
        this.origin.set(start.origin);
        this.dest.set(start.dest);
        this.airline.set(start.airlines[0]);
      }
    });
  }

  protected setOrigin(text: string): void {
    const code = text.trim().slice(0, 3).toUpperCase();
    if (!this.airportIndex().has(code)) return;
    this.origin.set(code);
    if (!this.destinations().some((d) => d.code === this.dest()))
      this.dest.set(this.destinations()[0]?.code ?? '');
  }

  protected originLabel(): string {
    return this.origins().find((o) => o.code === this.origin())?.label ?? this.origin();
  }

  private describe(feature: ModelFeature, value: string): string {
    switch (feature) {
      case 'airline':
        return this.airlines().find((a) => a.code === value)?.name ?? value;
      case 'month':
        return MONTHS[Number(value) - 1];
      case 'weekday':
        return WEEKDAYS[Number(value) - 1];
      case 'hour':
        return hourLabel(Number(value));
      default:
        return value;
    }
  }
}
