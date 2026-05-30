import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { CreateProspectDto } from './dto/create-prospect.dto';

const INITIAL_PIPELINE_STATUS = 'Prospecto Nuevo';

@Injectable()
export class ProspectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const where = this.companyScope(currentUser, scope);

    return this.prisma.prospecto.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        usuarioComercial: {
          select: {
            nombreCompleto: true,
            email: true,
          },
        },
      },
    });
  }

  async create(dto: CreateProspectDto, currentUser: AuthUser) {
    const rutResult = validateRut(dto.rut);

    if (!rutResult.valid || !rutResult.normalized) {
      throw new BadRequestException(rutResult.reason ?? 'RUT invalido');
    }

    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const duplicateProspect = await this.prisma.prospecto.findFirst({
      where: { rut: rutResult.normalized },
    });
    const duplicateClient = await this.prisma.cliente.findUnique({
      where: { rut: rutResult.normalized },
    });

    if (duplicateProspect || duplicateClient) {
      throw new BadRequestException('Ya existe un cliente o prospecto con ese RUT');
    }

    const prospect = await this.prisma.prospecto.create({
      data: {
        idEmpresa,
        idUsuarioComercial: currentUser.idUsuario,
        rut: rutResult.normalized,
        nombreCompleto: dto.nombreCompleto.trim(),
        email: dto.email?.trim().toLowerCase(),
        telefono: dto.telefono.trim(),
        direccion: dto.direccion.trim(),
        estadoPipeline: INITIAL_PIPELINE_STATUS,
        fechaCreacion: new Date(),
      },
      include: {
        empresa: true,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: prospect.idProspecto,
      valorNuevo: {
        rut: prospect.rut,
        estadoPipeline: prospect.estadoPipeline,
        idEmpresa: prospect.idEmpresa,
      },
    });

    return prospect;
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (currentUser.roles.includes('Administrador')) {
      const adminCompany = requestedCompanyId ?? currentUser.idEmpresa;

      if (!adminCompany) {
        throw new BadRequestException('Debe indicar empresa');
      }

      return adminCompany;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return currentUser.idEmpresa;
  }

  private companyScope(currentUser: AuthUser, scope: string) {
    if (!currentUser.roles.includes('Administrador')) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }
}
