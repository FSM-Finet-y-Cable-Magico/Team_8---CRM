import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Customer } from '../../api';
import { Modal } from '../../shared/components';
import { ExternalTaxDocumentsPanel } from '../billing/ExternalTaxDocumentsPanel';

/** Global entry, independent of selecting a customer or an invoice in Cartera. */
export function ControlBookExternalDocuments({ active, scope, writeCompanyId, customers, canView, canManage, disabled }: {
  active: boolean; scope: string; writeCompanyId: number; customers: Customer[];
  canView: boolean; canManage: boolean; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [scope, writeCompanyId, active]);
  if (!canView) return null;
  return <>
    <button type="button" className="control-ribbon-command" disabled={disabled} onClick={() => setOpen(true)}>
      <FileText size={21} aria-hidden="true"/>Documentos externos
    </button>
    <Modal title="Documentos tributarios externos por empresa" open={open && active} onClose={() => setOpen(false)}>
      <p>Registra documentos tributarios ya existentes, vinculados a clientes o sin cliente. Esta operación no registra pagos ni emite documentos fiscales.</p>
      <p>Un documento sin cliente no se clasifica automáticamente como compra o venta. Conserva el emisor y la referencia del documento original.</p>
      {open && active && <ExternalTaxDocumentsPanel key={scope + '-' + writeCompanyId} customers={customers}
        scope={scope} writeCompanyId={writeCompanyId} canManage={canManage}/>}
    </Modal>
  </>;
}
