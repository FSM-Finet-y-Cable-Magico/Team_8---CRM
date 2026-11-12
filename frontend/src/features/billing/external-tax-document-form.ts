export type ExternalDocumentForm = {
  tipoDocumento: string; folioONumero: string; emisorProveedor: string; fechaEmision: string;
  montoNeto: string; montoExento: string; iva: string; montoTotal: string; estado: string;
  idCliente: string; idContrato: string; idFactura: string; idCargoAdicional: string;
  urlDocumento: string; referenciaExterna: string;
};

export function validateExternalDocumentForm(form: ExternalDocumentForm) {
  const errors: Record<string, string> = {};
  if (!['BOLETA', 'FACTURA'].includes(form.tipoDocumento)) errors.tipoDocumento = 'Selecciona boleta o factura.';
  if (!form.folioONumero.trim()) errors.folioONumero = 'Ingresa el folio fiscal del documento, no la operación bancaria.';
  if (form.emisorProveedor.trim().length < 2) errors.emisorProveedor = 'Ingresa el emisor o proveedor real del documento.';
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(form.fechaEmision) ? new Date(`${form.fechaEmision}T00:00:00.000Z`) : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== form.fechaEmision) errors.fechaEmision = 'Ingresa una fecha de emisión válida.';
  const amounts = ['montoNeto', 'montoExento', 'iva', 'montoTotal'] as const;
  for (const field of amounts) {
    const value = form[field].trim();
    if (!value && field !== 'montoTotal') continue;
    if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 999999999999.99) {
      errors[field] = 'Ingresa un monto no negativo con hasta dos decimales.';
    }
  }
  const components = amounts.slice(0, 3).filter(field => form[field].trim());
  const cents = (value: string) => Math.round(Number(value) * 100);
  if (!amounts.some(field => errors[field])) {
    const sum = components.reduce((total, field) => total + cents(form[field]), 0);
    if (sum > cents(form.montoTotal) || (components.length === 3 && sum !== cents(form.montoTotal))) {
      errors.montoTotal = 'Neto, exento e IVA no pueden superar el total; si completas los tres deben sumar el total.';
    }
  }
  for (const field of ['idCliente', 'idContrato', 'idFactura', 'idCargoAdicional'] as const) {
    const value = form[field];
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647)) {
      errors[field] = 'Selecciona una referencia real del CRM; no ingreses un código bancario.';
    }
  }
  if (form.urlDocumento.trim()) {
    try {
      const url = new URL(form.urlDocumento.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch { errors.urlDocumento = 'Usa una URL http o https sin credenciales.'; }
  }
  return errors;
}
