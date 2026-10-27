import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { DataService } from '../../data/data.service';
import { Airport, Route } from '../../data/models';
import { AirportMap, MapRoute } from '../../shared/airport-map';
import { fmt, tone } from '../../shared/format';

/** "JFK — New York, NY" or "jfk" to "JFK". */
const codeOf = (text: string) => text.trim().slice(0, 3).toUpperCase();

@Component({
  selector: 'app-routes',
  imports: [AirportMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './routes.html',
  styleUrl: './routes.css',
})
export class RouteExplorer {
  protected readonly data = inject(DataService);
  protected readonly fmt = fmt;
  protected readonly tone = tone;

  private readonly summary = toSignal(this.data.summary());
  private readonly airports = toSignal(this.data.airports(), { initialValue: [] });
  private readonly routes = toSignal(this.data.routes(), { initialValue: [] });
  private readonly airlines = toSignal(this.data.airlines(), { initialValue: [] });
  private readonly otherRoutes = toSignal(
    toObservable(this.data.otherYear).pipe(
      switchMap((y) => (y ? this.data.of<Route[]>('routes', y) : of([]))),
    ),
    { initialValue: [] },
  );

  protected readonly originText = signal('');
  protected readonly destText = signal('');

  private readonly airportIndex = computed(() => new Map(this.airports().map((a) => [a.code, a])));
  private readonly routeIndex = computed(
    () => new Map(this.routes().map((r) => [`${r.origin}-${r.dest}`, r])),
  );
  private readonly airlineNames = computed(
    () => new Map(this.airlines().map((a) => [a.code, a.name])),
  );

  protected readonly options = computed(() =>
    this.airports()
      .filter((a) => a.departures)
      .map((a) => `${a.code} — ${a.city ?? a.name ?? ''}`)
      .sort(),
  );

  protected readonly origin = computed(
    () => this.airportIndex().get(codeOf(this.originText())) ?? null,
  );
  protected readonly dest = computed(
    () => this.airportIndex().get(codeOf(this.destText())) ?? null,
  );

  protected readonly route = computed<Route | null>(() => {
    const [o, d] = [this.origin(), this.dest()];
    return o && d ? (this.routeIndex().get(`${o.code}-${d.code}`) ?? null) : null;
  });

  /** The same route in the year we compare with, if it was flown. */
  protected readonly then = computed(() => {
    const r = this.route();
    return r
      ? (this.otherRoutes().find((x) => x.origin === r.origin && x.dest === r.dest) ?? null)
      : null;
  });

  protected readonly reverse = computed(() => {
    const r = this.route();
    return r ? (this.routeIndex().get(`${r.dest}-${r.origin}`) ?? null) : null;
  });

  /** The most punctual airline among those with at least 5% of the route's flights, when there is a choice. */
  protected readonly bestAirline = computed(() => {
    const r = this.route();
    if (!r || r.byAirline.length < 2) return null;
    const candidates = r.byAirline.filter((a) => a.flights >= 0.05 * r.flights);
    const best = candidates.reduce((a, b) => (b.onTimePct > a.onTimePct ? b : a), candidates[0]);
    const worst = candidates.reduce((a, b) => (b.onTimePct < a.onTimePct ? b : a), candidates[0]);
    return best && best !== worst
      ? { ...best, name: this.airlineName(best.airline), gap: best.onTimePct - worst.onTimePct }
      : null;
  });

  /** Where one can fly from the chosen origin, busiest first. */
  protected readonly destinations = computed(() => {
    const o = this.origin();
    if (!o) return [];
    return this.routes()
      .filter((r) => r.origin === o.code)
      .slice(0, 16)
      .map((r) => ({ route: r, airport: this.airportIndex().get(r.dest) }));
  });

  protected readonly flight = computed<MapRoute | null>(() => {
    const [o, d] = [this.origin(), this.dest()];
    return o && d && this.route() ? { from: o, to: d } : null;
  });

  protected readonly mapAirports = computed<Airport[]>(() => {
    const o = this.origin();
    return this.flight()
      ? []
      : o
        ? [o, ...this.destinations().flatMap((x) => (x.airport ? [x.airport] : []))]
        : [];
  });

  protected readonly mapRoutes = computed<MapRoute[]>(() => {
    const o = this.origin();
    if (!o || this.flight()) return [];
    const top = this.destinations()[0]?.route.flights ?? 1;
    return this.destinations().flatMap((x) =>
      x.airport ? [{ from: o, to: x.airport, weight: x.route.flights / top }] : [],
    );
  });

  protected readonly national = computed(() => this.summary());

  protected airlineName(code: string): string {
    return this.airlineNames().get(code) ?? code;
  }

  constructor() {
    // Start on the classic transcontinental route, or the busiest one if it is missing.
    effect(() => {
      const routes = this.routes();
      const start = routes.find((r) => r.origin === 'JFK' && r.dest === 'LAX') ?? routes[0];
      if (start && !this.originText() && !this.destText()) {
        this.originText.set(start.origin);
        this.destText.set(start.dest);
      }
    });
  }

  protected swap(): void {
    const [o, d] = [this.originText(), this.destText()];
    this.originText.set(d);
    this.destText.set(o);
  }

  protected pick(dest: string): void {
    this.destText.set(dest);
  }

  protected label(a: Airport | null): string {
    return a ? `${a.code} — ${a.city ?? a.name ?? ''}` : '';
  }
}
