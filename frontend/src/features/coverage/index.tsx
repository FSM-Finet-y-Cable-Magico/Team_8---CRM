import { lazy, Suspense, ComponentProps } from 'react';

const Picker = lazy(() => import('./CoveragePicker').then(module => ({ default: module.CoveragePicker })));
export type { CoverageLocation, CoverageResult } from './CoveragePicker';

export function CoveragePicker(props: ComponentProps<typeof Picker>) {
  return <Suspense fallback={<p>Cargando mapa de cobertura…</p>}><Picker {...props} /></Suspense>;
}
