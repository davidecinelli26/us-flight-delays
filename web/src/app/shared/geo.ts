/** Great-circle geometry for drawing routes on the map. */

export type LatLon = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Points along the great circle from `a` to `b`, with longitudes kept continuous across the antimeridian. */
export function greatCircle(a: LatLon, b: LatLon, steps = 64): LatLon[] {
  const [φ1, λ1, φ2, λ2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    );
  if (d < 1e-9) return [a, b];
  const points: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    points.push([deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))]);
  }
  for (let i = 1; i < points.length; i++) {
    while (points[i][1] - points[i - 1][1] > 180) points[i][1] -= 360;
    while (points[i][1] - points[i - 1][1] < -180) points[i][1] += 360;
  }
  return points;
}

/** Initial compass bearing from `a` to `b`, in degrees clockwise from north. */
export function bearing(a: LatLon, b: LatLon): number {
  const [φ1, φ2, Δλ] = [rad(a[0]), rad(b[0]), rad(b[1] - a[1])];
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
