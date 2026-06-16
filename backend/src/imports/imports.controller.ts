import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('clients')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importClients(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Query('idEmpresa') idEmpresa?: string,
  ) {
    return this.importsService.importClients(file, user, idEmpresa ? Number(idEmpresa) : undefined);
  }
}
