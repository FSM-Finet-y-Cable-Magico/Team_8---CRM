import { hasTechnicalResult, normalizeG3State, sha256Payload, stableJson } from './g3-integration.utils';

describe('Etapa 3 - contrato y estados G3', () => {
  it('18. procesa PENDIENTE sin equivalencias', () => expect(normalizeG3State('PENDIENTE')).toMatchObject({ known: true, state: 'PENDIENTE' }));
  it('19. procesa ASIGNADA sin equivalencias', () => expect(normalizeG3State('ASIGNADA')).toMatchObject({ known: true, state: 'ASIGNADA' }));
  it('20. procesa EN_CURSO sin equivalencias', () => expect(normalizeG3State('EN_CURSO')).toMatchObject({ known: true, state: 'EN_CURSO' }));
  it('21. procesa COMPLETADA sin equivalencias', () => expect(normalizeG3State('COMPLETADA')).toMatchObject({ known: true, state: 'COMPLETADA' }));
  it('22. procesa CANCELADA sin equivalencias', () => expect(normalizeG3State('CANCELADA')).toMatchObject({ known: true, state: 'CANCELADA' }));
  it('23. procesa PENDIENTE_CLIENTE_AUSENTE sin equivalencias', () => expect(normalizeG3State('PENDIENTE_CLIENTE_AUSENTE')).toMatchObject({ known: true, state: 'PENDIENTE_CLIENTE_AUSENTE' }));
  it('24. estado desconocido se presenta EN_SEGUIMIENTO y conserva original', () => expect(normalizeG3State('REPROGRAMADA')).toEqual({ known: false, original: 'REPROGRAMADA', state: 'EN_SEGUIMIENTO' }));
  it('25. un valor vacio tampoco puede activar', () => expect(normalizeG3State(undefined).state).toBe('EN_SEGUIMIENTO'));
  it('63. el serializer determinista conserva snake_case y orden estable', () => {
    expect(stableJson({ trace_id: 't', request_id: 'r', persona: { telefono: '+56912345678' } }))
      .toBe('{"persona":{"telefono":"+56912345678"},"request_id":"r","trace_id":"t"}');
  });
  it('8. SHA-256 local es determinista y no depende del orden de claves', () => expect(sha256Payload({ b: 2, a: 1 })).toBe(sha256Payload({ a: 1, b: 2 })));
  it('23. resultado tecnico vacio no habilita cierre', () => expect(hasTechnicalResult({ resultado_tecnico: {} })).toBe(false));
  it('23. resultado tecnico estructurado habilita validacion posterior', () => expect(hasTechnicalResult({ resultado_tecnico: { potencia: -19 } })).toBe(true));
});
