// Horizontal progress bar. value is 0-100 and is clamped to that range.
export default function ProgressBar({ value = 0, label = 'Progress', className = '' }) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={['h-3 w-full overflow-hidden rounded-full bg-primary/10', className].filter(Boolean).join(' ')}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

