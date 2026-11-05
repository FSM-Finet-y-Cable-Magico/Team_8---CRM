import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { InstallationHistoryService } from './installation-history.service';

@Controller('integrations/g3/installation-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstallationHistoryController {
  constructor(private readonly history: InstallationHistoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.history.list(user, scope);
  }
}
