import { useEffect, useState } from 'react';
import { apiRequest, getStudentToken } from '../lib/api.js';
import { topicLabel, useLang } from '../lib/i18n.js';
import SyncIndicator from './SyncIndicator.jsx';

// Ring geometry: circle radius 40 in a 100x100 box, stroke 10
const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

// Accuracy ring: the violet arc length shows the percentage
function AccuracyRing({ value }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative w-36 h-36" role="img" aria-label={`${pct}%`}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
        {/* Track */}
        <circle cx="50" cy="50" r={RING_R} fill="none" strokeWidth="10" className="stroke-violet-100" />
        {/* Progress arc, starts at the top */}
        <circle
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-violet-600"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
        {pct}%
      </span>
    </div>
  );
}

// Big-number tile for lessons and questions
function StatCard({ label, value }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-lg text-gray-700">{label}</span>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

// All numbers come from GET /api/students/{id}/progress. Nothing is computed in the browser.
export default function ProgressScreen({ profile, questions, onPractice }) {
  const { lang, t } = useLang();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Clear old numbers so a profile switch never shows the previous learner's stats
    setReport(null);
    setError(false);
    apiRequest(`/api/students/${encodeURIComponent(profile.id)}/progress`, { token: getStudentToken() })
      .then((res) => {
        if (!cancelled) setReport(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  if (error) return <p className="text-xl text-red-600">{t('progressLoadFailed')}</p>;
  if (!report) return <p className="text-xl">{t('loading')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{t('myProgress')}</h2>

      {/* Accuracy ring with its label underneath */}
      <div className="card p-4 flex flex-col items-center gap-2">
        <AccuracyRing value={report.accuracy_pct} />
        <span className="text-lg text-gray-700">{t('accuracyLabel')}</span>
      </div>

      {/* Lessons and questions as two stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t('lessonsDone')} value={report.lessons_completed} />
        <StatCard label={t('questionsTried')} value={report.questions_attempted} />
      </div>

      <h3 className="text-xl font-bold">{t('weakTopics')}</h3>
      {report.weak_topics.length === 0 ? (
        <div className="card p-4 flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">🎉</span>
          <p className="text-lg">{t('noWeakTopics')}</p>
        </div>
      ) : (
        report.weak_topics.map((topic) => (
          <div key={topic} className="card p-4 flex flex-col gap-3">
            <span className="self-start rounded-full bg-rose-100 text-rose-800 text-lg font-semibold px-4 py-2">
              {topicLabel(questions || [], topic, lang)}
            </span>
            <button
              type="button"
              onClick={() => onPractice(topic)}
              className="min-h-[52px] w-full rounded-2xl bg-violet-600 text-white text-lg font-semibold"
            >
              {t('practiceTopic')}
            </button>
          </div>
        ))
      )}

      <SyncIndicator />
    </div>
  );
}
