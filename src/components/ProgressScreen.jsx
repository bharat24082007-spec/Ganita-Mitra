import { useEffect, useState } from 'react';
import { getAttempts, getLessonViews } from '../lib/db.js';
import { computeStats } from '../lib/stats.js';
import SyncIndicator from './SyncIndicator.jsx';

function StatCard({ label, value, unit = '' }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow flex flex-col gap-1">
      <span className="text-lg text-gray-700">{label}</span>
      <p className="text-3xl font-bold">
        {value}
        {unit}
      </p>
    </div>
  );
}

export default function ProgressScreen({ profile, onPractice }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Clear old numbers so a profile switch never shows the previous learner's stats
      setStats(null);
      const attempts = await getAttempts(profile.id);
      const views = await getLessonViews(profile.id);
      if (!cancelled) setStats(computeStats(attempts, views));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  if (!stats) return <p className="text-xl">లోడ్ అవుతోంది...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">నా పురోగతి</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="పూర్తి చేసిన పాఠాలు" value={stats.lessonsCompleted} />
        <StatCard label="అభ్యసించిన ప్రశ్నలు" value={stats.questionsAttempted} />
        <StatCard label="ఖచ్చితత్వం" value={stats.accuracy} unit="%" />
        <StatCard label="వరుస రోజులు" value={stats.streak} unit=" రోజులు" />
      </div>

      <h3 className="text-xl font-bold">బలహీన అంశాలు</h3>
      {stats.weakTopics.length === 0 ? (
        <p className="text-lg">ఇంకా బలహీన అంశాలు లేవు</p>
      ) : (
        stats.weakTopics.map((topic) => (
          <div key={topic} className="bg-white rounded-2xl p-4 shadow flex flex-col gap-3">
            <span className="text-xl">{topic}</span>
            <button
              type="button"
              onClick={() => onPractice(topic)}
              className="min-h-[56px] bg-violet-600 text-white text-lg rounded-xl w-full"
            >
              ఈ అంశం ప్రాక్టీస్ చేయండి
            </button>
          </div>
        ))
      )}

      <SyncIndicator />
    </div>
  );
}
