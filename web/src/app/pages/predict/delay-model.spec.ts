import { DelayModel } from '../../data/models';
import { FEATURES, calendar, predict } from './delay-model';

const zero = { mean: 0, unknown: 0, weights: {} as Record<string, number> };

function model(): DelayModel {
  return {
    year: 2024,
    target: '',
    intercept: -1,
    baseRate: 0.2,
    regParam: 1e-4,
    trainFlights: 0,
    testFlights: 0,
    features: {
      airline: { mean: 0.1, unknown: 0, weights: { AA: 0.5, DL: -0.3 } },
      origin: { ...zero, weights: { JFK: 0.2 } },
      dest: { ...zero },
      month: { ...zero },
      weekday: { ...zero },
      hour: { mean: 0, unknown: 0, weights: { '18': 0.4 } },
    },
    metrics: {
      model: { auc: 0, aucPr: 0, brier: 0, logLoss: 0 },
      historicalRate: { auc: 0, aucPr: 0, brier: 0, logLoss: 0 },
      constant: { auc: 0, aucPr: 0, brier: 0, logLoss: 0 },
    },
    calibration: [],
  };
}

const flight = { airline: 'AA', origin: 'JFK', dest: 'LAX', month: '7', weekday: '5', hour: '18' };

describe('delay model', () => {
  it('adds one weight per feature to the intercept', () => {
    const { probability } = predict(model(), flight);
    expect(probability).toBeCloseTo(1 / (1 + Math.exp(-(-1 + 0.5 + 0.2 + 0.4))), 12);
  });

  it('uses the weight of unknown values for values it never saw', () => {
    const { factors } = predict(model(), { ...flight, airline: 'ZZ' });
    expect(factors.find((f) => f.feature === 'airline')!.weight).toBe(0);
  });

  it('measures each factor against the average value of that feature', () => {
    const { probability, factors } = predict(model(), flight);
    const airline = factors.find((f) => f.feature === 'airline')!;
    const withAverageAirline = 1 / (1 + Math.exp(-(-1 + 0.1 + 0.2 + 0.4)));
    expect(airline.impact).toBeCloseTo(100 * (probability - withAverageAirline), 10);
    expect(factors.find((f) => f.feature === 'dest')!.impact).toBeCloseTo(0, 12);
    expect(factors.map((f) => f.feature)).toEqual(FEATURES);
  });

  it('turns a date into month and day of the week', () => {
    expect(calendar(new Date(2024, 6, 4))).toEqual({ month: '7', weekday: '4' }); // Thursday 4 July 2024
    expect(calendar(new Date(2024, 11, 29))).toEqual({ month: '12', weekday: '7' }); // a Sunday
  });
});
