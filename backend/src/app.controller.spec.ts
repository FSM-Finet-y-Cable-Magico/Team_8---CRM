import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns the API status', () => {
    const controller = new AppController();

    expect(controller.status()).toEqual({
      service: 'CRM FiNet API',
      status: 'ok',
    });
  });
});
