import { Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, Trash2, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { AccountSession } from '../../shared/types';
import type { useAccount } from '../hooks/useAccount';

type Account = ReturnType<typeof useAccount>;

/** Password field with a button to show what was typed. */
function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="icon-button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={close}
      onClick={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-body">
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Close dialog">
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Shown once after registering or resetting: the only time the code is visible. */
export function RecoveryCodeDialog({ code, close }: { code: string; close: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Save your recovery code" close={close}>
      <p>This code resets your password if you forget it. It is shown only once, so keep it somewhere safe.</p>
      <div className="recovery-code">
        <code>{code}</code>
        <button
          className="icon-button"
          aria-label="Copy recovery code"
          onClick={() =>
            void navigator.clipboard
              .writeText(code)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <button className="button primary full" onClick={close}>
        I saved it
      </button>
    </Modal>
  );
}

type AuthMode = 'login' | 'register' | 'recover';

/** Sign in, create an account, or reset a password with a recovery code. */
export function SignInDialog({
  account,
  close,
  onSignedIn,
}: {
  account: Account;
  close: () => void;
  onSignedIn: (session: AccountSession & { recoveryCode?: string }) => void;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result =
        mode === 'recover'
          ? await account.recover(username, code, password)
          : await account.authenticate(mode, username, password);
      onSignedIn(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
      setPassword('');
    }
  }
  const title =
    mode === 'login' ? 'Sign in to Islanders' : mode === 'register' ? 'Create your account' : 'Reset your password';
  return (
    <Modal title={title} close={close}>
      {mode !== 'recover' && (
        <div className="segmented">
          <button className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>
      )}
      <p className="muted">
        {mode === 'recover'
          ? 'Enter the recovery code you saved when you created the account.'
          : 'Use the same account on any device to return to your games.'}
      </p>
      {!window.isSecureContext && (
        <p className="inline-alert">Use the HTTPS link to sign in. Guest play still works here.</p>
      )}
      <form className="stack-form" onSubmit={submit}>
        <label>
          Username
          <input
            autoComplete="username"
            autoCapitalize="none"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </label>
        {mode === 'recover' && (
          <label>
            Recovery code
            <input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              maxLength={40}
              value={code}
              onChange={e => setCode(e.target.value)}
              required
            />
          </label>
        )}
        <PasswordInput
          label={mode === 'recover' ? 'New password' : 'Password'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={12}
          placeholder="At least 12 characters"
          value={password}
          onChange={setPassword}
        />
        {error && (
          <p role="alert" className="inline-alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={loading || !window.isSecureContext}>
          {loading && <LoaderCircle className="spin" />}
          {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
        </button>
      </form>
      {mode === 'login' && (
        <button className="text-button form-link" onClick={() => setMode('recover')}>
          Forgot password?
        </button>
      )}
      {mode === 'recover' && (
        <button className="text-button form-link" onClick={() => setMode('login')}>
          Back to sign in
        </button>
      )}
      {mode === 'register' && (
        <p className="form-note">You'll get a recovery code next. Save it to reset your password later.</p>
      )}
    </Modal>
  );
}

/** Account settings: replace the recovery code, or delete the account. Both need the password. */
export function AccountDialog({
  account,
  close,
  onCode,
  onDeleted,
}: {
  account: Account;
  close: () => void;
  onCode: (code: string) => void;
  onDeleted: () => void;
}) {
  const [action, setAction] = useState<'code' | 'delete' | null>(account.hasRecoveryCode ? null : 'code');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (action === 'code') onCode(await account.replaceRecoveryCode(password));
      else {
        await account.deleteAccount(password);
        onDeleted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setLoading(false);
      setPassword('');
    }
  }
  const username = account.account?.username ?? '';
  return (
    <Modal title={username} close={close}>
      {!account.hasRecoveryCode && (
        <p className="inline-alert">This account has no recovery code yet. Make one so you can reset your password.</p>
      )}
      <div className="account-actions">
        <button className={`account-action ${action === 'code' ? 'selected' : ''}`} onClick={() => setAction('code')}>
          <KeyRound size={20} />
          <span>
            <strong>New recovery code</strong>
            <small>The old code stops working.</small>
          </span>
        </button>
        <button
          className={`account-action danger ${action === 'delete' ? 'selected' : ''}`}
          onClick={() => setAction('delete')}
        >
          <Trash2 size={20} />
          <span>
            <strong>Delete account</strong>
            <small>Removes your login and room list. This can't be undone.</small>
          </span>
        </button>
      </div>
      {action && (
        <form className="stack-form" onSubmit={submit}>
          {action === 'delete' && (
            <label>
              Type your username to confirm
              <input autoComplete="off" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </label>
          )}
          <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
          {error && (
            <p role="alert" className="inline-alert">
              {error}
            </p>
          )}
          <button
            className={`button full ${action === 'delete' ? 'danger' : 'primary'}`}
            disabled={loading || (action === 'delete' && confirm.trim().toLowerCase() !== username)}
          >
            {loading && <LoaderCircle className="spin" />}
            {action === 'code' ? 'Make new code' : 'Delete my account'}
          </button>
        </form>
      )}
    </Modal>
  );
}
