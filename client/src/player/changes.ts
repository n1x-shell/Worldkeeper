/**
 * "Something changed" from the server (v0.9.7): one open connection for each address, shared by everything on the
 * page that listens. Listeners are told at once (a few changes close together count as one), when the page comes back
 * into view, and now and then anyway in case the connection was lost without a word. A hidden page lets its
 * connection go, so tabs left open in the background don't hold one.
 */
type Listener = () => void;

interface Line {
  listeners: Set<Listener>;
  source: EventSource | null;
  soon: number | undefined;
  every: number | undefined;
}
const lines = new Map<string, Line>();

/** How long between looks when nothing has been heard (the connection may have gone quiet). */
const ANYWAY_MS = 30000;

function tell(line: Line) {
  window.clearTimeout(line.soon);
  line.soon = window.setTimeout(() => {
    for (const l of line.listeners) l();
  }, 150);
}

function connect(url: string, line: Line) {
  if (line.source || document.hidden || typeof EventSource === 'undefined') return;
  const s = new EventSource(url);
  s.addEventListener('change', () => tell(line));
  line.source = s;
}

function disconnect(line: Line) {
  line.source?.close();
  line.source = null;
}

let watching = false;
function watchVisibility() {
  if (watching) return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    for (const [url, line] of lines) {
      if (document.hidden) disconnect(line);
      else {
        connect(url, line);
        tell(line); // what happened while the page was away
      }
    }
  });
}

/** Call `listener` whenever the server at `url` says something changed. Returns how to stop. */
export function onServerChange(url: string, listener: Listener): () => void {
  watchVisibility();
  let line = lines.get(url);
  if (!line) lines.set(url, (line = { listeners: new Set(), source: null, soon: undefined, every: undefined }));
  const l = line;
  l.listeners.add(listener);
  connect(url, l);
  l.every ??= window.setInterval(() => !document.hidden && tell(l), ANYWAY_MS);
  return () => {
    l.listeners.delete(listener);
    if (l.listeners.size) return;
    disconnect(l);
    window.clearInterval(l.every);
    window.clearTimeout(l.soon);
    lines.delete(url);
  };
}
