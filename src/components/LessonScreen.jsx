import { useState } from 'react';
import { apiRequest, getStudentToken } from '../lib/api.js';
import { loc, useLang } from '../lib/i18n.js';

// One emoji per lesson, picked by its position in the chapter
const LESSON_EMOJI = ['📘', '📐', '📈', '🧮'];

// One lesson card. A lesson counts as completed only after the server accepts it (200).
function LessonSection({ lesson, index, done, onDone }) {
  const { lang, t } = useLang();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function markDone() {
    setSaving(true);
    setError(false);
    try {
      await apiRequest(`/api/lessons/${encodeURIComponent(lesson.id)}/complete`, {
        method: 'POST',
        token: getStudentToken(),
      });
      // Show success only after the server returns 200
      onDone(lesson.id);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card bg-white rounded-2xl shadow-md p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">{LESSON_EMOJI[index] ?? '📘'}</span>
        <h2 className="text-2xl font-bold">{loc(lesson.title, lang)}</h2>
      </div>
      <p className="text-lg leading-relaxed">{loc(lesson.explanation, lang)}</p>

      {lesson.examples.map((ex, i) => {
        // Alternate amber and emerald worked-example boxes
        const tone = i % 2 === 0
          ? 'bg-amber-50 border-amber-300'
          : 'bg-emerald-50 border-emerald-300';
        return (
          <div key={i} className={`rounded-xl p-4 border-2 flex flex-col gap-2 ${tone}`}>
            <span className="text-base font-semibold text-violet-700">{t('example')}</span>
            <p className="text-lg">{loc(ex.problem, lang)}</p>
            <p className="text-base text-gray-700">{loc(ex.solution, lang)}</p>
          </div>
        );
      })}

      {/* Completed badge (not a button) or the Mark as done button */}
      {done ? (
        <div className="min-h-[56px] rounded-2xl bg-green-100 text-green-800 text-lg font-semibold flex items-center justify-center">
          {t('lessonDone')}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={markDone}
            disabled={saving}
            className="min-h-[56px] w-full rounded-2xl bg-violet-600 text-white text-lg font-semibold shadow-md active:scale-95 transition disabled:opacity-50"
          >
            {t('markDone')}
          </button>
          {error && (
            <p className="text-lg font-semibold text-red-600" aria-live="polite">
              {t('lessonSaveFailed')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Lesson text comes from chapter.json. Completion is saved on the server.
export default function LessonScreen({ chapter }) {
  // Set of lesson ids the server has accepted during this visit
  const [doneIds, setDoneIds] = useState(() => new Set());

  // Adds one lesson to the done set so its badge shows immediately
  function handleDone(lessonId) {
    setDoneIds((prev) => new Set(prev).add(lessonId));
  }

  return (
    <div className="flex flex-col gap-6">
      {chapter.lessons.map((lesson, i) => (
        <LessonSection
          key={lesson.id}
          lesson={lesson}
          index={i}
          done={doneIds.has(lesson.id)}
          onDone={handleDone}
        />
      ))}
    </div>
  );
}
