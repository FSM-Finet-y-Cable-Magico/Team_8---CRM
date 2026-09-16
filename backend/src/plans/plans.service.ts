import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PLAN_CUSTOMER_TYPES, PLAN_TYPES, planTypeRequiresSpeed } from './plan-catalog';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(currentUser: AuthUser, scope = 'consolidado', includeInactive = false) {
    const where = this.companyScope(currentUser, scope);

    return this.prisma.plan.findMany({
      where: {
        ...where,
        ...(includeInactive ? {} : { activo: true }),
      },
      orderBy: { idPlan: 'asc' },
      include: {
        empresa: true,
      },
    });
  }

  async create(dto: CreatePlanDto, currentUser: AuthUser) {
    this.validatePlanFields({
      nombreComercial: dto.nombreComercial,
      tipoPlan: dto.tipoPlan,
      tipoCliente: dto.tipoCliente,
      velocidadMbps: dto.velocidadMbps,
      precioMensual: dto.precioMensual,
    });
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const created = await this.prisma.plan.create({
      data: {
        idEmpresa,
        nombreComercial: dto.nombreComercial.trim(),
        tipoPlan: dto.tipoPlan.trim(),
        tipoCliente: dto.tipoCliente.trim(),
        velocidadMbps: dto.velocidadMbps,
        precioMensual: dto.precioMensual,
        descripcion: dto.descripcion?.trim() || null,
        activo: dto.activo ?? true,
      },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_PLAN_COMERCIAL',
      entidadAfectada: 'plan',
      idEntidadAfectada: created.idPlan,
      valorNuevo: {
        idPlan: created.idPlan,
        idEmpresa,
        nombreComercial: created.nombreComercial,
        precioMensual: Number(created.precioMensual),
      },
    });

    return created;
  }

  async update(idPlan: number, dto: UpdatePlanDto, currentUser: AuthUser) {
    const plan = await this.getPlanOrThrow(idPlan, currentUser);
    const nextCompany = dto.idEmpresa === undefined ? plan.idEmpresa : this.resolveCompanyId(dto.idEmpresa, currentUser);
    this.validatePlanFields({
      nombreComercial: dto.nombreComercial ?? plan.nombreComercial,
      tipoPlan: dto.tipoPlan ?? plan.tipoPlan,
      tipoCliente: dto.tipoCliente ?? plan.tipoCliente,
      velocidadMbps: dto.velocidadMbps ?? plan.velocidadMbps,
      precioMensual: dto.precioMensual ?? Number(plan.precioMensual),
    });

    const updated = await this.prisma.plan.update({
      where: { idPlan },
      data: {
        idEmpresa: nextCompany,
        nombreComercial: dto.nombreComercial === undefined ? undefined : dto.nombreComercial.trim(),
        tipoPlan: dto.tipoPlan === undefined ? undefined : dto.tipoPlan.trim(),
        tipoCliente: dto.tipoCliente === undefined ? undefined : dto.tipoCliente.trim(),
        velocidadMbps: dto.velocidadMbps,
        precioMensual: dto.precioMensual,
        descripcion: dto.descripcion === undefined ? undefined : dto.descripcion.trim() || null,
        activo: dto.activo,
      },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_PLAN_COMERCIAL',
      entidadAfectada: 'plan',
      idEntidadAfectada: idPlan,
      valorAnterior: this.planAuditValue(plan),
      valorNuevo: this.planAuditValue(updated),
    });

    return updated;
  }

  async setActive(idPlan: number, active: boolean, currentUser: AuthUser) {
    const plan = await this.getPlanOrThrow(idPlan, currentUser);
    const updated = await this.prisma.plan.update({
      where: { idPlan },
      data: { activo: active },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: active ? 'ACTIVAR_PLAN_COMERCIAL' : 'DESACTIVAR_PLAN_COMERCIAL',
      entidadAfectada: 'plan',
      idEntidadAfectada: idPlan,
      valorAnterior: { activo: plan.activo },
      valorNuevo: { activo: updated.activo },
    });

    return updated;
  }

  async remove(idPlan: number, currentUser: AuthUser) {
    const removed = await this.prisma.$transaction(async tx => {
      const plan = await tx.plan.findUnique({ where: { idPlan }, include: { empresa: true } });

      if (!plan) {
        throw new NotFoundException('Plan no encontrado');
      }

      this.assertCompanyAccess(plan.idEmpresa, currentUser);

      const [contracts, quotations, planChanges] = await Promise.all([
        tx.contrato.count({ where: { idPlan } }),
        tx.cotizacion.count({ where: { idPlan } }),
        tx.historialCambioPlan.count({ where: { OR: [{ idPlanAnterior: idPlan }, { idPlanNuevo: idPlan }] } }),
      ]);

      if (contracts + quotations + planChanges > 0) {
        throw new BadRequestException('Este plan tiene historial asociado y no se puede eliminar. Puedes desactivarlo.');
      }

      await tx.planZonaPrecio.deleteMany({ where: { idPlan } });
      await tx.plan.delete({ where: { idPlan } });
      return plan;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ELIMINAR_PLAN_COMERCIAL',
      entidadAfectada: 'plan',
      idEntidadAfectada: idPlan,
      valorAnterior: this.planAuditValue(removed),
    });

    return { idPlan, eliminado: true };
  }

  private async getPlanOrThrow(idPlan: number, currentUser: AuthUser) {
    const plan = await this.prisma.plan.findUnique({ where: { idPlan }, include: { empresa: true } });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    this.assertCompanyAccess(plan.idEmpresa, currentUser);

    return plan;
  }

  private companyScope(currentUser: AuthUser, requestedScope: string): Prisma.PlanWhereInput {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

    const scope = requestedScope;

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requestedCompanyId ?? currentUser.idEmpresa;

      if (!idEmpresa) {
        throw new BadRequestException('Debe indicar empresa para el plan');
      }

      return idEmpresa;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    if (requestedCompanyId && requestedCompanyId !== currentUser.idEmpresa) {
      throw new BadRequestException('No puedes crear planes para otra empresa');
    }

    return currentUser.idEmpresa;
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El plan no pertenece a tu empresa');
    }
  }

  private validatePlanFields(input: {
    nombreComercial: string;
    tipoPlan: string;
    tipoCliente: string;
    velocidadMbps?: number | null;
    precioMensual: number;
  }) {
    if (!input.nombreComercial?.trim() || !input.tipoPlan?.trim() || !input.tipoCliente?.trim()) {
      throw new BadRequestException('Completa todos los campos obligatorios del plan');
    }

    if (!PLAN_TYPES.includes(input.tipoPlan.trim() as (typeof PLAN_TYPES)[number])) {
      throw new BadRequestException('El tipo de plan no pertenece al catálogo permitido');
    }

    if (!PLAN_CUSTOMER_TYPES.includes(input.tipoCliente.trim() as (typeof PLAN_CUSTOMER_TYPES)[number])) {
      throw new BadRequestException('El tipo de cliente no pertenece al catálogo permitido');
    }

    if (!Number.isFinite(input.precioMensual) || input.precioMensual <= 0) {
      throw new BadRequestException('El precio mensual debe ser mayor que cero');
    }

    if (
      planTypeRequiresSpeed(input.tipoPlan.trim())
      && (!Number.isInteger(input.velocidadMbps) || Number(input.velocidadMbps) <= 0)
    ) {
      throw new BadRequestException('La velocidad es obligatoria y debe ser mayor que cero para planes de Internet');
    }
  }

  private planAuditValue(plan: { idPlan: number; idEmpresa: number | null; nombreComercial: string; tipoPlan: string; tipoCliente: string; velocidadMbps: number | null; precioMensual: Prisma.Decimal; activo: boolean | null }) {
    return {
      idPlan: plan.idPlan,
      idEmpresa: plan.idEmpresa,
      nombreComercial: plan.nombreComercial,
      tipoPlan: plan.tipoPlan,
      tipoCliente: plan.tipoCliente,
      velocidadMbps: plan.velocidadMbps,
      precioMensual: Number(plan.precioMensual),
      activo: plan.activo,
    };
  }
}
