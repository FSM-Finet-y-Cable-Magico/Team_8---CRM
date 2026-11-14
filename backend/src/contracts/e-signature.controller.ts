import { ArgumentsHost, Body, CanActivate, Catch, Controller, ExceptionFilter, ExecutionContext, Get, Header, HttpException, Injectable, Param,
  ParseIntPipe, Patch, Post, Req, Res, StreamableFile, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Equals, IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/auth.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { DEMO_SIGNATURE_CONSENT_VERSION, requireSignatureSettings, SIGNATURE_CONSENT_VERSION } from './e-signature.config';
import { ESignatureService } from './e-signature.service';

export class SignatureTokenDto {
  @IsString() @Length(43, 43) @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class SignatureAcceptDto extends SignatureTokenDto {
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) hashOriginal!: string;
  @IsBoolean() @Equals(true) consent!: boolean;
  @IsString() @IsIn([SIGNATURE_CONSENT_VERSION, DEMO_SIGNATURE_CONSENT_VERSION]) consentVersion!: string;
}

@Injectable()
export class SignaturePublicGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    requireSignatureSettings(this.config);
    const req = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    const now = Date.now(), key = req.ip || req.socket.remoteAddress || 'unknown';
    for (const [ip, value] of this.windows) if (now - value.start >= 60000) this.windows.delete(ip);
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= 10000) throw new HttpException('Inténtalo más tarde', 429);
      window = { start: now, count: 0 }; this.windows.set(key, window);
    }
    if (++window.count > 30) throw new HttpException('Espera un minuto antes de continuar', 429);
    // Per-IP budget is local; OTP sends and attempts also have durable DB-wide limits.
    return true;
  }
}

@Catch()
export class SignatureExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const body = error instanceof HttpException ? error.getResponse() : { statusCode: 503,
      message: 'La operación no pudo confirmarse. Consulta el estado antes de reintentar.' };
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
    // Deliberately do not log raw driver errors: they may contain a row or credentials.
  }
}

@UseFilters(new SignatureExceptionFilter())
@Controller('contracts/:id/signature')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ACCESS_ROLES.MANAGE_CONTRACTS)
export class ContractSignatureController {
  constructor(private readonly service: ESignatureService) {}
  @Get()
  status(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.status(id, user); }
  @Post()
  create(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.create(id, user); }
  @Post('retry-delivery')
  retryDelivery(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.retryDelivery(id, user); }
  @Patch('cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.cancel(id, user); }
  @Get('download')
  @Header('Cache-Control', 'no-store')
  async download(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    const pdf = await this.service.signedPdf(id, user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'attachment; filename="contrato-firmado.pdf"');
    return new StreamableFile(pdf);
  }
}

@UseFilters(new SignatureExceptionFilter())
@Controller('contract-signatures')
@UseGuards(SignaturePublicGuard)
export class PublicSignatureController {
  constructor(private readonly service: ESignatureService) {}
  @Post('view')
  view(@Body() dto: SignatureTokenDto) { return this.service.view(dto.token); }
  @Post('pdf')
  async pdf(@Body() dto: SignatureTokenDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'attachment; filename="contrato.pdf"');
    return new StreamableFile(await this.service.pdf(dto.token));
  }
  @Post('code')
  code(@Body() dto: SignatureTokenDto) { return this.service.requestCode(dto.token); }
  @Post('sign')
  sign(@Body() dto: SignatureAcceptDto, @Req() req: Request) {
    return this.service.sign(dto.token, dto.code ?? '', dto.hashOriginal, dto.consent, dto.consentVersion,
      req.ip ?? '', req.get('user-agent') ?? '');
  }
}
