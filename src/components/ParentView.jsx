import { useEffect, useState } from 'react';
import { getAttempts, getLessonViews } from '../lib/db.js';
import { PROFILES } from '../lib/profiles.js';
import { computeStats } from '../lib/stats.js';
import SyncIndicator from './SyncIndicator.jsx';

// Short weekday label for a YYYY-MM-DD date; falls back to the day number
function weekdayLabel(date) {
  try {
    return new Date(date).toLocaleDateString('te-IN', { weekday: 'short' });
  } catch {
    return String(new Date(date).getDate());
  }
}

export default function ParentView({ onExit }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all = await Promise.all(
        PROFILES.map(async (p) => {
          const attempts = await getAttempts(p.id);
          const views = await getLessonViews(p.id);
          return { p, stats: computeStats(attempts, views) };
        })
      );
      if (!cancelled) setRows(all);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) return <p className="text-xl">లోడ్ అవుతోంది...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">తల్లిదండ్రులు / ఉపాధ్యాయుల వీక్షణ</h2>
      <SyncIndicator />

      {rows.map(({ p, stats }) => {
        // Scale bars against the busiest day; at least 1 avoids divide-by-zero
        const maxCount = Math.max(1, ...stats.last7Days.map((d) => d.count));
        return (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow flex flex-col gap-3">
            <h3 className="text-2xl font-bold">{p.name}</h3>
            <p className="text-lg">
              చివరి కార్యాచరణ:{' '}
              {stats.lastActive
                ? new Date(stats.lastActive).toLocaleDateString('en-IN')
                : 'ఇంకా కార్యాచరణ లేదు'}
            </p>
            <p className="text-lg">ఖచ్చితత్వం: {stats.accuracy}%</p>
            <p className="text-lg">
              బలహీన అంశాలు: {stats.weakTopics.length ? stats.weakTopics.join(', ') : 'లేవు'}
            </p>

            {/* 7-day bar chart; empty days get a thin stub so the day is still visible */}
            <div className="flex gap-2">
              {stats.last7Days.map((d) => {
                const barPx = d.count === 0 ? 4 : 8 + Math.round((d.count / maxCount) * 100);
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center justify-end gap-1"
                  >
                    <div className="w-full bg-violet-500 rounded" style={{ height: `${barPx}px` }} />
                    <span className="text-base">{weekdayLabel(d.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onExit()}
        className="min-h-[56px] bg-gray-200 rounded-xl text-lg"
      >
        వెనుకకు
      </button>
    </div>
  );
}
