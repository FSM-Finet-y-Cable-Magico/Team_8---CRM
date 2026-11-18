import { lazy, Suspense, ComponentProps } from 'react';

// DEMO CU-06 | Entrada del mapa vigente: carga CommercialCoveragePicker; CoveragePicker.tsx es una implementacion anterior.
const Picker = lazy(() => import('./CommercialCoveragePicker').then(module => ({ default: module.CoveragePicker })));
export type { CoverageLocation, CoverageResult } from './CommercialCoveragePicker';
export { CoverageZonesPanel } from './CoverageZonesPanel';

export function CoveragePicker(props: ComponentProps<typeof Picker>) {
  return <Suspense fallback={<p>Cargando mapa de cobertura…</p>}><Picker {...props} /></Suspense>;
}
