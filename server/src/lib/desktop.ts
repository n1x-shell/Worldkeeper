/**
 * The desktop app (src-tauri) runs this server with WORLDKEEPER_PARENT_PID set. Its window is a web view that ignores
 * links meant for a new tab (the Player View button, links to GitHub), so the client asks the server to open those in
 * the system's default browser instead.
 */
import { spawn } from 'node:child_process';
import { badRequest } from './errors.js';

export const isDesktop = () => !!process.env.WORLDKEEPER_PARENT_PID;

/** Open an http(s) address in the default browser, without a shell (so nothing in the address is run as a command). */
export function openInBrowser(raw: string, run: typeof spawn = spawn) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Not an address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Only web addresses can be opened');
  const href = url.toString();
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', href]] : process.platform === 'darwin' ? ['open', [href]] : ['xdg-open', [href]];
  const child = run(cmd, args as string[], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
  return { opened: href };
}

/** Show a folder in the system's file manager (desktop app only; the folder is the app's own, never one asked for). */
export function openFolder(dir: string, run: typeof spawn = spawn) {
  const [cmd, args] = process.platform === 'win32' ? ['explorer', [dir]] : process.platform === 'darwin' ? ['open', [dir]] : ['xdg-open', [dir]];
  const child = run(cmd, args as string[], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
  return { opened: dir };
}
