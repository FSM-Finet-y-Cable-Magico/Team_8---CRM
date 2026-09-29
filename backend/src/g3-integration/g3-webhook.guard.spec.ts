import { ServiceUnavailableException } from '@nestjs/common';
import { G3WebhookGuard } from './g3-webhook.guard';

function context() {
  return { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never;
}

describe('Etapa 3 - seguridad webhook G3', () => {
  it('falla cerrado mientras el contrato de autenticacion no esta ratificado', async () => {
    const guard = new G3WebhookGuard({ authenticate: jest.fn().mockReturnValue(false) });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('permite autenticacion simulada en tests mediante la interfaz configurable', async () => {
    const guard = new G3WebhookGuard({ authenticate: jest.fn().mockReturnValue(true) });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
});
