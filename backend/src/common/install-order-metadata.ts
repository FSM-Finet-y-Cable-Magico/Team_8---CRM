export type InstallConnectionType = 'Fibra Optica' | 'Television';

export type InstallOrderMetadata = {
  tipoConexion: InstallConnectionType | null;
  horaVisita: string | null;
  observacionesAgenda: string | null;
  observacionesCierre: string | null;
};

const metadataHeader = '[CU17]';
const agendaHeader = '[OBSERVACIONES_AGENDA]';
const completionHeader = '[OBSERVACIONES_CIERRE]';

export function buildInstallOrderObservations(input: {
  tipoConexion: InstallConnectionType;
  horaVisita: string;
  observacionesAgenda?: string | null;
  observacionesCierre?: string | null;
}) {
  return [
    metadataHeader,
    `TipoConexion=${input.tipoConexion}`,
    `HoraVisita=${input.horaVisita}`,
    agendaHeader,
    input.observacionesAgenda?.trim() ?? '',
    completionHeader,
    input.observacionesCierre?.trim() ?? '',
  ].join('\n');
}

export function parseInstallOrderObservations(value?: string | null): InstallOrderMetadata {
  if (!value?.startsWith(metadataHeader)) {
    return {
      tipoConexion: null,
      horaVisita: null,
      observacionesAgenda: value?.trim() || null,
      observacionesCierre: null,
    };
  }

  const typeMatch = value.match(/^TipoConexion=(Fibra Optica|Television)$/m);
  const timeMatch = value.match(/^HoraVisita=(\d{2}:\d{2})$/m);
  const agendaStart = value.indexOf(agendaHeader);
  const completionStart = value.indexOf(completionHeader);
  const agenda =
    agendaStart >= 0
      ? value.slice(agendaStart + agendaHeader.length, completionStart >= 0 ? completionStart : undefined).trim()
      : '';
  const completion = completionStart >= 0 ? value.slice(completionStart + completionHeader.length).trim() : '';

  return {
    tipoConexion: (typeMatch?.[1] as InstallConnectionType | undefined) ?? null,
    horaVisita: timeMatch?.[1] ?? null,
    observacionesAgenda: agenda || null,
    observacionesCierre: completion || null,
  };
}

export function preserveInstallOrderMetadata(existing: string | null, completionNotes?: string | null) {
  const metadata = parseInstallOrderObservations(existing);

  if (!metadata.tipoConexion || !metadata.horaVisita) {
    return completionNotes?.trim() || existing;
  }

  return buildInstallOrderObservations({
    tipoConexion: metadata.tipoConexion,
    horaVisita: metadata.horaVisita,
    observacionesAgenda: metadata.observacionesAgenda,
    observacionesCierre: completionNotes,
  });
}
