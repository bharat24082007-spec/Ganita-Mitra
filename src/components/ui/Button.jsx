// Presentational button. Styling only: forwards type, onClick, disabled and any aria-* props.
const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-primary/10 text-primary-dark hover:bg-primary/15',
  ghost: 'bg-transparent text-primary-dark hover:bg-primary/10',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZES = {
  md: 'px-5 text-lg',
  lg: 'px-6 text-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  onClick,
  disabled = false,
  className = '',
  children,
  ...ariaProps
}) {
  const base =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl font-semibold transition-colors ' +
    'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 ' +
    'disabled:cursor-not-allowed disabled:opacity-50';
  const classes = [base, VARIANTS[variant] ?? VARIANTS.primary, SIZES[size] ?? SIZES.md, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes} {...ariaProps}>
      {children}
    </button>
  );
}

