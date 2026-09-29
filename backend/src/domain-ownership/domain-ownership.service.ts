import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';

@Injectable()
export class DomainOwnershipService {
  constructor(private readonly audit: AuditService) {}

  async rejectInventoryWrite(currentUser: AuthUser, endpoint: string): Promise<never> {
    await this.audit.record({
      idUsuario: currentUser.idUsuario,
      accion: 'INTENTO_WRITE_INVENTARIO_DEPRECADO',
      entidadAfectada: 'inventario_g1',
      valorNuevo: { endpoint, idEmpresa: currentUser.idEmpresa, owner: 'G1' },
    });
    throw new ConflictException({
      code: 'INVENTORY_OWNED_BY_G1',
      message: 'El inventario físico es administrado por el sistema de Inventario/Bodega.',
    });
  }

  async rejectG3Write(currentUser: AuthUser, endpoint: string): Promise<never> {
    await this.audit.record({
      idUsuario: currentUser.idUsuario,
      accion: 'INTENTO_WRITE_DOMINIO_G3_DEPRECADO',
      entidadAfectada: 'operacion_g3',
      valorNuevo: { endpoint, idEmpresa: currentUser.idEmpresa, owner: 'G3' },
    });
    throw new GoneException({
      code: 'G3_INTEGRATION_REQUIRED',
      message: 'La operación técnica debe ejecutarse en el sistema FSM/Terreno.',
    });
  }
}
