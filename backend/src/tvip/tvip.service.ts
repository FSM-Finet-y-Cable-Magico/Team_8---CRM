import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TvipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async generateForContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.getEligibleContract(idContrato);
    this.assertCompanyAccess(contract.idEmpresa, currentUser);

    return this.upsertCredential(contract, currentUser.idUsuario, 'GENERAR_CREDENCIALES_TVIP');
  }

  async regenerateForContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.getEligibleContract(idContrato);
    this.assertCompanyAccess(contract.idEmpresa, currentUser);

    return this.upsertCredential(contract, currentUser.idUsuario, 'REGENERAR_CREDENCIALES_TVIP');
  }

  async listByCustomer(idCliente: number, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const canAccess = isAdministrator(currentUser.roles) ||
      customer.idEmpresa === currentUser.idEmpresa ||
      customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa);

    if (!canAccess) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return this.listForCustomer(idCliente);
  }

  async listForCustomer(idCliente: number) {
    const contracts = await this.prisma.contrato.findMany({
      where: { idCliente },
      include: { plan: true },
      orderBy: { fechaInicio: 'desc' },
    });
    const contractIds = contracts.map((contract) => contract.idContrato);
    const credentials = contractIds.length
      ? await this.prisma.credencialesTvip.findMany({ where: { idContrato: { in: contractIds } } })
      : [];
    const credentialByContract = new Map(credentials.map((credential) => [credential.idContrato, credential]));

    return contracts
      .filter((contract) => this.contractIncludesTv(contract))
      .map((contract) => {
        const credential = credentialByContract.get(contract.idContrato);
        return {
          idContrato: contract.idContrato,
          estadoContrato: contract.estado,
          plan: contract.plan ? {
            idPlan: contract.plan.idPlan,
            nombreComercial: contract.plan.nombreComercial,
            tipoPlan: contract.plan.tipoPlan,
          } : null,
          incluyeTv: true,
          credencial: credential ? {
            idCredencial: credential.idCredencial,
            usuarioTvip: credential.usuarioTvip,
            fechaGeneracion: credential.fechaGeneracion,
          } : null,
          puedeGenerar: true,
        };
      });
  }

  async regenerateForPortal(idCliente: number, idContrato: number) {
    const contract = await this.getEligibleContract(idContrato);

    if (contract.idCliente !== idCliente) {
      throw new BadRequestException('El contrato no pertenece al cliente autenticado');
    }

    return this.upsertCredential(contract, null, 'REGENERAR_CREDENCIALES_TVIP_PORTAL');
  }

  private async getEligibleContract(idContrato: number) {
    const contract = await this.prisma.contrato.findUnique({
      where: { idContrato },
      include: { plan: true, cliente: true },
    });

    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }

    if (!this.contractIncludesTv(contract)) {
      throw new BadRequestException('El plan del contrato no incluye TV IP');
    }

    return contract;
  }

  private async upsertCredential(
    contract: Prisma.ContratoGetPayload<{ include: { plan: true; cliente: true } }>,
    idUsuario: number | null,
    action: string,
  ) {
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const username = this.tvipUsername(contract);
    const current = await this.prisma.credencialesTvip.findUnique({ where: { idContrato: contract.idContrato } });
    const credential = current
      ? await this.prisma.credencialesTvip.update({
          where: { idContrato: contract.idContrato },
          data: {
            usuarioTvip: username,
            passwordTvipHash: passwordHash,
            fechaGeneracion: new Date(),
          },
        })
      : await this.prisma.credencialesTvip.create({
          data: {
            idContrato: contract.idContrato,
            usuarioTvip: username,
            passwordTvipHash: passwordHash,
            fechaGeneracion: new Date(),
          },
        });

    await this.auditService.record({
      idUsuario,
      accion: action,
      entidadAfectada: 'credenciales_tvip',
      idEntidadAfectada: credential.idCredencial,
      valorNuevo: {
        idContrato: contract.idContrato,
        idCliente: contract.idCliente,
        usuarioTvip: credential.usuarioTvip,
      },
    });

    return {
      idCredencial: credential.idCredencial,
      idContrato: credential.idContrato,
      usuarioTvip: credential.usuarioTvip,
      fechaGeneracion: credential.fechaGeneracion,
      temporaryPassword,
      aviso: 'La contrasena temporal se muestra solo una vez.',
    };
  }

  private contractIncludesTv(contract: { plan: { nombreComercial: string; tipoPlan: string } | null }) {
    if (!contract.plan) {
      return false;
    }

    const text = `${contract.plan.nombreComercial} ${contract.plan.tipoPlan}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return ['tv', 'television', 'internet+tv', 'internet + tv', 'duo'].some((token) => text.includes(token));
  }

  private tvipUsername(contract: { idContrato: number; idEmpresa: number | null; cliente: { rut: string | null } | null }) {
    const rut = contract.cliente?.rut?.replace(/[^0-9kK]/g, '').toLowerCase() || 'cliente';
    const company = contract.idEmpresa ?? 0;
    return `tvip_${company}_${rut}_${contract.idContrato}`.slice(0, 80);
  }

  private generateTemporaryPassword() {
    return randomBytes(12).toString('base64url');
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El contrato no pertenece a tu empresa');
    }
  }
}
