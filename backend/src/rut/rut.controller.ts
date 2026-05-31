import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { validateRut } from './rut.util';

class ValidateRutDto {
  @IsString()
  rut!: string;
}

@Controller('rut')
export class RutController {
  @Post('validate')
  validate(@Body() dto: ValidateRutDto) {
    return validateRut(dto.rut);
  }
}
