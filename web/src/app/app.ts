import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { DataService } from './data/data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly years = computed(() =>
    this.data
      .years()
      .map((y) => y.year)
      .join(' and '),
  );
  protected readonly links = [
    { path: '/', label: 'Overview', exact: true },
    { path: '/delays', label: 'Delays', exact: false },
    { path: '/airlines', label: 'Airlines', exact: false },
    { path: '/routes', label: 'Routes', exact: false },
    { path: '/predict', label: 'Delay risk', exact: false },
    { path: '/about', label: 'About', exact: false },
  ];
}
