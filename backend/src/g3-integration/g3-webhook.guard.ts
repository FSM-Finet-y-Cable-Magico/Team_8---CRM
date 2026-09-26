import { CanActivate, ExecutionContext, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Request } from 'express';

export const G3_WEBHOOK_AUTHENTICATOR = Symbol('G3_WEBHOOK_AUTHENTICATOR');

export interface G3WebhookAuthenticator {
  authenticate(request: Request): boolean | Promise<boolean>;
}

@Injectable()
export class PendingG3WebhookAuthenticator implements G3WebhookAuthenticator {
  authenticate() {
    return false;
  }
}

@Injectable()
export class G3WebhookGuard implements CanActivate {
  constructor(@Inject(G3_WEBHOOK_AUTHENTICATOR) private readonly authenticator: G3WebhookAuthenticator) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (await this.authenticator.authenticate(request)) return true;
    throw new ServiceUnavailableException('PENDIENTE_CONTRATO_AUTENTICACION_WEBHOOK');
  }
}
