import { PROFILES } from '../lib/profiles.js';

export default function ProfileScreen({ onSelect }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-3xl font-bold">ఈరోజు ఎవరు నేర్చుకుంటున్నారు?</h2>

      {PROFILES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p)}
          className="w-full min-h-[96px] flex items-center gap-4 rounded-2xl bg-white shadow p-4 text-left"
        >
          <span className="text-5xl">{p.avatar}</span>
          <span className="text-2xl font-semibold">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
