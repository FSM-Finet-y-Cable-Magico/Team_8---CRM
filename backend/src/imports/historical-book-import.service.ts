import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { rutLookupVariants, validateRut } from '../rut/rut.util';
import { HistoricalBookFile, HistoricalBookRow, historicalText } from './historical-book-file';

@Injectable()
export class HistoricalBookImportService {
  constructor(private readonly prisma: PrismaService) {}

  private company(user: AuthUser, requested?: number) {
    const id = isAdministrator(user.roles) ? requested ?? user.idEmpresa : user.idEmpresa;
    if (!id || !Number.isInteger(id) || id < 1) throw new BadRequestException('Selecciona una empresa para importar');
    if (!isAdministrator(user.roles) && requested && requested !== id) throw new BadRequestException('No puedes importar datos de otra empresa');
    return id;
  }

  private marker(row: HistoricalBookRow) { return `[LC-HIST:${row.fingerprint}]`; }

  async preview(file: HistoricalBookFile, user: AuthUser, requested?: number) {
    const idEmpresa = this.company(user, requested);
    const company = await this.prisma.empresa.findUnique({ where: { idEmpresa } });
    if (!company) throw new BadRequestException('Empresa inexistente');
    const variants = [...new Set(file.rows.flatMap(row => row.rut ? rutLookupVariants(row.rut) : []))];
    const [customers, prospects] = await Promise.all([
      this.prisma.cliente.findMany({ where: { rut: { in: variants } }, select: { idCliente: true, rut: true, nombreCompleto: true, idEmpresa: true,
        contratos: { select: { idEmpresa: true } }, servicios: { select: { idEmpresa: true } } } }),
      this.prisma.prospecto.findMany({ where: { rut: { in: variants } }, select: { idProspecto: true, rut: true, idCliente: true, idEmpresa: true } }),
    ]);
    const ids = customers.map(row => row.idCliente);
    const customersByRut = new Map<string, typeof customers>();
    customers.forEach(customer => {
      const rut = validateRut(customer.rut ?? '').normalized;
      if (rut) customersByRut.set(rut, [...customersByRut.get(rut) ?? [], customer]);
    });
    const prospectRuts = new Set(prospects.map(prospect => validateRut(prospect.rut ?? '').normalized).filter(Boolean));
    const notes = ids.length ? await this.prisma.observacionOperativa.findMany({ where: { idEmpresa, tipoEntidad: 'Importacion historica', idCliente: { in: ids } }, select: { observacion: true } }) : [];
    const existingMarkers = new Set(notes.map(note => note.observacion.match(/^\[LC-HIST:[a-f0-9]{64}\]/)?.[0]).filter(Boolean));
    const rows = file.rows.map(row => {
      const issues = [...row.errors];
      const matches = customersByRut.get(row.rut) ?? [];
      const customer = matches[0];
      if (matches.length > 1) issues.push('Hay varias identidades existentes para el mismo RUT');
      if (customer && historicalText(customer.nombreCompleto) !== historicalText(row.name)) issues.push('El nombre no coincide con el cliente existente para ese RUT');
      if (customer && customer.idEmpresa !== idEmpresa && !customer.contratos.some(item => item.idEmpresa === idEmpresa) && !customer.servicios.some(item => item.idEmpresa === idEmpresa)) issues.push('El cliente pertenece a otra empresa y no tiene una relación confirmada con la seleccionada');
      if (!customer && prospectRuts.has(row.rut)) issues.push('Existe un prospecto con ese RUT; se debe verificar su vinculación antes de convertirlo en cliente');
      const action = issues.length ? 'REVISAR' : existingMarkers.has(this.marker(row)) ? 'YA_IMPORTADA' : customer ? 'AGREGAR_HISTORIAL' : 'CREAR_CLIENTE';
      return { rowNumber: row.rowNumber, action, issues, warnings: row.warnings };
    });
    return { formatVersion: file.version, sheetName: file.sheet, idEmpresa, totalRows: rows.length,
      readyRows: rows.filter(row => row.action === 'CREAR_CLIENTE' || row.action === 'AGREGAR_HISTORIAL').length,
      rejectedRows: rows.filter(row => row.action === 'REVISAR').length, skippedRows: rows.filter(row => row.action === 'YA_IMPORTADA').length,
      warningRows: rows.filter(row => row.warnings.length).length, rows, persisted: false,
      policy: 'Clientes históricos: datos originales conservados. Sin crear servicios, contratos, facturas, pagos, tickets ni órdenes de trabajo a partir de campos ambiguos.' };
  }

  async import(file: HistoricalBookFile, user: AuthUser, requested?: number) {
    const preview = await this.preview(file, user, requested);
    const actions = new Map(preview.rows.map(row => [row.rowNumber, row]));
    const result = { status: 'completada', totalRows: file.rows.length, importedRows: 0, rejectedRows: preview.rejectedRows, skippedRows: preview.skippedRows,
      createdCustomers: 0, reusedCustomers: 0, importedServices: 0, importedTickets: 0,
      errors: preview.rows.filter(row => row.action === 'REVISAR').map(row => ({ rowNumber: row.rowNumber, reason: row.issues.join('. ') })),
      warnings: preview.rows.filter(row => row.warnings.length).map(row => ({ rowNumber: row.rowNumber, reason: row.warnings.join('. ') })), historicalOnly: true };
    const eligible = file.rows.filter(row => ['CREAR_CLIENTE', 'AGREGAR_HISTORIAL'].includes(actions.get(row.rowNumber)!.action));
    for (let start = 0; start < eligible.length; start += 4) {
      const outcomes = await Promise.all(eligible.slice(start, start + 4).map(async row => {
        try {
          return await this.prisma.$transaction(async tx => {
            const lock = `historical-client:${row.rut}`;
            await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${lock}))) AS import_lock`;
            const customers = await tx.cliente.findMany({ where: { rut: { in: rutLookupVariants(row.rut) } }, include: { contratos: { select: { idEmpresa: true } }, servicios: { select: { idEmpresa: true } } } });
            let customer = customers[0];
            if (customers.length > 1) throw new BadRequestException('Identidad duplicada en la base; no se modificó');
            if (customer && (historicalText(customer.nombreCompleto) !== historicalText(row.name) || customer.idEmpresa !== preview.idEmpresa && !customer.contratos.some(item => item.idEmpresa === preview.idEmpresa) && !customer.servicios.some(item => item.idEmpresa === preview.idEmpresa))) {
              throw new BadRequestException('La identidad o empresa cambió desde la revisión; no se modificó');
            }
            if (!customer && await tx.prospecto.findFirst({ where: { rut: { in: rutLookupVariants(row.rut) } } })) throw new BadRequestException('Existe un prospecto con ese RUT; requiere vinculación verificada');
            if (await tx.observacionOperativa.findFirst({ where: { idEmpresa: preview.idEmpresa, tipoEntidad: 'Importacion historica', observacion: { startsWith: this.marker(row) } } })) return 'skipped' as const;
            const created = !customer;
            if (!customer) {
              customer = await tx.cliente.create({ data: { idEmpresa: preview.idEmpresa, rut: row.rut, nombreCompleto: row.name, email: row.email, telefono: row.phone,
                estado: 'Activo', importadoMasivo: true, origenContacto: 'Importacion historica', datosTecnicos: { procedencia: 'Libro de control', verificacionOperativaPendiente: true } },
              include: { contratos: { select: { idEmpresa: true } }, servicios: { select: { idEmpresa: true } } } });
              if (row.address && row.address.length <= 200) await tx.direccionServicio.create({ data: { idCliente: customer.idCliente, direccionCompleta: row.address, comuna: 'Por confirmar', esPrincipal: true } });
            }
            const fields = row.values.map((value, index) => value ? `[${index + 1}] ${row.headers[index] || 'Sin encabezado'}: ${value}` : '').filter(Boolean);
            const observation = `${this.marker(row)}\nRegistro histórico del Libro de control. Los importes, estados, fechas y anotaciones originales no son operaciones nuevas.\n${fields.join('\n')}\nEncabezados originales: ${JSON.stringify(row.headers)}\nOriginal de la fila: ${JSON.stringify(row.originalCells)}${row.warnings.length ? `\nObservaciones de lectura: ${row.warnings.join('. ')}` : ''}`;
            await tx.observacionOperativa.create({ data: { tipoEntidad: 'Importacion historica', idEntidad: customer.idCliente, idCliente: customer.idCliente, idEmpresa: preview.idEmpresa, idUsuario: user.idUsuario, observacion: observation, visibilidad: 'Interna' } });
            await tx.logAuditoria.create({ data: { idUsuario: user.idUsuario, accion: 'IMPORTAR_FILA_LIBRO_CONTROL', entidadAfectada: 'cliente', idEntidadAfectada: customer.idCliente,
              valorNuevo: { idEmpresa: preview.idEmpresa, fila: row.rowNumber, huella: row.fingerprint, nuevoCliente: created, verificacionOperativaPendiente: true, movimientosExternos: false } as Prisma.InputJsonValue } });
            return created ? 'created' as const : 'reused' as const;
          }, { maxWait: 10000, timeout: 20000 });
        } catch (error) {
          return { rowNumber: row.rowNumber, reason: error instanceof BadRequestException ? error.message : 'No se pudo incorporar esta fila; su transacción se revirtió. Puedes reintentar sin duplicar las demás.' };
        }
      }));
      outcomes.forEach(outcome => {
        if (outcome === 'skipped') result.skippedRows++;
        else if (outcome === 'created' || outcome === 'reused') { result.importedRows++; if (outcome === 'created') result.createdCustomers++; else result.reusedCustomers++; }
        else { result.rejectedRows++; result.errors.push(outcome); }
      });
    }
    if (!result.importedRows && !result.skippedRows) result.status = 'fallida';
    return result;
  }
}
