import { lazy, Suspense, ComponentProps } from 'react';

const Picker = lazy(() => import('./CommercialCoveragePicker').then(module => ({ default: module.CoveragePicker })));
export type { CoverageLocation, CoverageResult } from './CommercialCoveragePicker';
export { CoverageZonesPanel } from './CoverageZonesPanel';

export function CoveragePicker(props: ComponentProps<typeof Picker>) {
  return <Suspense fallback={<p>Cargando mapa de cobertura…</p>}><Picker {...props} /></Suspense>;
}
