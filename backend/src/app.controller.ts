import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  status() {
    return {
      service: 'CRM FiNet API',
      status: 'ok',
    };
  }
}
