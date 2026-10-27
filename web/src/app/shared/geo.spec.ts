import { bearing, greatCircle } from './geo';

const JFK: [number, number] = [40.64, -73.78];
const LAX: [number, number] = [33.94, -118.41];
const HNL: [number, number] = [21.32, -157.92];
const GUM: [number, number] = [13.48, 144.8];

describe('great circle', () => {
  it('starts and ends at the two airports', () => {
    const path = greatCircle(JFK, LAX, 32);
    expect(path).toHaveLength(33);
    expect(path[0][0]).toBeCloseTo(JFK[0], 6);
    expect(path[0][1]).toBeCloseTo(JFK[1], 6);
    expect(path[32][0]).toBeCloseTo(LAX[0], 6);
    expect(path[32][1]).toBeCloseTo(LAX[1], 6);
  });

  it('bends north of the straight line between two northern airports', () => {
    const middle = greatCircle(JFK, LAX, 2)[1];
    expect(middle[0]).toBeGreaterThan((JFK[0] + LAX[0]) / 2);
  });

  it('keeps longitudes continuous across the antimeridian', () => {
    const path = greatCircle(HNL, GUM, 64);
    for (let i = 1; i < path.length; i++)
      expect(Math.abs(path[i][1] - path[i - 1][1])).toBeLessThan(10);
    expect(path[64][1]).toBeCloseTo(GUM[1] - 360, 6);
  });

  it('gives compass bearings', () => {
    expect(bearing([0, 0], [10, 0])).toBeCloseTo(0, 6);
    expect(bearing([0, 0], [0, 10])).toBeCloseTo(90, 6);
    expect(bearing(JFK, LAX)).toBeGreaterThan(260);
  });
});
