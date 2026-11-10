/** Defensive JSON helpers for columns stored as JSON text. */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const now = () => new Date().toISOString();
