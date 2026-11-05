import { serviceTypeFromPlan } from './service-type';

describe('serviceTypeFromPlan', () => {
  it.each([
    ['FIBRA', 'Internet'],
    ['Fibra Óptica', 'Internet'],
    ['Internet', 'Internet'],
    ['Internet+TV', 'Internet + Television'],
    ['Televisión', 'Television'],
  ])('convierte %s al servicio %s', (planType, expected) => {
    expect(serviceTypeFromPlan(planType)).toBe(expected);
  });
});
