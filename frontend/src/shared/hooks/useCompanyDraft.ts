import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

export type CompanyDraft<T> = {
  draft: T;
  onChange: Dispatch<SetStateAction<T>>;
};

// Keep unfinished input for the current CRM session, without browser storage.
export function useCompanyDraft<T>(companyId: number, createDraft: () => T): CompanyDraft<T> {
  const [drafts, setDrafts] = useState(() => new Map<number, T>());
  const initialDraft = useMemo(createDraft, [companyId, createDraft]);
  const onChange = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    setDrafts(current => {
      const previous = current.has(companyId) ? current.get(companyId)! : initialDraft;
      const next = typeof update === 'function' ? (update as (value: T) => T)(previous) : update;
      if (Object.is(previous, next)) return current;
      return new Map(current).set(companyId, next);
    });
  }, [companyId, initialDraft]);

  return { draft: drafts.has(companyId) ? drafts.get(companyId)! : initialDraft, onChange };
}
