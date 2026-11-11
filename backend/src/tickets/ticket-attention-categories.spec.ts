import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TICKET_ATTENTION_NAMES, ticketAttentionCatalog } from './ticket-attention-categories';

// Operator's read-only QA evidence; no DB, IDs/SLA are fixtures, not mappings.
const confirmedQa = () => [
  { idCategoria: 1, nombre: 'Falla de internet', slaHoras: 24 },
  { idCategoria: 2, nombre: 'Falla de TV', slaHoras: 24 },
  { idCategoria: 3, nombre: 'Consulta', slaHoras: 72 },
  { idCategoria: 4, nombre: 'Cambio de plan', slaHoras: 72 },
  { idCategoria: 5, nombre: 'Mudanza', slaHoras: 120 },
  { idCategoria: 6, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: null },
].map(row => ({ ...row, tipo: null, tipoDisponible: false }));
const officialRows = () => TICKET_ATTENTION_NAMES.map((nombre, i) => ({ idCategoria: 800 + i * 19,
  nombre, tipo: 'ATENCION', tipoDisponible: true }));

describe('C2-TK-01 catalogo confirmado y compatibilidad segura', () => {
  it('Consulta conserva ID, nombre almacenado y SLA al proyectar Consulta general', () => {
    const rows = confirmedQa(); const before = structuredClone(rows);
    const result = ticketAttentionCatalog(rows);
    expect(result.filter(row => row.nombreAtencion)).toHaveLength(5);
    expect(result.find(row => row.idCategoria === 3)).toEqual({ ...before[2], nombreAtencion: 'Consulta general' });
    expect(result.find(row => row.idCategoria === 6)?.nombreAtencion).toBeNull();
    expect(rows).toEqual(before);
    expect(TICKET_ATTENTION_NAMES.filter(name => !result.some(row => row.nombreAtencion === name)))
      .toEqual(['Facturación y cobro', 'Baja de servicio']);
  });

  it('dos altas aditivas con IDs asignados por catalogo completan siete opciones y preservan las seis filas', () => {
    const rows = confirmedQa(); const before = structuredClone(rows);
    rows.push({ idCategoria: 144, nombre: 'Facturación y cobro', slaHoras: null, tipo: null, tipoDisponible: false },
      { idCategoria: 251, nombre: 'Baja de servicio', slaHoras: null, tipo: null, tipoDisponible: false });
    const result = ticketAttentionCatalog(rows);
    expect(result.filter(row => row.nombreAtencion)).toHaveLength(7);
    expect(result.slice(0, 6).map(({ nombreAtencion: _label, ...row }) => row)).toEqual(before);
  });

  it.each([0, 3, 5, 7, 8])('%i filas no equivalen ciegamente a siete categorias oficiales', count => {
    const rows = officialRows();
    const data = count === 8 ? [...rows, { idCategoria: 99, nombre: 'FIBRA_CORTADA', tipo: 'TECNICA', tipoDisponible: true }] : rows.slice(0, count);
    expect(ticketAttentionCatalog(data).filter(row => row.nombreAtencion)).toHaveLength(Math.min(count, 7));
  });

  it('normaliza solo formato inequívoco y el alias aprobado, conservando acentos y todos los valores almacenados', () => {
    const rows = [
      { idCategoria: 22, nombre: '  FALLA DE   INTERNET\t', tipo: 'ATENCION', tipoDisponible: true },
      { idCategoria: 33, nombre: '  Consulta ', tipo: 'ATENCION', tipoDisponible: true },
      { idCategoria: 44, nombre: 'Facturacio\u0301n y cobro', tipo: 'ATENCION', tipoDisponible: true },
      { idCategoria: 55, nombre: 'Facturacion y cobro', tipo: 'ATENCION', tipoDisponible: true },
    ];
    expect(ticketAttentionCatalog(rows).map(row => row.nombreAtencion))
      .toEqual(['Falla de Internet', 'Consulta general', 'Facturación y cobro', null]);
  });

  it.each(['ATENCION', 'TECNICA'])('alias y nombre oficial coexistentes no permiten escoger un ID, incluso con homonimo %s', tipo => {
    const rows = [
      { idCategoria: 3, nombre: 'Consulta', tipo: 'ATENCION', tipoDisponible: true },
      { idCategoria: 100, nombre: ' CONSULTA  GENERAL ', tipo, tipoDisponible: true },
    ];
    expect(ticketAttentionCatalog(rows).every(row => row.nombreAtencion === null)).toBe(true);
  });

  it.each(['TECNICA', 'INTERNA', 'atencion', null])('tipo presente %s no se transforma por nombre ni alias', tipo => {
    expect(ticketAttentionCatalog([{ idCategoria: 3, nombre: 'Consulta', tipo, tipoDisponible: true }])[0].nombreAtencion).toBeNull();
  });

  it('IDs invalidos o repetidos no habilitan opciones y reservadas no se ofrecen', () => {
    const rows = officialRows(); rows[0].idCategoria = 0; rows[1].idCategoria = rows[2].idCategoria;
    const result = ticketAttentionCatalog([...rows,
      { idCategoria: 99, nombre: ' Asistente   virtual ', tipo: 'ATENCION', tipoDisponible: true }]);
    expect(result.filter(row => row.nombreAtencion)).toHaveLength(4);
    expect(result.at(-1)?.nombreAtencion).toBeNull();
  });

  it('propuesta SQL solo inserta faltantes; no reasigna IDs, SLA, tipos ni usa migracion destructiva', () => {
    const sql = readFileSync(resolve(__dirname, '../../../db/proposals/c2-tk-01-attention-categories-qa.sql'), 'utf8');
    const statements = sql.replace(/--[^\r\n]*/g, '');
    expect(statements).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i);
    expect(statements).not.toMatch(/INSERT INTO public\.categoria_falla\s*\([^)]*id_categoria/i);
    expect(statements).toContain('IF NOT EXISTS');
    expect(statements).toContain("ARRAY['Facturación y cobro', 'Baja de servicio']");
    expect(statements).toContain("finet.qa_catalog_reviewed");
    expect(statements).toContain('existing_count > 1');
    expect(statements).toContain('LOCK TABLE public.categoria_falla');
    expect(statements).toContain('btrim(regexp_replace(normalize(c.nombre, NFC), space_pattern');
    expect(statements).not.toContain('regexp_replace(btrim(');
  });
});
