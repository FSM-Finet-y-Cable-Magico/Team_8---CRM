import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { SaveUserDto, ResetPasswordDto } from './dto/save-user.dto';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ACCESS_ROLES.ADMIN_ONLY)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Post()
  create(@Body() dto: SaveUserDto, @CurrentUser() user: AuthUser) { return this.usersService.save(null, dto, user); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveUserDto, @CurrentUser() user: AuthUser) { return this.usersService.save(id, dto, user); }

  @Patch(':id/password')
  password(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() user: AuthUser) { return this.usersService.resetPassword(id, dto.password, user); }

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
