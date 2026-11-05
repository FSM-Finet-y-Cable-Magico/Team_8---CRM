import {
  GeoJsonPolygon,
  isChildPolygonInsideParent,
  pointInPolygon,
  polygonsOverlap,
  toGeoJsonPosition,
  toLeafletLatLng,
  validatePolygon,
} from './coverage-geometry';

const square = (west: number, south: number, east: number, north: number): GeoJsonPolygon => ({
  type: 'Polygon',
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

describe('geometria comercial GeoJSON EPSG:4326', () => {
  const coverage = square(-70.7, -33.7, -70.5, -33.5);

  it('valida Polygon cerrado y rechaza JSON arbitrario, rangos y anillos abiertos', () => {
    expect(validatePolygon(coverage)).toEqual(coverage);
    expect(() => validatePolygon({ hello: 'world' })).toThrow('GeoJSON Polygon');
    expect(() => validatePolygon(square(-181, -33.7, -70.5, -33.5))).toThrow('fuera de rango');
    expect(() => validatePolygon({ type: 'Polygon', coordinates: [[[-70.7, -33.7], [-70.5, -33.7], [-70.5, -33.5], [-70.7, -33.5]]] })).toThrow('primer punto');
  });

  it('resuelve puntos interiores, exteriores y considera el borde dentro', () => {
    expect(pointInPolygon([-70.6, -33.6], coverage)).toBe(true);
    expect(pointInPolygon([-70.8, -33.6], coverage)).toBe(false);
    expect(pointInPolygon([-70.7, -33.6], coverage)).toBe(true);
  });

  it('mantiene explicito el orden Leaflet [lat,lng] y GeoJSON [lng,lat]', () => {
    expect(toGeoJsonPosition([-33.58, -70.63])).toEqual([-70.63, -33.58]);
    expect(toLeafletLatLng([-70.63, -33.58])).toEqual([-33.58, -70.63]);
  });

  it('valida contencion completa de microzonas', () => {
    expect(isChildPolygonInsideParent(square(-70.65, -33.65, -70.6, -33.6), coverage)).toBe(true);
    expect(isChildPolygonInsideParent(square(-70.75, -33.65, -70.72, -33.6), coverage)).toBe(false);
    expect(isChildPolygonInsideParent(square(-70.72, -33.65, -70.6, -33.6), coverage)).toBe(false);
  });

  it('detecta area solapada y permite microzonas separadas o solo adyacentes', () => {
    const first = square(-70.66, -33.66, -70.61, -33.61);
    expect(polygonsOverlap(first, square(-70.64, -33.64, -70.59, -33.59))).toBe(true);
    expect(polygonsOverlap(first, first)).toBe(true);
    expect(polygonsOverlap(first, square(-70.6, -33.6, -70.56, -33.56))).toBe(false);
    expect(polygonsOverlap(first, square(-70.61, -33.66, -70.56, -33.61))).toBe(false);
  });
});
