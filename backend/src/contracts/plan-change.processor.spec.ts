import { ConfigService } from '@nestjs/config';
import { PlanChangeProcessor } from './plan-change.processor';
describe('PlanChangeProcessor dependencia fisica',()=>{
 it('registra P2021 como pendiente de reconciliacion sin fingir exito',async()=>{
  const p=new PlanChangeProcessor({applyDuePlanChanges:jest.fn().mockRejectedValue({code:'P2021',message:'private-data'})} as never, new ConfigService());
  const log=jest.spyOn((p as any).logger,'error').mockImplementation(()=>{});
  await (p as any).tick();await (p as any).tick();
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('PENDIENTE_RECONCILIACION_GLOBAL: falta una tabla requerida por cambios de plan (P2021).');
  log.mockRestore();
 });
});

describe('PlanChangeProcessor ciclo de vida y opt-out QA', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

  function setup(value?: string) {
    const contracts = { applyDuePlanChanges: jest.fn().mockResolvedValue(undefined) };
    const processor = new PlanChangeProcessor(contracts as never, new ConfigService(
      value === undefined ? {} : { PLAN_CHANGE_PROCESSOR_ENABLED: value },
    ));
    return { processor, contracts };
  }

  it.each([undefined, 'true', 'FALSE', ' false ', ''])('mantiene el arranque habilitado para %s', async value => {
    const { processor, contracts } = setup(value);
    const interval = jest.spyOn(global, 'setInterval');
    processor.onModuleInit();
    expect(contracts.applyDuePlanChanges).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(contracts.applyDuePlanChanges).toHaveBeenCalledTimes(2);
    processor.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('false no ejecuta tick inicial ni programa timer ni aplica cambios, incluso con tick invocado', async () => {
    const { processor, contracts } = setup('false');
    const tick = jest.spyOn(processor as any, 'tick');
    const interval = jest.spyOn(global, 'setInterval');
    processor.onModuleInit();
    expect(tick).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(180_000);
    expect(contracts.applyDuePlanChanges).not.toHaveBeenCalled();
    await (processor as any).tick();
    expect(contracts.applyDuePlanChanges).not.toHaveBeenCalled();
    processor.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('el apagado cancela el timer y bloquea callbacks tardios y otro init', async () => {
    const { processor, contracts } = setup();
    const interval = jest.spyOn(global, 'setInterval');
    processor.onModuleInit();
    const callback = interval.mock.calls[0][0] as () => void;
    processor.onModuleDestroy();
    processor.onModuleDestroy();
    callback();
    processor.onModuleInit();
    await jest.advanceTimersByTimeAsync(180_000);
    expect(contracts.applyDuePlanChanges).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('no solapa ejecuciones ni inicia otra despues del apagado con una en curso', async () => {
    const { processor, contracts } = setup();
    let finish!: () => void;
    contracts.applyDuePlanChanges.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    processor.onModuleInit();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(contracts.applyDuePlanChanges).toHaveBeenCalledTimes(1);
    processor.onModuleDestroy();
    finish();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(contracts.applyDuePlanChanges).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
