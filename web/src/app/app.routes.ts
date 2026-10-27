import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'US Flight Delays',
    loadComponent: () => import('./pages/overview/overview').then((m) => m.Overview),
  },
  {
    path: 'delays',
    title: 'Delays · US Flight Delays',
    loadComponent: () => import('./pages/delays/delays').then((m) => m.Delays),
  },
  {
    path: 'airlines',
    title: 'Airlines · US Flight Delays',
    loadComponent: () => import('./pages/airlines/airlines').then((m) => m.Airlines),
  },
  {
    path: 'routes',
    title: 'Routes · US Flight Delays',
    loadComponent: () => import('./pages/routes/routes').then((m) => m.RouteExplorer),
  },
  {
    path: 'predict',
    title: 'Delay risk · US Flight Delays',
    loadComponent: () => import('./pages/predict/predict').then((m) => m.Predict),
  },
  {
    path: 'about',
    title: 'About · US Flight Delays',
    loadComponent: () => import('./pages/about/about').then((m) => m.About),
  },
  { path: '**', redirectTo: '' },
];
