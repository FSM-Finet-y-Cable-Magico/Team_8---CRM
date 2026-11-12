import { ticketAttentionCatalog, TICKET_ATTENTION_NAMES } from './ticket-attention-categories';
import { ticketStateCompatibility } from './ticket-ownership';

// Compatibility snapshot G8 <-> G2 <-> G3. No database, no network.
// The G2 and G3 behaviours below were read in their repositories, not guessed:
//  - G2 finet-clientes@b751a2fa  apps/controller/src/common/constants/categorias-ticket.ts
//    Offers/accepts a category when its name equals one of seven literals,
//    ignoring case only (Prisma `mode: 'insensitive'`). It never reads `tipo`
//    and has no alias for the historical `Consulta`.
//  - G3 Team-3-FSM@d3726cc  fsm/backend/prisma/seed-global.ts
//    Seeds seven technical categories into the same shared table. Its category
//    selectors and endpoints list the whole table and only check existence.
// These tests do not certify any integration; they pin down where the three
// code bases agree and where they do not.
const G2_CATEGORIAS_CLIENTE = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
  'Facturación y cobro', 'Consulta general', 'Baja de servicio'];
const G3_SEEDED_TECHNICAL = ['Sintonización de TV', 'Internet lento', 'Colector defectuoso',
  'Falla de planta externa', 'IPTV pirata', 'Cliente ausente', 'Otro'];
const G2_AUTOMATIC = ['CAMBIO_CREDENCIALES_WIFI', 'Asistente virtual'];

type Row = { idCategoria: number; nombre: string; slaHoras: number | null; tipo: string | null; tipoDisponible: boolean };
const legacy = (idCategoria: number, nombre: string, slaHoras: number | null = null): Row =>
  ({ idCategoria, nombre, slaHoras, tipo: null, tipoDisponible: false });
const typed = (idCategoria: number, nombre: string, tipo: string): Row =>
  ({ idCategoria, nombre, slaHoras: null, tipo, tipoDisponible: true });

const g2Offers = (rows: Row[]) => rows
  .filter(row => G2_CATEGORIAS_CLIENTE.some(name => name.toLowerCase() === row.nombre.toLowerCase()))
  .map(row => row.idCategoria);
const g8Offers = (rows: Row[]) => ticketAttentionCatalog(rows).filter(row => row.nombreAtencion).map(row => row.idCategoria);

// What the local QA catalog looks like (IDs/SLA are fixtures, not a mapping to adopt).
const qaCatalog = () => [legacy(1, 'Falla de internet', 24), legacy(2, 'Falla de TV', 24), legacy(3, 'Consulta', 72),
  legacy(4, 'Cambio de plan', 72), legacy(5, 'Mudanza', 120), legacy(6, 'CAMBIO_CREDENCIALES_WIFI')];

describe('P0-B compatibilidad de categorias G8 / G2 / G3', () => {
  it('las siete etiquetas oficiales de G8 y de G2 son las mismas', () => {
    expect([...TICKET_ATTENTION_NAMES]).toEqual(G2_CATEGORIAS_CLIENTE);
  });

  it('QA: G8 ofrece 5 y G2 solo 4; la unica diferencia es el alias historico Consulta (ID 3)', () => {
    const rows = qaCatalog();
    expect(g8Offers(rows)).toEqual([1, 2, 3, 4, 5]);
    expect(g2Offers(rows)).toEqual([1, 2, 4, 5]);
    expect(g8Offers(rows).filter(id => !g2Offers(rows).includes(id))).toEqual([3]);
  });

  it('insertar "Consulta general" junto a "Consulta" NO lo arregla: G8 declara ambiguas ambas filas', () => {
    const rows = [...qaCatalog(), legacy(7, 'Consulta general')];
    expect(g8Offers(rows)).toEqual([1, 2, 4, 5]);
    expect(g2Offers(rows)).toEqual([1, 2, 4, 5, 7]);
  });

  it('renombrar Consulta a Consulta general (mismo ID) alinea a G8 y G2 sin tocar IDs ni SLA', () => {
    const rows = qaCatalog().map(row => row.idCategoria === 3 ? { ...row, nombre: 'Consulta general' } : row);
    expect(g8Offers(rows)).toEqual(g2Offers(rows));
    expect(g8Offers(rows)).toContain(3);
    expect(rows.find(row => row.idCategoria === 3)?.slaHoras).toBe(72);
  });

  it.each([
    ['sin columna tipo', (id: number, name: string) => legacy(id, name)],
    ['tipo INTERNA (default global)', (id: number, name: string) => typed(id, name, 'INTERNA')],
    ['tipo TECNICA', (id: number, name: string) => typed(id, name, 'TECNICA')],
  ])('las siete categorias tecnicas sembradas por G3 y las automaticas de G2 nunca se ofrecen (%s)', (_label, build) => {
    const rows = [...G3_SEEDED_TECHNICAL, ...G2_AUTOMATIC].map((name, index) => build(100 + index, name));
    expect(g8Offers(rows)).toEqual([]);
    expect(g2Offers(rows)).toEqual([]);
  });

  it('catalogo global esperado: siete ATENCION + tecnicas G3 + automaticas G2 -> G8 y G2 ofrecen exactamente los mismos siete IDs', () => {
    const rows = [
      ...G2_CATEGORIAS_CLIENTE.map((name, index) => typed(10 + index * 3, name, 'ATENCION')),
      ...G3_SEEDED_TECHNICAL.map((name, index) => typed(200 + index, name, 'TECNICA')),
      ...G2_AUTOMATIC.map((name, index) => typed(300 + index, name, 'INTERNA')),
    ];
    expect(g8Offers(rows)).toHaveLength(7);
    expect(g8Offers(rows).sort()).toEqual(g2Offers(rows).sort());
  });

  it('G2 no mira tipo: una fila tecnica con nombre oficial la ofrece G2 pero G8 la rechaza (G8 es la barrera)', () => {
    const rows = [typed(50, 'Falla de Internet', 'TECNICA')];
    expect(g2Offers(rows)).toEqual([50]);
    expect(g8Offers(rows)).toEqual([]);
  });

  it('G3 acepta cualquier ID existente: el rechazo de categorias tecnicas en altas de G8 no depende de G3', () => {
    const rows = [...qaCatalog(), ...G3_SEEDED_TECHNICAL.map((name, index) => legacy(100 + index, name))];
    const enabled = g8Offers(rows);
    for (const id of rows.filter(row => G3_SEEDED_TECHNICAL.includes(row.nombre)).map(row => row.idCategoria)) {
      expect(enabled).not.toContain(id);
    }
  });

  describe('estados de tickets creados por G2 (decision intergrupos pendiente, no se cambia en G8)', () => {
    it('G2 escribe ABIERTO en mayusculas: G8 lo lee como vocabulario G3 y lo deja de solo lectura', () => {
      expect(ticketStateCompatibility('ABIERTO')).toEqual({ vocabularioEstado: 'G3', estadoPresentacion: 'Abierto', soloLecturaTecnica: true });
    });

    it('un ticket con estado Abierto (vocabulario G8) si es gestionable desde G8', () => {
      expect(ticketStateCompatibility('Abierto')).toMatchObject({ vocabularioEstado: 'G8', soloLecturaTecnica: false });
    });
  });
});
