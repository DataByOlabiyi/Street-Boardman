import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

function CodeInput({ value, onChange, id }) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
    />
  );
}

// Staff MFA enrollment (TASK-031). Setup only turns MFA on after a real
// code from the authenticator app proves the key was actually saved —
// the server enforces that too, this just walks the admin through it.
export default function Security() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qrDataUrl }
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const { secret, otpauthUrl } = await api.post('/auth/mfa/setup');
      // Only this page needs a QR encoder, so it isn't in the main bundle.
      const QRCode = await import('qrcode');
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
      setSetup({ secret, otpauthUrl, qrDataUrl });
      setCode('');
    });

  const confirmSetup = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/auth/mfa/setup/confirm', { code });
      setSetup(null);
      setCode('');
      await refresh();
      setNotice('Two-factor authentication is on. You will be asked for a code every time you log in.');
    });
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/auth/mfa/disable', { code });
      setCode('');
      await refresh();
      setNotice('Two-factor authentication is off.');
    });
  };

  return (
    <>
      <TopBar title="Account Security" />
      <div className="page">
        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="success-banner">{notice}</div>}

        <div className="card">
          <p className="muted">Two-factor authentication</p>
          <h2>{user?.mfaEnabled ? 'On' : 'Off'}</h2>
          {!user?.mfaEnabled && (
            <p className="muted">
              Staff accounts can move money and change other users. Turn this on so a stolen PIN alone
              is not enough to log in.
            </p>
          )}
        </div>

        {!user?.mfaEnabled && !setup && (
          <button type="button" className="btn btn-primary" onClick={startSetup} disabled={busy}>
            {busy ? 'Preparing...' : 'Set up two-factor authentication'}
          </button>
        )}

        {setup && (
          <div className="card">
            <p>
              <strong>1.</strong> In an authenticator app (Google Authenticator, Microsoft Authenticator, Authy),
              scan this code:
            </p>
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width={220} height={220} />
            <p className="muted">
              Can&apos;t scan? On this phone, <a href={setup.otpauthUrl}>open it in your authenticator app</a>, or
              enter this key manually:
            </p>
            <p><code style={{ wordBreak: 'break-all' }}>{setup.secret}</code></p>
            <form onSubmit={confirmSetup}>
              <div className="field">
                <label htmlFor="mfa-setup-code"><strong>2.</strong> Enter the 6-digit code the app shows</label>
                <CodeInput id="mfa-setup-code" value={code} onChange={setCode} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Checking...' : 'Turn on'}
              </button>
            </form>
          </div>
        )}

        {user?.mfaEnabled && (
          <form className="card" onSubmit={disable}>
            <p className="muted">To turn it off, enter a current code from your authenticator app.</p>
            <div className="field">
              <label htmlFor="mfa-disable-code">Authentication code</label>
              <CodeInput id="mfa-disable-code" value={code} onChange={setCode} />
            </div>
            <button className="btn btn-danger" type="submit" disabled={busy || code.length !== 6}>
              Turn off
            </button>
          </form>
        )}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
