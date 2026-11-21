import { useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function PinPad({ name, onSubmit, onCancel }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');

  function press(key) {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= 4) return;
    const next = digits + key;
    setDigits(next);
    setError('');
    // Verify only once all four digits are entered
    if (next.length === 4) {
      const ok = onSubmit(next);
      if (!ok) {
        setError('PIN తప్పు');
        setDigits('');
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold text-center">{name} కోసం PIN నమోదు చేయండి</h2>

      <div className="flex gap-4" aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded-full border-2 border-violet-600 ${
              i < digits.length ? 'bg-violet-600' : 'bg-white'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-xl text-red-600" aria-live="polite">
          {error}
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
              className="min-h-[64px] text-2xl rounded-xl bg-white shadow font-semibold"
            >
              {k}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="min-h-[56px] w-full text-xl rounded-xl bg-gray-200"
      >
        రద్దు
      </button>
    </div>
  );
}
