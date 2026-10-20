import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Leaf, ShieldCheck, Database, Eye, EyeOff, Settings2 } from 'lucide-react';
import { useApp } from '../context';
import { post, backendUrl } from '../api';
import type { User } from '../types';
import { Button, Field, ErrorBox, Modal } from '../components/ui';
export function ConnectionSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(backendUrl()),
    [error, setError] = useState('');
  return (
    <Modal
      title="Backend connection"
      subtitle="Use the same-origin API unless your administrator provides another address."
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (url) {
            try {
              const parsed = new URL(url);
              if (
                !['http:', 'https:'].includes(parsed.protocol) ||
                parsed.username ||
                parsed.password ||
                parsed.search ||
                parsed.hash
              )
                throw new Error();
              if (location.protocol === 'https:' && parsed.protocol !== 'https:') throw new Error();
            } catch {
              setError(
                'Enter an HTTPS address (HTTP is allowed for local development), without credentials or query parameters.',
              );
              return;
            }
          }
          if (url) localStorage.setItem('na_backend_url', url.replace(/\/$/, ''));
          else localStorage.removeItem('na_backend_url');
          location.reload();
        }}
      >
        <Field
          label="Backend URL"
          hint="Leave empty for /api on this website. A separate origin requires credentialed CORS and compatible cookie settings."
        >
          <input
            type="url"
            placeholder="https://api.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <p className="muted small">
          Business records are always stored by the backend. Only this connection preference is
          saved in your browser.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button>Save & reconnect</Button>
        </div>
      </form>
    </Modal>
  );
}
export default function Login() {
  const {
    setupRequired,
    setupTokenRequired,
    error: connectionError,
    refresh,
    authenticate,
  } = useApp();
  const [username, setUsername] = useState('naween'),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [setupToken, setSetupToken] = useState(''),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [connection, setConnection] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (setupRequired && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authenticate(
        await post<{ user: User; csrf: string }>(setupRequired ? '/auth/setup' : '/auth/login', {
          username,
          password,
          setupToken,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Leaf size={26} />
          </span>
          <div>
            NA <strong>Distributors</strong>
            <small>GOOD SPICES. GREAT BUSINESS.</small>
          </div>
        </a>
        <div className="login-story-content">
          <span className="eyebrow">YOUR BUSINESS, BEAUTIFULLY CONNECTED</span>
          <h1>
            From the storeroom
            <br />
            to the next sale.
          </h1>
          <p>
            A little more clarity. A lot more possibility.
            <br />
            Your everyday workspace for a growing spice business.
          </p>
          <div className="spice-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="spice-jar jar-one">
              <span>PURE & NATURAL</span>
              <Leaf size={40} />
              <strong>
                CEYLON
                <br />
                SPICES
              </strong>
              <small>NA DISTRIBUTORS</small>
            </div>
            <div className="spice-jar jar-two">
              <span>FROM THE SOURCE</span>
              <Leaf size={28} />
              <strong>
                QUALITY
                <br />
                IN EVERY GRAIN
              </strong>
            </div>
            <i className="art-leaf leaf-one" />
            <i className="art-leaf leaf-two" />
            <i className="art-pepper p-one" />
            <i className="art-pepper p-two" />
            <i className="art-pepper p-three" />
          </div>
        </div>
        <div className="login-story-footer">
          <ShieldCheck size={17} /> One workspace. Every part of your business.
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-form">
          <div className="section-label">
            <span className="live-dot" /> YOUR DISTRIBUTION WORKSPACE
          </div>
          <h2>{setupRequired ? 'Let’s make it yours.' : 'Welcome back.'}</h2>
          <p>
            {setupRequired
              ? 'Set up your administrator account to open your workspace.'
              : 'Sign in to keep business moving.'}
          </p>
          {connectionError ? (
            <ErrorBox message={connectionError} retry={() => void refresh()} />
          ) : (
            <form onSubmit={submit}>
              <Field label={setupRequired ? 'Administrator' : 'Username'}>
                <input
                  autoComplete="username"
                  required
                  value={setupRequired ? 'naween' : username}
                  readOnly={setupRequired}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              {setupRequired && (
                <div className="info-box">
                  <ShieldCheck size={18} />
                  <span>
                    Naween Samaranayaka · Administrator
                    <br />
                    <small>No business records will be preloaded.</small>
                  </span>
                </div>
              )}
              {setupRequired && setupTokenRequired && (
                <Field
                  label="Setup code"
                  hint="Retrieve this one-time code from your deployment’s Cloud Shell instructions. Do not share it in chat."
                >
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    value={setupToken}
                    maxLength={200}
                    onChange={(e) => setSetupToken(e.target.value)}
                  />
                </Field>
              )}
              <Field
                label={setupRequired ? 'Create password' : 'Password'}
                hint={setupRequired ? 'Use at least 10 characters.' : ''}
              >
                <div className="password-input">
                  <input
                    type={visible ? 'text' : 'password'}
                    autoComplete={setupRequired ? 'new-password' : 'current-password'}
                    minLength={setupRequired ? 10 : undefined}
                    maxLength={200}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {setupRequired && (
                <Field label="Confirm password">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button className="login-submit" disabled={busy}>
                {busy ? 'Connecting…' : setupRequired ? 'Create your workspace' : 'Sign in'}
                <ArrowRight size={18} />
              </Button>
            </form>
          )}
          <div className="login-trust">
            <Database size={15} />
            <span>Connected records. Persistent database storage.</span>
          </div>
          {!setupRequired && (
            <p className="login-help">
              Need access? Ask Naween, your administrator, to set your password.
            </p>
          )}
        </div>
        <button className="connection-link" onClick={() => setConnection(true)}>
          <Settings2 size={15} /> Connection settings
        </button>
        <div className="login-copyright">
          © {new Date().getFullYear()} NA Distributors · Made for everyday business
        </div>
      </div>
      {connection && <ConnectionSettings onClose={() => setConnection(false)} />}
    </div>
  );
}
