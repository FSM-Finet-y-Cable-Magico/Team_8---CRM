import {
  buildInstallOrderObservations,
  parseInstallOrderObservations,
  preserveInstallOrderMetadata,
} from './install-order-metadata';

describe('install order metadata', () => {
  it('serializa y recupera los datos tecnicos y de agenda de CU-17', () => {
    const value = buildInstallOrderObservations({
      tipoConexion: 'Fibra Optica',
      horaVisita: '11:00',
      observacionesAgenda: 'Llamar antes de la visita',
    });

    expect(parseInstallOrderObservations(value)).toEqual({
      tipoConexion: 'Fibra Optica',
      horaVisita: '11:00',
      observacionesAgenda: 'Llamar antes de la visita',
      observacionesCierre: null,
    });
  });

  it('preserva los datos de CU-17 al registrar las observaciones de cierre', () => {
    const original = buildInstallOrderObservations({
      tipoConexion: 'Television',
      horaVisita: '16:00',
      observacionesAgenda: 'Conserjeria avisada',
    });
    const updated = preserveInstallOrderMetadata(original, 'Instalacion completada sin novedad');

    expect(parseInstallOrderObservations(updated)).toEqual({
      tipoConexion: 'Television',
      horaVisita: '16:00',
      observacionesAgenda: 'Conserjeria avisada',
      observacionesCierre: 'Instalacion completada sin novedad',
    });
  });
});
