import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { FeatureCollection } from 'geojson';
import { Observable, filter, shareReplay, switchMap } from 'rxjs';

import {
  Aircraft,
  Airline,
  Airport,
  DelayModel,
  Disruptions,
  HistogramBucket,
  HourRow,
  ModelResult,
  MonthRow,
  Route,
  Summary,
  WeekdayRow,
  YearSummary,
} from './models';

/** Loads the precomputed tables, once each, for the year chosen in the header. */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<unknown>>();

  /** Every year in the data with its summary, oldest first. */
  readonly years = toSignal(this.get<YearSummary[]>('years'), { initialValue: [] });

  private readonly chosen = signal<number | null>(null);
  /** The year shown by the dashboard: the latest one until another is chosen. */
  readonly year = computed(() => this.chosen() ?? this.years().at(-1)?.year ?? null);
  /** The year to compare with: the other one, or the previous one when there are more. */
  readonly otherYear = computed(() => {
    const years = this.years().map((y) => y.year);
    const i = years.indexOf(this.year() ?? NaN);
    return i < 0 || years.length < 2 ? null : years[i > 0 ? i - 1 : 1];
  });

  private readonly year$ = toObservable(this.year).pipe(filter((y): y is number => y != null));

  select(year: number): void {
    this.chosen.set(year);
  }

  private get<T>(path: string): Observable<T> {
    let table = this.cache.get(path);
    if (!table) {
      table = this.http.get<T>(`data/${path}.json`).pipe(shareReplay(1));
      this.cache.set(path, table);
    }
    return table as Observable<T>;
  }

  /** A table of the chosen year, emitted again whenever the year changes. */
  private current<T>(name: string): Observable<T> {
    return this.year$.pipe(switchMap((year) => this.get<T>(`${year}/${name}`)));
  }

  /** A table of a given year. */
  of<T>(name: string, year: number): Observable<T> {
    return this.get<T>(`${year}/${name}`);
  }

  summary = () => this.current<Summary>('summary');
  months = () => this.current<MonthRow[]>('months');
  weekdays = () => this.current<WeekdayRow[]>('weekdays');
  hours = () => this.current<HourRow[]>('hours');
  histogram = () => this.current<HistogramBucket[]>('delay_histogram');
  disruptions = () => this.current<Disruptions>('disruptions');
  airlines = () => this.current<Airline[]>('airlines');
  airports = () => this.current<Airport[]>('airports');
  routes = () => this.current<Route[]>('routes');
  aircraft = () => this.current<Aircraft[]>('aircraft');
  /** The delay model, trained on the latest year. */
  model = () => this.get<DelayModel>('model');
  /** The same test set scored by richer models (pipeline: ModelComparison). */
  comparison = () => this.get<ModelResult[]>('model_comparison');

  /** US states and neighbouring countries (Natural Earth, public domain) for the map. */
  basemap = () => {
    this.cache.set(
      'basemap',
      this.cache.get('basemap') ?? this.http.get('geo/basemap.json').pipe(shareReplay(1)),
    );
    return this.cache.get('basemap') as Observable<FeatureCollection>;
  };
}
