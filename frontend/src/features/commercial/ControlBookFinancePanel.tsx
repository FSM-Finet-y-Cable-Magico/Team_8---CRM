import { useEffect, useState } from 'react';
import { type Customer } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { ExternalTaxDocumentsPanel } from '../billing/ExternalTaxDocumentsPanel';
import { ControlRow, type InvoiceFocus } from './control-book-model';
import type { ControlBookRecordView } from './ControlBookDrawer';
import { ControlBookTaxDocument } from './ControlBookTaxDocument';

export function ControlBookFinancePanel({ row, scope, customers, permissions, focusedInvoice, onFocusConsumed, view }: {
  row: ControlRow; scope: string; customers: Customer[]; permissions: DashboardPermissions; revision: number; onChanged: () => void;
  focusedInvoice: InvoiceFocus | null; onFocusConsumed: () => void; view: ControlBookRecordView;
}) {
  const [documentsVisited, setDocumentsVisited] = useState(view === 'documents');
  useEffect(() => { if (view === 'documents') setDocumentsVisited(true); }, [view]);
  return <>
    {permissions.viewBilling && focusedInvoice && <ControlBookTaxDocument key={`${focusedInvoice.idFactura}-${focusedInvoice.idCuota ?? 'invoice'}`} invoice={focusedInvoice} scope={scope} onClose={onFocusConsumed}/>}
    {permissions.viewExternalTaxDocuments && documentsVisited && <section className="control-record-documents" aria-label="Documentos tributarios del cliente" hidden={view !== 'documents'}>
      <ExternalTaxDocumentsPanel key={scope + '-' + row.idCliente} customers={customers} scope={scope} writeCompanyId={Number(scope)} canManage={permissions.manageExternalTaxDocuments} fixedCustomerId={row.idCliente} active={view === 'documents'}/>
    </section>}
  </>;
}
