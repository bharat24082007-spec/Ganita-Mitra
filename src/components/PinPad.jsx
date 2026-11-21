import { useState } from 'react';
import { useLang } from '../lib/i18n.js';

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
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold text-center">{title ?? t('pinEnter', { name })}</h2>

      {/* Dots row; shakes on an error. The newest filled dot pops in. */}
      <div className={`flex gap-4 ${errorKey ? 'anim-shake' : ''}`} aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-6 h-6 rounded-full border-2 border-violet-600 ${
              i < digits.length ? 'bg-violet-600' : 'bg-white'
            } ${i === digits.length - 1 ? 'anim-pop' : ''}`}
          />
        ))}
      </div>

      {errorKey && (
        <p className="text-xl font-semibold text-red-600 text-center" aria-live="polite">
          {t(errorKey)}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 w-full">
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
              className="min-h-[72px] rounded-2xl bg-white shadow-md text-3xl font-semibold active:scale-95 transition disabled:opacity-50"
            >
              {k === '⌫' ? (
                <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto text-violet-700" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
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

      <button
        type="button"
        onClick={onCancel}
        className="min-h-[56px] w-full rounded-2xl bg-white border-2 border-violet-600 text-violet-700 text-lg font-semibold"
      >
        {t('cancel')}
      </button>
    </div>
  );
}
