import { HealthController } from './health.controller';
import { GLOBAL_COLUMNS } from './global-columns.generated';
describe('Health y readiness global', () => {
  function setup(rows: unknown = GLOBAL_COLUMNS) {
    const query=jest.fn().mockResolvedValue(rows);
    const tx={$executeRawUnsafe:jest.fn(),$queryRawUnsafe:query};
    const controller=new HealthController({$transaction:jest.fn(fn=>fn(tx))} as never,{get:jest.fn()} as never);
    return {controller,query,tx};
  }
  it('liveness no necesita BD y readiness detecta contrato completo',async()=>{
    const {controller,query,tx}=setup();
    expect(controller.health()).toEqual({application:'UP'});expect(query).not.toHaveBeenCalled();
    expect(await controller.ready()).toMatchObject({database:'UP',global_schema:'READY',g1_configured:false,g3_configured:false});
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
  });
  it('sin historial_cambio_plan conserva app UP y schema DEGRADED',async()=>{
    const {controller}=setup(GLOBAL_COLUMNS.filter(c=>c.table!=='historial_cambio_plan'));
    expect(await controller.ready()).toMatchObject({application:'UP',database:'UP',global_schema:'DEGRADED'});
  });
  it('tipo/nulabilidad incompatibles no quedan READY',async()=>{
    const rows=GLOBAL_COLUMNS.map(c=>c.table==='usuario'&&c.name==='version_sesion'?{...c,nullable:false}:c);
    expect(await setup(rows).controller.ready()).toMatchObject({global_schema:'DEGRADED',different_columns:1});
  });
  it('error saneado sin credenciales del driver',async()=>{
    const {controller,query}=setup();query.mockRejectedValue(new Error('private-driver-data'));
    await expect(controller.ready()).rejects.toMatchObject({response:{application:'UP',database:'DOWN',global_schema:'DEGRADED'}});
    await expect(controller.ready()).rejects.not.toThrow('private-driver-data');
  });
});
