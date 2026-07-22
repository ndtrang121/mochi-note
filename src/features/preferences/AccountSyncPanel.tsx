import { useState, type FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';

export function AccountSyncPanel() {
  const { auth, authControls, sync, syncNow } = useMochiData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account action failed.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => authControls.signIn(email, password));
  }

  return (
    <fieldset className="preferences-section">
      <legend>Account &amp; sync</legend>
      {auth.status === 'signed-in' ? (
        <>
          <p>{auth.user?.email ?? 'Signed in'} · {sync.status} · {sync.pendingCount} pending</p>
          <Button disabled={busy} onClick={() => void syncNow()}>Sync now</Button>
          <Button disabled={busy} onClick={() => void run(authControls.signOut)}>Sign out</Button>
        </>
      ) : (
        <form onSubmit={submit}>
          <input aria-label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <input aria-label="Password" minLength={6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <Button disabled={busy} type="submit">Sign in</Button>
          <Button disabled={busy} onClick={() => void run(() => authControls.signUp(email, password))} type="button">Sign up</Button>
        </form>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </fieldset>
  );
}

