/**
 * When the page itself runs into something (v0.9.19): a screen that broke, a script error nothing caught. It is said
 * to the app's own server, which writes it into the log on this computer (server/src/log.ts), so that "Copy details
 * for a bug report" has it. Nothing leaves the computer. What is said: the error's message, where in the code it
 * happened, and which screen was open (its path, without anything typed or searched for).
 */
import { ApiError } from './api';

const seen = new Set<string>();
/** The newest few, kept in the page as well: the details can still be copied when the server can't be reached. */
export const recentErrors: string[] = [];

function reportError(error: unknown, extra = '') {
  // A request the server refused is the server's to log (and it does, when it was unexpected).
  if (error instanceof ApiError) return;
  const e = error as { message?: unknown; stack?: unknown } | null;
  const message = typeof e?.message === 'string' && e.message ? e.message : String(error);
  const stack = `${typeof e?.stack === 'string' ? e.stack : ''}${extra}`;
  // Each different error once per visit, and no more than a handful: a screen that fails in a loop says so once.
  const key = `${message}\n${stack.slice(0, 300)}`;
  if (seen.has(key) || seen.size >= 10) return;
  seen.add(key);
  recentErrors.push(`${message}${stack ? `\n${stack}` : ''}`);
  if (recentErrors.length > 5) recentErrors.shift();
  void fetch('/api/log/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack, where: window.location.pathname }),
  }).catch(() => undefined);
}

/** A screen that broke: with the few components nearest the error (which screen, which part of it), not the whole tree. */
export function reportScreenError(error: Error, componentStack: string) {
  const nearest = componentStack.split('\n').filter((l) => l.trim()).slice(0, 6).join('\n');
  reportError(error, nearest ? `\nIn:\n${nearest}` : '');
}

let installed = false;
/** Errors that reach the window (a script error, a promise nobody was waiting for). */
export function watchForErrors() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (ev) => {
    // A picture or script that failed to load also fires "error", with nothing to say: only real errors.
    if (ev.error) reportError(ev.error);
  });
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}

/** Put text on the clipboard: the modern way, or (on a page served over plain HTTP to another device) the old one. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try the other way */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** The details for a bug report: the server's (system, library sizes, log) with what this page ran into on top. */
export async function bugReportDetails(error?: Error | null): Promise<string> {
  const here = [error ? `Error on the screen ${window.location.pathname}: ${error.message}\n${error.stack ?? ''}`.trim() : '', `Browser: ${navigator.userAgent}`, `Window: ${window.innerWidth}×${window.innerHeight}`].filter(Boolean).join('\n');
  try {
    const res = await fetch('/api/diagnostics');
    if (!res.ok) throw new Error(String(res.status));
    const d = (await res.json()) as { text: string };
    return `${here}\n\n${d.text}`;
  } catch {
    // The server didn't answer (or this is the players' handbook, which has no such thing): what the page knows.
    return [here, ...recentErrors.filter((r) => !error || !r.startsWith(error.message))].join('\n\n');
  }
}
