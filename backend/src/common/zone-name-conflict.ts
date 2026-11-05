import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function throwZoneNameConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Ya existe una zona o cobertura con ese nombre en esta empresa. Usa otro nombre.');
  }
  throw error;
}
