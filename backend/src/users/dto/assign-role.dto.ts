import { IsInt, Min } from 'class-validator';

export class AssignRoleDto {
  @IsInt()
  @Min(1)
  roleId!: number;
}
