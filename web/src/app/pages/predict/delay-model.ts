import { DelayModel, ModelFeature } from '../../data/models';

/** The model of the pipeline (pipeline/src/main/scala/flights/DelayModel.scala), evaluated in the browser:
 *  logit = intercept + one weight per feature value, probability = sigmoid(logit). */

export const FEATURES: ModelFeature[] = ['airline', 'origin', 'dest', 'month', 'weekday', 'hour'];

export type Flight = Record<ModelFeature, string>;

export interface Factor {
  feature: ModelFeature;
  value: string;
  weight: number;
  /** Probability minus the probability with this feature at its average weight, in percentage points. */
  impact: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function weightOf(model: DelayModel, feature: ModelFeature, value: string): number {
  const f = model.features[feature];
  return f.weights[value] ?? f.unknown;
}

export function predict(
  model: DelayModel,
  flight: Flight,
): { probability: number; factors: Factor[] } {
  const weights = FEATURES.map((feature) => weightOf(model, feature, flight[feature]));
  const logit = model.intercept + weights.reduce((a, b) => a + b, 0);
  const probability = sigmoid(logit);
  const factors = FEATURES.map((feature, i) => ({
    feature,
    value: flight[feature],
    weight: weights[i],
    impact: 100 * (probability - sigmoid(logit - weights[i] + model.features[feature].mean)),
  }));
  return { probability, factors };
}

/** A JavaScript date as the model's month (1-12) and day of the week (1 = Monday ... 7 = Sunday). */
export function calendar(date: Date): Pick<Flight, 'month' | 'weekday'> {
  return { month: String(date.getMonth() + 1), weekday: String(((date.getDay() + 6) % 7) + 1) };
}
