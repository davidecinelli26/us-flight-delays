import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A headline number with its label and an optional note. */
@Component({
  selector: 'app-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label">{{ label() }}</div>
    <div class="value" [class]="tone()">{{ value() }}</div>
    @if (note()) {
      <div class="note">{{ note() }}</div>
    }
  `,
  styles: `
    :host {
      display: block;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 0.9rem 1rem;
    }
    .label {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .value {
      font-size: 1.6rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      margin: 0.15rem 0;
    }
    .note {
      color: var(--muted);
      font-size: 0.8rem;
    }
  `,
})
export class Kpi {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly note = input<string>('');
  readonly tone = input<string>('');
}
