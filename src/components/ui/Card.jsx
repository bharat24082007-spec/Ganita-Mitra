// Presentational wrapper that applies the global .card surface style (see src/index.css).
export default function Card({ className = '', children }) {
  const classes = ['card p-4', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

