import { Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrador')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Get('roles')
  roles() {
    return this.usersService.roles();
  }

  @Patch(':id/role')
  assignRole(
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.usersService.assignRole(userId, dto.roleId, currentUser);
  }
}
