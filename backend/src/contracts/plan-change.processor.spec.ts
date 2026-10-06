import { PlanChangeProcessor } from './plan-change.processor';
describe('PlanChangeProcessor dependencia fisica',()=>{
 it('registra P2021 como pendiente de reconciliacion sin fingir exito',async()=>{
  const p=new PlanChangeProcessor({applyDuePlanChanges:jest.fn().mockRejectedValue({code:'P2021',message:'private-data'})} as never);
  const log=jest.spyOn((p as any).logger,'error').mockImplementation(()=>{});
  await (p as any).tick();await (p as any).tick();
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('PENDIENTE_RECONCILIACION_GLOBAL: falta una tabla requerida por cambios de plan (P2021).');
  log.mockRestore();
 });
});
