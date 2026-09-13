import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { TicketsService } from '../tickets/tickets.service';
import { TvipService } from '../tvip/tvip.service';
import { CreatePortalTicketDto } from './dto/create-portal-ticket.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { RegeneratePortalTvipDto } from './dto/regenerate-portal-tvip.dto';
import { WifiChangeRequestDto } from './dto/wifi-change-request.dto';

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MINUTES = 15;
const BLOCK_MINUTES = 15;
const SESSION_HOURS = 8;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly ticketsService: TicketsService,
    private readonly tvipService: TvipService,
  ) {}

  async login(dto: PortalLoginDto, ipAddress?: string | null) {
    const ip = this.ip(ipAddress);
    const rut = validateRut(dto.rut);

    if (!rut.valid || !rut.normalized) {
      await this.recordFailedAttempt(null, ip, dto.rut);
      throw new UnauthorizedException(rut.reason ?? 'RUT invalido');
    }

    await this.assertNotBlocked(rut.normalized, ip);

    const customer = await this.prisma.cliente.findUnique({ where: { rut: rut.normalized } });

    if (!customer) {
      await this.recordFailedAttempt(null, ip, rut.normalized);
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const demoLoginEnabled = this.configService.get<string>('PORTAL_DEMO_LOGIN') === 'true';
    const demoPassword = this.configService.get<string>('PORTAL_DEMO_PASSWORD') ?? 'portal123';
    const passwordOk = customer.passwordPortalHash
      ? await bcrypt.compare(dto.password, customer.passwordPortalHash)
      : demoLoginEnabled && dto.password === demoPassword;

    if (!passwordOk) {
      await this.recordFailedAttempt(customer.idEmpresa, ip, rut.normalized);
      if (!customer.passwordPortalHash && !demoLoginEnabled) {
        throw new UnauthorizedException('El cliente no tiene acceso portal configurado.');
      }
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.tokenHash(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);

    await this.prisma.sesionPortal.create({
      data: {
        idCliente: customer.idCliente,
        token: tokenHash,
        fechaInicio: now,
        fechaExpiracion: expiresAt,
        ipOrigen: ip,
      },
    });

    await this.auditService.record({
      idUsuario: null,
      accion: 'LOGIN_PORTAL_CLIENTE',
      entidadAfectada: 'cliente',
      idEntidadAfectada: customer.idCliente,
      valorNuevo: { rut: customer.rut, idCliente: customer.idCliente },
      ipOrigen: ip,
    });

    return {
      portalToken: rawToken,
      expiresAt,
      customer: this.publicCustomer(customer),
    };
  }

  async me(token: string) {
    const { customer } = await this.resolveSession(token);
    return this.publicCustomer(customer);
  }

  async services(token: string) {
    const { customer } = await this.resolveSession(token);
    return this.prisma.servicioContratado.findMany({
      where: { idCliente: customer.idCliente },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        contrato: { include: { plan: true } },
        direccion: true,
        equipos: { orderBy: { idUnidad: 'desc' } },
      },
    });
  }

  async contracts(token: string) {
    const { customer } = await this.resolveSession(token);
    return this.prisma.contrato.findMany({
      where: { idCliente: customer.idCliente },
      orderBy: { fechaInicio: 'desc' },
      include: {
        plan: true,
        servicios: true,
        facturas: {
          orderBy: [{ periodoAnio: 'desc' }, { periodoMes: 'desc' }],
          take: 12,
        },
      },
    });
  }

  async tickets(token: string) {
    const { customer } = await this.resolveSession(token);
    const tickets = await this.prisma.ticket.findMany({
      where: { idCliente: customer.idCliente },
      orderBy: { fechaCreacion: 'desc' },
      take: 50,
    });
    const categoryIds = [...new Set(tickets.map((ticket) => ticket.idCategoria))];
    const categories = categoryIds.length
      ? await this.prisma.categoriaFalla.findMany({ where: { idCategoria: { in: categoryIds } } })
      : [];
    const categoryById = new Map(categories.map((category) => [category.idCategoria, category]));

    return tickets.map((ticket) => ({
      ...ticket,
      categoria: categoryById.get(ticket.idCategoria) ?? null,
    }));
  }

  async ticketCategories(token: string) {
    await this.resolveSession(token);
    return this.prisma.categoriaFalla.findMany({ orderBy: { idCategoria: 'asc' } });
  }

  async createTicket(token: string, dto: CreatePortalTicketDto) {
    const { customer } = await this.resolveSession(token);
    return this.ticketsService.createForPortal(customer.idCliente, dto);
  }

  async wifiChangeRequest(token: string, dto: WifiChangeRequestDto) {
    const { customer } = await this.resolveSession(token);
    const service = await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } });

    if (!service || service.idCliente !== customer.idCliente) {
      throw new BadRequestException('El servicio no pertenece al cliente autenticado');
    }

    const category = await this.resolveWifiCategory();
    const description = [
      'Solicitud de cambio de contrasena Wi-Fi registrada desde Portal Cliente.',
      dto.nuevaContrasena ? 'Por seguridad, la nueva contrasena no se almacena en el CRM.' : '',
      dto.observaciones ? `Observaciones del cliente: ${dto.observaciones}` : '',
    ].filter(Boolean).join('\n');

    const ticket = await this.ticketsService.createForPortal(customer.idCliente, {
      idCategoria: category.idCategoria,
      idServicio: service.idServicio,
      prioridad: 'Media',
      descripcion: description,
    });

    await this.auditService.record({
      idUsuario: null,
      accion: 'SOLICITUD_CAMBIO_WIFI_PORTAL',
      entidadAfectada: 'ticket',
      idEntidadAfectada: ticket.idTicket,
      valorNuevo: { idCliente: customer.idCliente, idServicio: service.idServicio, idTicket: ticket.idTicket },
    });

    return {
      ticket,
      mensaje: 'Solicitud registrada para revision tecnica.',
    };
  }

  async tvip(token: string) {
    const { customer } = await this.resolveSession(token);
    return this.tvipService.listForCustomer(customer.idCliente);
  }

  async regenerateTvip(token: string, dto: RegeneratePortalTvipDto) {
    const { customer } = await this.resolveSession(token);
    return this.tvipService.regenerateForPortal(customer.idCliente, dto.idContrato);
  }

  async resolveSession(token: string) {
    if (!token) {
      throw new UnauthorizedException('Sesion portal requerida');
    }

    const tokenHash = this.tokenHash(token);
    const session = await this.prisma.sesionPortal.findFirst({
      where: {
        token: tokenHash,
        fechaExpiracion: { gt: new Date() },
      },
      orderBy: { fechaInicio: 'desc' },
    });

    if (!session?.idCliente) {
      throw new UnauthorizedException('Sesion portal invalida o expirada');
    }

    const customer = await this.prisma.cliente.findUnique({ where: { idCliente: session.idCliente } });

    if (!customer) {
      throw new UnauthorizedException('Cliente de portal no encontrado');
    }

    return { session, customer };
  }

  private async assertNotBlocked(rut: string, ip: string) {
    const activeBlock = await this.prisma.intentoFallido.findFirst({
      where: {
        rutIntentado: rut,
        ipAddress: ip,
        bloqueadoHasta: { gt: new Date() },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (activeBlock) {
      throw new UnauthorizedException('Acceso portal bloqueado temporalmente por intentos fallidos.');
    }
  }

  private async recordFailedAttempt(idEmpresa: number | null, ipAddress: string, rutIntentado: string) {
    const since = new Date(Date.now() - FAILED_WINDOW_MINUTES * 60 * 1000);
    const normalizedRut = rutIntentado.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
    const attempts = await this.prisma.intentoFallido.count({
      where: {
        rutIntentado: normalizedRut,
        ipAddress,
        timestamp: { gte: since },
      },
    });
    const shouldBlock = attempts + 1 >= MAX_FAILED_ATTEMPTS;

    await this.prisma.intentoFallido.create({
      data: {
        idEmpresa,
        ipAddress,
        rutIntentado: normalizedRut,
        timestamp: new Date(),
        bloqueadoHasta: shouldBlock ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1000) : null,
      },
    });
  }

  private async resolveWifiCategory() {
    const categories = await this.prisma.categoriaFalla.findMany({ orderBy: { idCategoria: 'asc' } });

    if (!categories.length) {
      throw new BadRequestException('No existen categorias de ticket configuradas');
    }

    const preferred = categories.find((category) => {
      const name = category.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return name.includes('wifi') || name.includes('wi-fi') || name.includes('internet') || name.includes('cambio');
    });

    return preferred ?? categories[0];
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private ip(ipAddress?: string | null) {
    return ipAddress?.replace('::ffff:', '') || '127.0.0.1';
  }

  private publicCustomer(customer: { idCliente: number; rut: string | null; nombreCompleto: string; email: string | null; telefono: string | null; estado: string; idEmpresa: number | null }) {
    return {
      idCliente: customer.idCliente,
      rut: customer.rut,
      nombreCompleto: customer.nombreCompleto,
      email: customer.email,
      telefono: customer.telefono,
      estado: customer.estado,
      idEmpresa: customer.idEmpresa,
    };
  }
}
