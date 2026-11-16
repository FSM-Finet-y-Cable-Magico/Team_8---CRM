import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { ControlResponse } from '../commercial/control-book-model';
import type { ExpiryCustomerAlert } from '../../shared/components/ExpiryCustomerCard';
import { isRefreshPaused, useAutoRefresh } from '../../shared/hooks/useAutoRefresh';

export type DashboardFinance = {
  overdueBalance: number; totalDebt: number; overdueInvoiceCount: number; overdueCustomerCount: number;
  alerts: ExpiryCustomerAlert[];
};
type ExpiringPlans = { items: Array<Pick<ExpiryCustomerAlert, 'idContrato' | 'cliente' | 'plan' | 'fechaVencimiento' | 'diasRestantes'> & {
  idFactura: number; idCliente?: number | null;
}> };

/** Same invoice balances and effective due dates as the control book; no synthetic contract deadlines. */
export function useDashboardFinance(companyKey: string, enabled: boolean, days = 7) {
  const [stored, setStored] = useState<{ key: string; data: DashboardFinance } | null>(null);
  const [loading, setLoading] = useState(enabled);
  const pending = useRef<AbortController | null>(null);
  const key = `${enabled}:${companyKey}:${days}`;
  const currentKey = useRef(key); currentKey.current = key;
  const load = useCallback(async (background = false) => {
    const ids = companyKey.split(',').map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    if (!enabled || !ids.length) { setLoading(false); return true; }
    if (pending.current) return true;
    const controller = new AbortController(); pending.current = controller;
    const current = () => !controller.signal.aborted && currentKey.current === key;
    if (!background) setLoading(true);
    try {
      const results = await Promise.all(ids.map(async idEmpresa => {
        const [book, alerts] = await Promise.all([
          api.get<ControlResponse>('/commercial/control-book', { params: { idEmpresa, groupBy: 'document', conDeuda: true, vencido: true, page: 1, pageSize: 100 }, signal: controller.signal, timeout: 15000 }),
          api.get<ExpiringPlans>('/commercial/expiring-plans', { params: { idEmpresa, days }, signal: controller.signal, timeout: 15000 }),
        ]);
        const rows = [...book.data.items];
        // A shared customer may owe both companies. Count that person once in Consolidado.
        if (ids.length > 1) for (let page = 2; page <= book.data.pagination.totalPages; page++) {
          const { data } = await api.get<ControlResponse>('/commercial/control-book', { params: { idEmpresa, groupBy: 'document', conDeuda: true, vencido: true, page, pageSize: 100 }, signal: controller.signal, timeout: 15000 });
          rows.push(...data.items);
        }
        return { book: book.data, rows, alerts: alerts.data.items.map(alert => ({ ...alert, idEmpresa, rut: null, estado: 'Saldo pendiente' })) };
      }));
      if (!current() || background && isRefreshPaused()) return true;
      const data: DashboardFinance = {
        overdueBalance: results.reduce((sum, result) => sum + result.book.summary.totalDebt, 0),
        totalDebt: results.reduce((sum, result) => sum + result.book.dashboard.totalDebt, 0),
        overdueInvoiceCount: results.reduce((sum, result) => sum + result.book.dashboard.overdueInvoiceCount, 0),
        overdueCustomerCount: ids.length === 1 ? results[0].book.dashboard.overdueCustomerCount : new Set(results.flatMap(result => result.rows.map(row => row.idCliente))).size,
        alerts: results.flatMap(result => result.alerts).sort((a, b) => a.diasRestantes - b.diasRestantes),
      };
      setStored(previous => previous?.key === key && JSON.stringify(previous.data) === JSON.stringify(data) ? previous : { key, data });
      return true;
    } catch {
      if (current()) { setLoading(false); controller.abort(); }
      return false;
    } finally {
      if (current()) setLoading(false);
      if (pending.current === controller) pending.current = null;
    }
  }, [companyKey, days, enabled, key]);
  useEffect(() => {
    void load();
    return () => { pending.current?.abort(); pending.current = null; };
  }, [load]);
  useAutoRefresh(() => load(true), enabled && Boolean(companyKey));
  return { data: stored?.key === key ? stored.data : null, loading, refresh: load };
}
