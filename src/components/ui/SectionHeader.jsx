// Section title with an optional subtitle line beneath it.
export default function SectionHeader({ title, subtitle, className = '' }) {
  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <h2 className="text-2xl font-bold text-ink">{title}</h2>
      {subtitle && <p className="text-lg text-muted">{subtitle}</p>}
    </div>
  );
}

