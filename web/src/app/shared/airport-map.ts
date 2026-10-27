import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { DataService } from '../data/data.service';
import { Airport } from '../data/models';
import { cssVar } from './chart';
import { fmt } from './format';
import { LatLon, bearing, greatCircle } from './geo';

export interface MapRoute {
  from: Airport;
  to: Airport;
  /** Line width between 0 and 1. */
  weight?: number;
}

// Material Design "flight" icon (Apache 2.0), pointing north.
const PLANE =
  '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';

/** Color of an airport bubble by its on-time departure rate: red at 60% or less, green at 85% or more. */
function rateColor(pct: number | null): string {
  if (pct == null) return '#94a3b8';
  const t = Math.min(1, Math.max(0, (pct - 60) / 25));
  return `hsl(${Math.round(t * 125)}, 70%, 45%)`;
}

const position = (a: Airport): LatLon | null =>
  a.lat == null || a.lon == null ? null : [a.lat, a.lon];

/** Airports as bubbles sized by departures, routes as great-circle arcs, optionally a plane flying one route. */
@Component({
  selector: 'app-airport-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #map class="map"></div>',
  styles: `
    :host {
      display: block;
    }
    .map {
      height: var(--map-height, 420px);
      border-radius: 10px;
      overflow: hidden;
      background: var(--map-water);
    }
    :host ::ng-deep .plane {
      color: var(--accent);
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
    }
  `,
})
export class AirportMap {
  readonly airports = input<Airport[]>([]);
  readonly routes = input<MapRoute[]>([]);
  readonly fly = input<MapRoute | null>(null);

  private readonly element = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly basemap = inject(DataService).basemap();
  private map?: L.Map;
  private readonly layer = L.layerGroup();
  private frame = 0;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.element().nativeElement, {
        zoomSnap: 0.5,
        minZoom: 2,
        maxZoom: 9,
      }).setView([38.5, -96], 4);
      map.attributionControl
        .setPrefix(false)
        .addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
      // Land under the markers: states and neighbouring countries, drawn from a GeoJSON shipped with the site.
      map.createPane('land').style.zIndex = '200';
      this.basemap.subscribe((land) =>
        L.geoJSON(land, {
          pane: 'land',
          interactive: false,
          style: (f) => ({
            fillColor: cssVar(f?.properties?.k === 's' ? '--map-land' : '--map-abroad'),
            fillOpacity: 1,
            color: cssVar('--map-border'),
            weight: f?.properties?.k === 's' ? 0.8 : 0.5,
          }),
        }).addTo(map),
      );
      this.layer.addTo(map);
      this.map = map;
      this.draw(this.airports(), this.routes(), this.fly());
    });
    effect(() => this.draw(this.airports(), this.routes(), this.fly()));
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.map?.remove();
    });
  }

  private draw(airports: Airport[], routes: MapRoute[], fly: MapRoute | null): void {
    if (!this.map) return;
    cancelAnimationFrame(this.frame);
    this.layer.clearLayers();
    const accent = cssVar('--accent');

    for (const route of routes) {
      const [a, b] = [position(route.from), position(route.to)];
      if (!a || !b) continue;
      L.polyline(greatCircle(a, b), {
        color: accent,
        weight: 0.6 + 3 * (route.weight ?? 0.3),
        opacity: 0.45,
      }).addTo(this.layer);
    }

    const busiest = Math.max(1, ...airports.map((a) => a.departures ?? 0));
    for (const airport of airports) {
      const at = position(airport);
      if (!at || !airport.departures) continue;
      const color = rateColor(airport.onTimeDeparturePct);
      L.circleMarker(at, {
        radius: 2.5 + 16 * Math.sqrt(airport.departures / busiest),
        color,
        fillColor: color,
        fillOpacity: 0.5,
        weight: 1,
      })
        .bindTooltip(
          `<b>${airport.code}</b> · ${airport.city ?? airport.name ?? ''}<br>` +
            `${fmt.int(airport.departures)} departures · ${fmt.pct(airport.onTimeDeparturePct)} on time`,
        )
        .addTo(this.layer);
    }

    if (fly) this.flyRoute(fly, accent);
  }

  /** Draws one route, fits the map to it and sends a plane along it in a loop. */
  private flyRoute(route: MapRoute, color: string): void {
    const [a, b] = [position(route.from), position(route.to)];
    if (!a || !b || !this.map) return;
    const path = greatCircle(a, b, 200);
    L.polyline(path, { color, weight: 3, dashArray: '6 8' }).addTo(this.layer);
    for (const [airport, at] of [
      [route.from, a],
      [route.to, b],
    ] as const) {
      L.circleMarker(at, { radius: 6, color, fillColor: color, fillOpacity: 1 })
        .bindTooltip(airport.code, { permanent: true, direction: 'top', offset: [0, -6] })
        .addTo(this.layer);
    }
    this.map.fitBounds(L.latLngBounds(path), { padding: [40, 40], maxZoom: 7 });

    const icon = L.divIcon({
      className: 'plane',
      html: `<div>${PLANE}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const plane = L.marker(path[0], { icon, interactive: false }).addTo(this.layer);
    const duration = 6000;
    const start = performance.now();
    const step = (now: number) => {
      // The first frame's timestamp can be slightly earlier than `start`.
      const f = (Math.max(0, now - start) % duration) / duration;
      const i = Math.min(path.length - 2, Math.floor(f * (path.length - 1)));
      plane.setLatLng(path[i]);
      const glyph = plane.getElement()?.firstElementChild as HTMLElement | null;
      if (glyph) glyph.style.transform = `rotate(${bearing(path[i], path[i + 1])}deg)`;
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
