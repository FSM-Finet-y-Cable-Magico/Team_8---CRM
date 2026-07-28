import { Body, Controller, Get, Headers, Ip, Post, UnauthorizedException } from '@nestjs/common';
import { CreatePortalTicketDto } from './dto/create-portal-ticket.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { RegeneratePortalTvipDto } from './dto/regenerate-portal-tvip.dto';
import { WifiChangeRequestDto } from './dto/wifi-change-request.dto';
import { PortalService } from './portal.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Post('login')
  login(@Body() dto: PortalLoginDto, @Ip() ip?: string) {
    return this.portalService.login(dto, ip);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.portalService.me(this.token(authorization));
  }

  @Get('services')
  services(@Headers('authorization') authorization?: string) {
    return this.portalService.services(this.token(authorization));
  }

  @Get('contracts')
  contracts(@Headers('authorization') authorization?: string) {
    return this.portalService.contracts(this.token(authorization));
  }

  @Get('tickets')
  tickets(@Headers('authorization') authorization?: string) {
    return this.portalService.tickets(this.token(authorization));
  }

  @Get('ticket-categories')
  ticketCategories(@Headers('authorization') authorization?: string) {
    return this.portalService.ticketCategories(this.token(authorization));
  }

  @Post('tickets')
  createTicket(@Headers('authorization') authorization: string | undefined, @Body() dto: CreatePortalTicketDto) {
    return this.portalService.createTicket(this.token(authorization), dto);
  }

  @Post('wifi-change-request')
  wifiChangeRequest(@Headers('authorization') authorization: string | undefined, @Body() dto: WifiChangeRequestDto) {
    return this.portalService.wifiChangeRequest(this.token(authorization), dto);
  }

  @Get('tvip')
  tvip(@Headers('authorization') authorization?: string) {
    return this.portalService.tvip(this.token(authorization));
  }

  @Post('tvip/regenerate')
  regenerateTvip(@Headers('authorization') authorization: string | undefined, @Body() dto: RegeneratePortalTvipDto) {
    return this.portalService.regenerateTvip(this.token(authorization), dto);
  }

  private token(authorization?: string) {
    const [type, token] = authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token de portal requerido');
    }

    return token;
  }
}
