import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    const details = (data as { details?: { path?: string[]; message?: string }[] })?.details;
    const extra = Array.isArray(details) ? ': ' + details.map((d) => `${d.path?.join('.') ?? ''} ${d.message ?? ''}`.trim()).join('; ') : '';
    throw new ApiError(res.status, msg + extra, data);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, field: string, file: File) => {
    const fd = new FormData();
    fd.append(field, file);
    return request<T>('POST', url, fd);
  },
};

export const qs = (params: Record<string, string | number | boolean | undefined | null | string[]>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Minimal data hook: fetches on mount / when url changes; `reload()` refetches; `setData` for optimistic updates. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e as Error);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave. Call `schedule(value)` on every change; the latest value is saved after `delay` ms.
 * `flush()` saves immediately (used on blur / navigation). Status is exposed for a visible indicator.
 */
export function useAutosave<T>(save: (v: T) => Promise<unknown>, delay = 900) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const running = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current) await running.current;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState('saving');
    running.current = (async () => {
      try {
        await saveRef.current(p.v);
        setState(pending.current ? 'dirty' : 'saved');
        setError(null);
      } catch (e) {
        setState('error');
        setError((e as Error).message);
        if (!pending.current) pending.current = p;
      }
    })();
    await running.current;
    running.current = null;
  }, []);

  const schedule = useCallback(
    (v: T) => {
      pending.current = { v };
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void flush();
    };
  }, [flush]);

  return { state, error, schedule, flush };
}
