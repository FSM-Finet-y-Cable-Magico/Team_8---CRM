import { Module } from '@nestjs/common';
import { RutController } from './rut.controller';

@Module({
  controllers: [RutController],
})
export class RutModule {}
