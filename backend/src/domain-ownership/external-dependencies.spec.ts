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

  it('la consulta de inventario usa G1 y no mezcla registros locales como disponibilidad actual', () => {
    expect(inventoryUi).toContain('/integrations/g1/equipment-types');
    expect(inventoryUi).toContain('/integrations/g1/units/');
    expect(inventoryUi).not.toContain('props.inventory');
    expect(inventoryUi).not.toContain('LEGACY_LOCAL');
    expect(inventoryUi).not.toContain('PARCIAL_BLOQUEADO');
  });

  it('la consulta G1 no presenta postes o NAP como equipos de su catálogo', () => {
    expect(inventoryUi).not.toContain('numeroPoste');
    expect(inventoryUi).not.toContain('cajasNap');
    expect(inventoryUi).not.toContain('CU-18');
  });

  it('el catálogo y la garantía física se presentan sin acciones de escritura', () => {
    expect(inventoryUi).toContain('currentUnit.item.garantia');
    expect(inventoryUi).not.toMatch(/api\.(?:post|patch|put|delete)\s*\(/);
  });

  it('los componentes heredados ya no llaman writes físicos ni cierre local', () => {
    expect(deprecatedConsumers).not.toContain("api.post('/inventory/");
    expect(deprecatedConsumers).not.toContain("api.patch('/inventory/");
    expect(deprecatedConsumers).not.toContain('/complete-installation');
    expect(deprecatedConsumers).not.toContain('/services/${');
    expect(deprecatedConsumers).toContain('No hay cierre local ni asignación');
  });
});
