import { useState } from 'react';
import { useLang } from '../lib/i18n.js';
import Button from './ui/Button.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

// PIN entry: four dots, a 3-column keypad, and a red message on failure.
// onSubmit(pin) may return null on success, or an i18n key naming the error to show.
// The browser never compares the PIN; the server decides.
export default function PinPad({ name, title, onSubmit, onCancel }) {
  const { t } = useLang();
  const [digits, setDigits] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function press(key) {
    if (busy) return;
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= 4) return;
    const next = digits + key;
    setDigits(next);
    setErrorKey('');
    // Submit only once all four digits are entered
    if (next.length === 4) {
      setBusy(true);
      const result = await onSubmit(next);
      setBusy(false);
      if (result) {
        setErrorKey(result);
        setDigits('');
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      <h2 className="text-center text-2xl font-bold text-ink">{title ?? t('pinEnter', { name })}</h2>

      {/* Dots row; shakes on an error. The newest filled dot pops in. */}
      <div className={`flex gap-4 ${errorKey ? 'anim-shake' : ''}`} aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-5 w-5 rounded-full border-2 border-primary ${
              i < digits.length ? 'bg-primary' : 'bg-surface'
            } ${i === digits.length - 1 ? 'anim-pop' : ''}`}
          />
        ))}
      </div>

      {errorKey && (
        <p className="text-center text-lg font-semibold text-danger" aria-live="polite">
          {t(errorKey)}
        </p>
      )}

      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((k, i) =>
          k === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              disabled={busy}
              aria-label={k === '⌫' ? 'Backspace' : k}
              className="flex min-h-[56px] items-center justify-center rounded-lg border border-primary/15 bg-surface text-2xl font-semibold text-ink shadow-soft transition active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50"
            >
              {k === '⌫' ? (
                <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7 text-primary-dark" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M9 5h11v14H9l-6-7 6-7z" strokeLinejoin="round" />
                  <path d="M13 9l5 6M18 9l-5 6" strokeLinecap="round" />
                </svg>
              ) : (
                k
              )}
            </button>
          )
        )}
      </div>

      <Button variant="ghost" onClick={onCancel} className="h-[52px] w-full">
        {t('cancel')}
      </Button>
    </div>
  );
}

