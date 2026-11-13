import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { canActivateService } from '../services/service-activation.policy';
import { parseHistoricalBook, readImportMatrix } from './historical-book-file';
import { HistoricalBookImportService } from './historical-book-import.service';

type RawRow = Record<string, unknown>;

type NormalizedImportRow = {
  rowNumber: number;
  rut: string;
  nombreCompleto: string;
  email?: string;
  telefono: string;
  direccion: string;
  estado?: string;
  tipoRegistro: 'cliente' | 'prospecto';
  tipoServicio?: 'Internet' | 'Television' | 'Internet + Television';
  estadoServicio?: 'Activo' | 'Pendiente Instalacion' | 'Suspendido' | 'Baja';
};

type RejectedRow = {
  rowNumber: number;
  rut?: string;
  reason: string;
};

const MAX_REJECTION_RATE = 0.3;
const HISTORICAL_SERVICE_TYPES = ['Internet', 'Television', 'Internet + Television'] as const;
const HISTORICAL_SERVICE_STATES = ['Activo', 'Pendiente Instalacion', 'Suspendido', 'Baja'] as const;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly historicalBook?: HistoricalBookImportService,
  ) {}

  async importClients(file: Express.Multer.File | undefined, currentUser: AuthUser, requestedCompanyId?: number) {
    if (!file) {
      throw new BadRequestException('Archivo no informado');
    }

    const idEmpresa = this.resolveCompanyId(currentUser, requestedCompanyId);
    const historical = await parseHistoricalBook(file);
    if (historical) {
      if (!this.historicalBook) throw new BadRequestException('El importador histórico no está disponible');
      return this.historicalBook.import(historical, currentUser, idEmpresa);
    }
    const rows = await this.parseFile(file);

    if (!rows.length) {
      throw new BadRequestException('El archivo no contiene filas');
    }

    const totalRows = rows.length;
    const { normalized: normalizedRows, rejected: structuralRejected } = this.normalizeRows(rows);
    const rejected: RejectedRow[] = [...structuralRejected];
    const validRows: NormalizedImportRow[] = [];
    const seenRut = new Set<string>();

    for (const row of normalizedRows) {
      const rutValidation = validateRut(row.rut);

      if (!rutValidation.valid || !rutValidation.normalized) {
        rejected.push({ rowNumber: row.rowNumber, rut: row.rut, reason: rutValidation.reason ?? 'RUT invalido' });
        continue;
      }

      if (seenRut.has(rutValidation.normalized)) {
        rejected.push({ rowNumber: row.rowNumber, rut: rutValidation.normalized, reason: 'RUT duplicado en archivo' });
        continue;
      }

      seenRut.add(rutValidation.normalized);

      const duplicateClient = await this.prisma.cliente.findUnique({ where: { rut: rutValidation.normalized } });
      const duplicateProspect = await this.prisma.prospecto.findFirst({ where: { rut: rutValidation.normalized } });

      if (duplicateClient || duplicateProspect) {
        rejected.push({ rowNumber: row.rowNumber, rut: rutValidation.normalized, reason: 'RUT ya existe en base de datos' });
        continue;
      }

      validRows.push({ ...row, rut: rutValidation.normalized });
    }

    const rejectionRate = rejected.length / totalRows;

    if (rejectionRate > MAX_REJECTION_RATE) {
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'IMPORTACION_CLIENTES_FALLIDA',
        entidadAfectada: 'cliente',
        valorNuevo: { total: totalRows, rechazadas: rejected.length, rejectionRate },
      });

      return {
        status: 'fallida',
        totalRows,
        importedRows: 0,
        rejectedRows: rejected.length,
        rejectionRate,
        errors: rejected,
      };
    }

    let importedServices = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        if (row.tipoRegistro === 'cliente') {
          const customer = await tx.cliente.create({
            data: {
              idEmpresa,
              rut: row.rut,
              nombreCompleto: row.nombreCompleto,
              email: row.email,
              telefono: row.telefono,
              estado: row.estado ?? 'Activo',
              importadoMasivo: true,
              origenContacto: 'Importacion historica',
            },
          });
          const address = await tx.direccionServicio.create({
            data: {
              idCliente: customer.idCliente,
              direccionCompleta: row.direccion,
              comuna: 'Por confirmar',
              ciudad: null,
              esPrincipal: true,
            },
          });

          if (row.tipoServicio) {
            const estadoOperativo = row.estadoServicio ?? 'Activo';

            if (!canActivateService({
              intent: 'HISTORICAL_IMPORT',
              targetStatus: estadoOperativo,
              historicalImport: true,
            })) {
              throw new BadRequestException('La fila historica no cumple la politica de activacion');
            }

            await tx.servicioContratado.create({
              data: {
                idCliente: customer.idCliente,
                idEmpresa,
                idDireccion: address.idDireccion,
                tipoServicio: row.tipoServicio,
                estadoOperativo,
                observaciones: 'Servicio preexistente registrado por importacion historica',
                datosTecnicos: {
                  origen: 'Importacion historica',
                  filaImportacion: row.rowNumber,
                },
              },
            });
            importedServices += 1;
          }
        } else {
          await tx.prospecto.create({
            data: {
              idEmpresa,
              idUsuarioComercial: currentUser.idUsuario,
              rut: row.rut,
              nombreCompleto: row.nombreCompleto,
              email: row.email,
              telefono: row.telefono,
              direccion: row.direccion,
              estadoPipeline: row.estado ?? 'Prospecto Nuevo',
              fechaCreacion: new Date(),
            },
          });
        }
      }
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'IMPORTACION_HISTORICA_CLIENTES',
      entidadAfectada: 'cliente',
      valorNuevo: {
        total: totalRows,
        importadas: validRows.length,
        rechazadas: rejected.length,
        idEmpresa,
        clientesHistoricos: validRows.filter((row) => row.tipoRegistro === 'cliente').length,
        serviciosHistoricos: importedServices,
        creaOrdenTrabajo: false,
      },
    });

    return {
      status: 'completada',
      totalRows,
      importedRows: validRows.length,
      rejectedRows: rejected.length,
      rejectionRate,
      importedServices,
      errors: rejected,
    };
  }

  async previewClients(file: Express.Multer.File | undefined, user: AuthUser, requestedCompanyId?: number, sheet?: string) {
    if (!file) throw new BadRequestException('Archivo no informado');
    const idEmpresa = this.resolveCompanyId(user, requestedCompanyId);
    const historical = await parseHistoricalBook(file, sheet);
    if (historical) {
      if (!this.historicalBook) throw new BadRequestException('El importador histórico no está disponible');
      return this.historicalBook.preview(historical, user, idEmpresa);
    }
    const rows = await this.parseFile(file);
    const { normalized, rejected } = this.normalizeRows(rows);
    const seen = new Set<string>();
    const prepared = normalized.map(row => {
      const issues: string[] = [];
      const rut = validateRut(row.rut);
      if (!rut.valid || !rut.normalized) issues.push('RUT inválido');
      else if (seen.has(rut.normalized)) issues.push('RUT duplicado en archivo');
      else seen.add(rut.normalized);
      return { rowNumber: row.rowNumber, rut: rut.valid ? rut.normalized : null, action: issues.length ? 'REVISAR' : row.tipoRegistro === 'cliente' ? 'CREAR_CLIENTE' : 'CREAR_PROSPECTO', issues, warnings: [] as string[] };
    });
    const ruts = [...seen];
    const [customers, prospects] = await Promise.all([
      this.prisma.cliente.findMany({ where: { rut: { in: ruts } }, select: { rut: true } }),
      this.prisma.prospecto.findMany({ where: { rut: { in: ruts } }, select: { rut: true } }),
    ]);
    const existing = new Set([...customers, ...prospects].map(row => row.rut));
    prepared.forEach(row => { if (row.rut && existing.has(row.rut)) { row.action = 'REVISAR'; row.issues.push('RUT ya existe en base de datos'); } });
    const details = [...prepared, ...rejected.map(row => ({ rowNumber: row.rowNumber, rut: null, action: 'REVISAR', issues: [row.reason], warnings: [] as string[] }))].sort((a, b) => a.rowNumber - b.rowNumber);
    const rejectionRate = details.filter(row => row.action === 'REVISAR').length / Math.max(1, details.length);
    return { formatVersion: 'CLIENTES_CSV_XLSX_V1', totalRows: details.length, readyRows: rejectionRate > MAX_REJECTION_RATE ? 0 : details.filter(row => row.action !== 'REVISAR').length,
      rejectedRows: details.filter(row => row.action === 'REVISAR').length, skippedRows: 0, warningRows: 0, rows: details, persisted: false,
      policy: rejectionRate > MAX_REJECTION_RATE ? 'Más del 30% de las filas del formato general requieren revisión.' : 'Los registros sin tipo explícito se incorporan como clientes; solo las filas marcadas prospecto crean prospectos.' };
  }

  private async parseFile(file: Express.Multer.File): Promise<RawRow[]> {
    const { matrix } = await readImportMatrix(file);
    const headerIndex = matrix.slice(0, 20).findIndex(row => row.some(cell => cell.trim().toLowerCase() === 'rut'));
    if (headerIndex < 0) throw new BadRequestException('No se encontró una columna RUT en el archivo');
    const headers = matrix[headerIndex];
    return matrix.slice(headerIndex + 1).map((values, index) => ({ values, rowNumber: index + headerIndex + 2 })).filter(row => row.values.some(Boolean))
      .map(row => ({ ...Object.fromEntries(headers.flatMap((key, index) => key.trim() ? [[key, row.values[index] ?? '']] : [])), __sourceRow: row.rowNumber }));
  }
  private normalizeRows(rows: RawRow[]): { normalized: NormalizedImportRow[]; rejected: RejectedRow[] } {
    const normalized: NormalizedImportRow[] = [];
    const rejected: RejectedRow[] = [];

    rows.forEach((row, index) => {
      const rowNumber = Number(row.__sourceRow) || index + 2;
      const rut = this.value(row, ['rut', 'RUT']);
      const nombreCompleto =
        this.value(row, ['nombre_completo', 'nombreCompleto', 'Nombre Completo']) ||
        [this.value(row, ['nombre', 'Nombre']), this.value(row, ['apellido', 'Apellido'])].filter(Boolean).join(' ');
      const email = this.value(row, ['email', 'correo', 'Correo']);
      const telefono = this.value(row, ['telefono', 'celular', 'Celular']);
      const direccion = this.value(row, ['direccion', 'direccion_fisica', 'Direccion']);
      const tipoRegistro = this.value(row, ['tipo_registro', 'tipo', 'Tipo']).toLowerCase();
      if (tipoRegistro && !['cliente', 'prospecto'].includes(tipoRegistro)) { rejected.push({ rowNumber, rut, reason: 'Tipo de registro no reconocido' }); return; }
      const estado = this.value(row, ['estado', 'Estado']);
      const tipoServicio = this.value(row, ['tipo_servicio', 'tipoServicio', 'Tipo Servicio']);
      const estadoServicio = this.value(row, ['estado_servicio', 'estadoServicio', 'Estado Servicio']);

      if (!rut || !nombreCompleto || !telefono || !direccion) {
        rejected.push({
          rowNumber,
          rut: rut || undefined,
          reason: 'Faltan campos obligatorios (rut, nombre/nombre_completo, telefono/celular y direccion)',
        });
        return;
      }

      if (tipoRegistro !== 'prospecto' && tipoServicio && !HISTORICAL_SERVICE_TYPES.includes(
        tipoServicio as (typeof HISTORICAL_SERVICE_TYPES)[number],
      )) {
        rejected.push({ rowNumber, rut, reason: 'tipo_servicio historico no reconocido' });
        return;
      }

      if (tipoRegistro !== 'prospecto' && estadoServicio && !HISTORICAL_SERVICE_STATES.includes(
        estadoServicio as (typeof HISTORICAL_SERVICE_STATES)[number],
      )) {
        rejected.push({ rowNumber, rut, reason: 'estado_servicio historico no reconocido' });
        return;
      }

      if (estadoServicio && !tipoServicio) {
        rejected.push({ rowNumber, rut, reason: 'estado_servicio requiere tipo_servicio' });
        return;
      }

      normalized.push({
        rowNumber,
        rut,
        nombreCompleto,
        email: email || undefined,
        telefono,
        direccion,
        estado: estado || undefined,
        tipoRegistro: tipoRegistro === 'prospecto' ? 'prospecto' : 'cliente',
        tipoServicio: tipoServicio
          ? tipoServicio as NormalizedImportRow['tipoServicio']
          : undefined,
        estadoServicio: estadoServicio
          ? estadoServicio as NormalizedImportRow['estadoServicio']
          : undefined,
      });
    });

    return { normalized, rejected };
  }

  private value(row: RawRow, aliases: string[]) {
    for (const alias of aliases) {
      const foundKey = Object.keys(row).find((key) => key.trim().toLowerCase() === alias.trim().toLowerCase());
      const value = foundKey ? row[foundKey] : undefined;

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private resolveCompanyId(currentUser: AuthUser, requestedCompanyId?: number) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requestedCompanyId ?? currentUser.idEmpresa;

      if (!idEmpresa) {
        throw new BadRequestException('Debe indicar empresa para la importacion');
      }

      return idEmpresa;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return currentUser.idEmpresa;
  }
}
