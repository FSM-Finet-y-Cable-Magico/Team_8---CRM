import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Etapa 4 - dependencias externas explícitas', () => {
  const frontendRoot = resolve(__dirname, '../../../frontend/src');
  const inventoryUi = readFileSync(resolve(frontendRoot, 'features/inventory/InventoryPanel.tsx'), 'utf8');
  const deprecatedConsumers = [
    'features/inventory/InventoryAdvancedPanel.tsx',
    'features/installations/InstallationCompletionForm.tsx',
    'features/work-orders/WorkOrdersPanel.tsx',
  ].map((file) => readFileSync(resolve(frontendRoot, file), 'utf8')).join('\n');

  it('CU-61 no presenta consumo legacy como dato actual y conserva el histórico identificado', () => {
    expect(inventoryUi).toContain('CU-61: PARCIAL_BLOQUEADO_G1_P2');
    expect(inventoryUi).toContain('los reportes locales disponibles son únicamente históricos');
    expect(inventoryUi).toContain('Fuente: LEGACY_LOCAL');
  });

  it('CU-18 declara la dependencia G3 sin atribuir poste o NAP a G1', () => {
    expect(inventoryUi).toContain('CU-18: PARCIAL_BLOQUEADO_G3');
    expect(inventoryUi).toContain('Poste y NAP pertenecen a G3');
  });

  it('la garantía física se presenta como G1 de solo lectura', () => {
    expect(inventoryUi).toContain('La garantía física proviene de G1 y es de solo lectura.');
  });

  it('los componentes heredados ya no llaman writes físicos ni cierre local', () => {
    expect(deprecatedConsumers).not.toContain("api.post('/inventory/");
    expect(deprecatedConsumers).not.toContain("api.patch('/inventory/");
    expect(deprecatedConsumers).not.toContain('/complete-installation');
    expect(deprecatedConsumers).not.toContain('/services/${');
    expect(deprecatedConsumers).toContain('No hay cierre local ni asignación');
  });
});