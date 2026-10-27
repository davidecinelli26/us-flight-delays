/** The shapes of the JSON files written by the Spark pipeline into public/data. */

/** How the scheduled flights of a group ended; the four shares add up to 100. */
export interface Performance {
  flights: number;
  onTimePct: number;
  delayedPct: number;
  cancelledPct: number;
  divertedPct: number;
  /** Mean arrival delay in minutes of the flights that landed (negative = early). */
  avgArrDelay: number;
}

export interface Summary extends Performance {
  firstDate: string;
  lastDate: string;
  avgDelayWhenLate: number;
  airlines: number;
  airports: number;
  routes: number;
  aircraft: number;
  miles: number;
}

export interface YearSummary extends Summary {
  year: number;
}

export interface MonthRow extends Performance {
  month: number;
}

export interface WeekdayRow extends Performance {
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
}

export interface HourRow extends Performance {
  /** Scheduled departure hour, local time. */
  hour: number;
}

export interface HistogramBucket {
  bucket: number;
  label: string;
  flights: number;
  pct: number;
}

export interface Disruptions {
  delayCauses: { cause: string; minutes: number; pct: number; flights: number }[];
  cancellationReasons: { reason: string; flights: number; pct: number }[];
  diversions: {
    flights: number;
    reachedDestination: number;
    reachedDestinationPct: number;
    landings: { landings: number; flights: number }[];
  };
}

export interface Airline extends Performance {
  code: string;
  name: string;
  flightsPerDay: number;
  avgDepDelay: number;
  routes: number;
  aircraft: number;
}

export interface Airport {
  code: string;
  name: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  departures: number | null;
  arrivals: number | null;
  onTimeDeparturePct: number | null;
  cancelledPct: number | null;
  avgDepDelay: number | null;
  destinations: number | null;
}

export interface Route extends Performance {
  origin: string;
  dest: string;
  /** Statute miles. */
  distance: number;
  /** Airline codes, busiest first. */
  airlines: string[];
  byAirline: {
    airline: string;
    flights: number;
    onTimePct: number;
    cancelledPct: number;
    avgArrDelay: number;
  }[];
}

export interface Aircraft {
  tail: string;
  airline: string;
  flights: number;
  miles: number;
}

export type ModelFeature = 'airline' | 'origin' | 'dest' | 'month' | 'weekday' | 'hour';

export interface Metrics {
  auc: number;
  aucPr: number;
  brier: number;
  logLoss: number;
}

export interface DelayModel {
  /** The year of the flights the model was trained and tested on. */
  year: number;
  target: string;
  intercept: number;
  baseRate: number;
  regParam: number;
  trainFlights: number;
  testFlights: number;
  features: Record<
    ModelFeature,
    { mean: number; unknown: number; weights: Record<string, number> }
  >;
  metrics: { model: Metrics; historicalRate: Metrics; constant: Metrics };
  calibration: { bin: number; predicted: number; observed: number; flights: number }[];
}

export interface ModelResult extends Metrics {
  name: string;
  minutes: number;
}
