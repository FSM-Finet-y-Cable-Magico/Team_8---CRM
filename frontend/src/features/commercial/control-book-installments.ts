export type InstallmentDetail = {
  idConvenio: number; idEmpresa: number; idFactura: number; estadoConvenio: string;
  cuotas: Array<{ idCuota: number; numero: number; monto: string; imputado: string; saldo: string | null; fechaVencimiento: string; estado: string }>;
  operaciones: Array<{ idPago: number; tipo: string; detalles: Array<{ idCuota: number; monto: string }> }>;
};

export function installmentPaymentIds(detail: InstallmentDetail, idCuota: number) {
  const totals = new Map<number, number>();
  for (const operation of detail.operaciones ?? []) {
    const amount = operation.detalles.filter(line => line.idCuota === idCuota).reduce((sum, line) => sum + Number(line.monto), 0);
    totals.set(operation.idPago, (totals.get(operation.idPago) ?? 0) + (operation.tipo === 'APLICAR' ? amount : -amount));
  }
  return [...totals].filter(([, amount]) => amount > 0.001).map(([id]) => id);
}
