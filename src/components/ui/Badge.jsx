// Small pill label. The tone prop picks its colour.
const TONES = {
  neutral: 'bg-bg text-muted',
  primary: 'bg-primary/10 text-primary-dark',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export default function Badge({ tone = 'neutral', className = '', children }) {
  const classes = [
    'inline-flex items-center rounded-full px-3 py-1 text-base font-semibold',
    TONES[tone] ?? TONES.neutral,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}

