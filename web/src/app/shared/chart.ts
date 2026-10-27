import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/** Reads a color from the CSS custom properties of the current theme. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The outcome colors, in the order on time, delayed, cancelled, diverted. */
export const outcomeColors = () =>
  ['--ontime', '--delayed', '--cancelled', '--diverted'].map(cssVar);

/** Adds transparency to a #rrggbb color. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A Chart.js canvas that is rebuilt whenever its configuration changes. */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<canvas #canvas [attr.aria-label]="label()" role="img"></canvas>',
  styles: ':host { display: block; position: relative; height: var(--chart-height, 280px); }',
})
export class ChartComponent {
  readonly config = input.required<ChartConfiguration>();
  readonly label = input('chart');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    Chart.defaults.font.family = cssVar('--font') || 'system-ui';
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--border');
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;

    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
