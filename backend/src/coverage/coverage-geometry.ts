export type GeoJsonPosition = [number, number];
export type LeafletLatLng = [number, number];
export type GeoJsonPolygon = { type: 'Polygon'; coordinates: GeoJsonPosition[][] };

const EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function samePosition(a: GeoJsonPosition, b: GeoJsonPosition) {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function orientation(a: GeoJsonPosition, b: GeoJsonPosition, c: GeoJsonPosition) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: GeoJsonPosition, a: GeoJsonPosition, b: GeoJsonPosition) {
  return Math.abs(orientation(a, b, point)) <= EPSILON
    && point[0] >= Math.min(a[0], b[0]) - EPSILON
    && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON
    && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function properSegmentsIntersect(a: GeoJsonPosition, b: GeoJsonPosition, c: GeoJsonPosition, d: GeoJsonPosition) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

function segmentsTouchOrIntersect(a: GeoJsonPosition, b: GeoJsonPosition, c: GeoJsonPosition, d: GeoJsonPosition) {
  return properSegmentsIntersect(a, b, c, d)
    || pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d);
}

function ringArea(ring: GeoJsonPosition[]) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function validateRing(value: unknown, ringIndex: number): GeoJsonPosition[] {
  if (!Array.isArray(value) || value.length < 4) {
    throw new Error(`El anillo ${ringIndex + 1} debe contener al menos tres vertices y su cierre`);
  }
  const ring = value.map((candidate, positionIndex) => {
    if (!Array.isArray(candidate) || candidate.length !== 2
      || typeof candidate[0] !== 'number' || !Number.isFinite(candidate[0])
      || typeof candidate[1] !== 'number' || !Number.isFinite(candidate[1])) {
      throw new Error(`La posicion ${positionIndex + 1} del anillo ${ringIndex + 1} no es [longitud, latitud] valida`);
    }
    if (candidate[0] < -180 || candidate[0] > 180 || candidate[1] < -90 || candidate[1] > 90) {
      throw new Error(`La posicion ${positionIndex + 1} del anillo ${ringIndex + 1} esta fuera de rango`);
    }
    return [candidate[0], candidate[1]] as GeoJsonPosition;
  });
  if (!samePosition(ring[0], ring[ring.length - 1])) {
    throw new Error(`El anillo ${ringIndex + 1} debe terminar en su primer punto`);
  }
  if (Math.abs(ringArea(ring)) <= EPSILON) {
    throw new Error(`El anillo ${ringIndex + 1} no puede tener area cero`);
  }
  const edgeCount = ring.length - 1;
  for (let first = 0; first < edgeCount; first += 1) {
    for (let second = first + 1; second < edgeCount; second += 1) {
      const adjacent = second === first + 1 || (first === 0 && second === edgeCount - 1);
      if (!adjacent && segmentsTouchOrIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) {
        throw new Error(`El anillo ${ringIndex + 1} se cruza consigo mismo`);
      }
    }
  }
  return ring;
}

export function validatePolygon(value: unknown): GeoJsonPolygon {
  if (!isRecord(value) || value.type !== 'Polygon' || !Array.isArray(value.coordinates)
    || value.coordinates.length < 1) {
    throw new Error('La geometria debe ser un GeoJSON Polygon valido');
  }
  const coordinates = value.coordinates.map(validateRing);
  return { type: 'Polygon', coordinates };
}

export function toLeafletLatLng(position: GeoJsonPosition): LeafletLatLng {
  return [position[1], position[0]];
}

export function toGeoJsonPosition(latLng: LeafletLatLng): GeoJsonPosition {
  return [latLng[1], latLng[0]];
}

function pointInRing(point: GeoJsonPosition, ring: GeoJsonPosition[], includeBoundary: boolean) {
  let inside = false;
  for (let current = 0, previous = ring.length - 2; current < ring.length - 1; previous = current, current += 1) {
    const a = ring[previous];
    const b = ring[current];
    if (pointOnSegment(point, a, b)) return includeBoundary;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: GeoJsonPosition, polygon: GeoJsonPolygon, includeBoundary = true) {
  if (!pointInRing(point, polygon.coordinates[0], includeBoundary)) return false;
  for (const hole of polygon.coordinates.slice(1)) {
    if (pointInRing(point, hole, false)) return false;
  }
  return true;
}

function eachEdge(polygon: GeoJsonPolygon) {
  const edges: Array<[GeoJsonPosition, GeoJsonPosition]> = [];
  for (const ring of polygon.coordinates) {
    for (let index = 0; index < ring.length - 1; index += 1) edges.push([ring[index], ring[index + 1]]);
  }
  return edges;
}

export function isChildPolygonInsideParent(child: GeoJsonPolygon, parent: GeoJsonPolygon) {
  for (const ring of child.coordinates) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      const midpoint: GeoJsonPosition = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      if (!pointInPolygon(start, parent, true) || !pointInPolygon(midpoint, parent, true)) return false;
    }
  }
  for (const [childStart, childEnd] of eachEdge(child)) {
    for (const [parentStart, parentEnd] of eachEdge(parent)) {
      if (properSegmentsIntersect(childStart, childEnd, parentStart, parentEnd)) return false;
    }
  }
  return true;
}

export function polygonsOverlap(first: GeoJsonPolygon, second: GeoJsonPolygon) {
  for (const [firstStart, firstEnd] of eachEdge(first)) {
    for (const [secondStart, secondEnd] of eachEdge(second)) {
      if (properSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }
  const firstCenter = polygonCenter(first);
  const secondCenter = polygonCenter(second);
  return first.coordinates[0].slice(0, -1).some(point => pointInPolygon(point, second, false))
    || second.coordinates[0].slice(0, -1).some(point => pointInPolygon(point, first, false))
    || pointInPolygon([firstCenter.longitud, firstCenter.latitud], second, false)
    || pointInPolygon([secondCenter.longitud, secondCenter.latitud], first, false);
}

export function polygonCenter(polygon: GeoJsonPolygon) {
  const positions = polygon.coordinates[0].slice(0, -1);
  const total = positions.reduce((sum, position) => ({ lng: sum.lng + position[0], lat: sum.lat + position[1] }), { lng: 0, lat: 0 });
  return { latitud: total.lat / positions.length, longitud: total.lng / positions.length };
}
