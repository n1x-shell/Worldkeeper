/**
 * The GM app from another device (v0.9.14): a tablet at the table, a laptop in another room. On the computer the app
 * runs on, Settings holds the password and opens or closes the app to the network. From another device the app asks
 * for that password first, and nothing of the library is sent before it is given.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { KeyRound, LogOut, MonitorSmartphone, Wifi, WifiOff } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { Card, Field, Loading, ask, toast } from './ui';
import { QrCode } from './HandbookAddress';

interface Session {
  remote: boolean;
  signedIn: boolean;
}

/** Shows the GM app, or (on another device, not signed in) the sign-in page. */
export function RemoteGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let live = true;
    const check = () =>
      api
        .get<Session>('/api/remote/session')
        .then((s) => live && setSession(s))
        // An older server, or none: the app shows its own errors.
        .catch(() => live && setSession({ remote: false, signedIn: true }));
    void check();
    // A session that ran out (or was ended on the computer) while the app was open.
    const expired = () => setSession((s) => (s?.remote ? { remote: true, signedIn: false } : s));
    window.addEventListener('wk-sign-in', expired);
    return () => {
      live = false;
      window.removeEventListener('wk-sign-in', expired);
    };
  }, []);
  if (!session) return <Loading />;
  if (session.remote && !session.signedIn) return <SignIn onSignedIn={() => setSession({ remote: true, signedIn: true })} />;
  return <>{children}</>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        className="panel elev-2 w-full max-w-sm space-y-4 p-6"
        data-testid="gm-sign-in"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await api.post('/api/remote/login', { password });
            onSignedIn();
          } catch (x) {
            setErr((x as Error).message);
            setPassword('');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <KeyRound size={20} className="text-gold" aria-hidden />
          <h1 className="font-display text-xl text-gold">The Worldkeeper</h1>
        </div>
        <p className="text-sm text-dim">This is the GM’s app. Give the password the GM set on the computer it runs on.</p>
        <Field label="Password">
          <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {err && (
          <p className="text-sm text-danger" role="alert">
            {err}
          </p>
        )}
        <button className="btn-primary w-full justify-center" type="submit" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-dim">Players: this isn’t the handbook. Ask your GM for the table’s address.</p>
      </form>
    </div>
  );
}

interface Status {
  open: boolean;
  port: number;
  addresses: string[];
  opened_at: string | null;
  hasPassword: boolean;
  sessions: number;
}

/** In Settings: on the computer, the password and the door; on another device, signing out. */
export function RemoteAccessPanel() {
  const { data: session } = useApi<Session>('/api/remote/session');
  if (!session) return null;
  return session.remote ? <RemoteHere /> : <RemoteControls />;
}

function RemoteHere() {
  return (
    <Card title="This device" icon={<MonitorSmartphone size={16} />} className="space-y-3">
      <p className="text-sm">You’re using the GM app from another device, signed in with the GM’s password. The password, and opening and closing the app to the network, are changed on the computer the app runs on.</p>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await api.post('/api/remote/logout');
          window.location.reload();
        }}
      >
        <LogOut size={14} /> Sign out
      </button>
    </Card>
  );
}

function RemoteControls() {
  const { data, setData } = useApi<Status>('/api/remote');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const run = async (fn: () => Promise<Status>, done?: string) => {
    setBusy(true);
    try {
      setData(await fn());
      if (done) toast(done, 'ok');
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  const url = data.addresses[0] ? `http://${data.addresses[0]}:${data.port}` : null;
  return (
    <div data-testid="remote-access">
      <Card title="The GM app on another device" icon={<MonitorSmartphone size={16} />} className="space-y-3">
        <p className="text-sm">
          Run a session from a tablet at the table, or prepare from a laptop in another room. The app stays on this computer; the other device opens it in its browser and signs in with a password you set here. It is closed every time the app starts,
          until you open it.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.put<Status>('/api/remote/password', { password }), data.hasPassword ? 'Password changed. Every device has been signed out.' : 'Password set.').then(() => setPassword(''));
          }}
        >
          <Field label={data.hasPassword ? 'A new password' : 'Set a password (at least 8 characters)'}>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={200} />
          </Field>
          <button className="btn" type="submit" disabled={busy || password.length < 8}>
            <KeyRound size={14} /> {data.hasPassword ? 'Change the password' : 'Set the password'}
          </button>
          {data.hasPassword && (
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={busy}
              onClick={async () => {
                if (await ask({ title: 'Take the password away?', body: 'The app closes to the network and stays closed until a new password is set.', confirmLabel: 'Take it away', danger: true }))
                  void run(() => api.put<Status>('/api/remote/password', { password: null }), 'Password removed; the app is closed to the network.');
              }}
            >
              Remove it
            </button>
          )}
        </form>
        {data.hasPassword && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={data.open ? 'btn' : 'btn-primary'} disabled={busy} onClick={() => void run(() => api.post<Status>('/api/remote', { open: !data.open }), data.open ? 'Closed. Every device has been signed out.' : undefined)}>
              {data.open ? <WifiOff size={14} /> : <Wifi size={14} />} {data.open ? 'Close it to the network' : 'Open it to the network'}
            </button>
            {data.open && (
              <span className="text-sm text-dim">
                {data.sessions === 0 ? 'No device signed in' : `${data.sessions} ${data.sessions === 1 ? 'device' : 'devices'} signed in`}
                {data.sessions > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="underline" onClick={() => void run(() => api.post<Status>('/api/remote/sign-out-all'), 'Every device has been signed out.')}>
                      Sign them all out
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        )}
        {data.open &&
          (url ? (
            <div className="flex flex-wrap items-start gap-4">
              <QrCode text={url} label={`QR code for ${url}`} size={132} />
              <div className="min-w-0 space-y-1 text-sm">
                <div>On the other device, on the same network, open:</div>
                {data.addresses.map((a) => (
                  <div key={a} className="num select-all font-medium text-gold">
                    http://{a}:{data.port}
                  </div>
                ))}
                <div className="text-xs text-dim">or scan the code with its camera, then give the password.</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-warn">This computer isn’t on a network, so no other device can reach it yet.</p>
          ))}
        <p className="text-xs text-dim">
          For your own network at home. The connection isn’t encrypted, so don’t open it on public Wi-Fi or to the internet. Players never need this: they use the table’s address. After five wrong passwords, signing in is locked for a while.
        </p>
      </Card>
    </div>
  );
}
