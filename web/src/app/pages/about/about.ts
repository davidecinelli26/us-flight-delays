import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DataService } from '../../data/data.service';
import { fmt } from '../../shared/format';

@Component({
  selector: 'app-about',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.html',
  styles: `
    .card {
      margin-bottom: 1rem;
    }
    .card p:last-child,
    .card ul:last-child {
      margin-bottom: 0;
    }
    li {
      margin-bottom: 0.35rem;
    }
    pre {
      background: var(--surface-2);
      border-radius: 10px;
      padding: 0.9rem 1rem;
      overflow-x: auto;
      font-size: 0.85rem;
    }
  `,
})
export class About {
  private readonly data = inject(DataService);
  /** "6,369,482 flights in 2013 and 7,079,061 in 2024" */
  protected readonly flights = computed(() =>
    this.data
      .years()
      .map((y, i) => `${fmt.int(y.flights)}${i === 0 ? ' flights' : ''} in ${y.year}`)
      .join(' and '),
  );
}
