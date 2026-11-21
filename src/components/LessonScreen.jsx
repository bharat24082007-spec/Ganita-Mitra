import { useEffect, useState } from 'react';
import { apiRequest, getStudentId, getStudentToken } from '../lib/api.js';
import { savePendingCompletion } from '../lib/db.js';
import { isOfflineError, makePendingCompletion } from '../lib/offlineQueue.js';
import { loc, useLang } from '../lib/i18n.js';

// One emoji per lesson, picked by its position in the chapter
const LESSON_EMOJI = ['📘', '📐', '📈', '🧮'];

// One lesson card. A lesson counts as completed only after the server accepts it (200).
// If the phone is offline, the completion is queued on the device and synced later.
function LessonSection({ lesson, index, done, online, onDone }) {
  const { lang, t } = useLang();
  const [saving, setSaving] = useState(false);
  // Error i18n key shown under the button, or null
  const [errorKey, setErrorKey] = useState(null);
  // True once the completion is queued offline (not yet confirmed by the server)
  const [queued, setQueued] = useState(false);

  async function queueOffline() {
    let result;
    try {
      const record = makePendingCompletion({
        profileId: getStudentId(),
        lessonId: lesson.id,
        completedAt: new Date().toISOString(),
      });
      result = await savePendingCompletion(record);
    } catch {
      result = { ok: false, error: 'INVALID' };
    }
    if (result.ok) {
      setQueued(true);
      setErrorKey(null);
    } else {
      setErrorKey(result.error === 'QUOTA' ? 'storageFull' : 'storageError');
    }
  }

  async function markDone() {
    setSaving(true);
    setErrorKey(null);
    if (!online) {
      await queueOffline();
      setSaving(false);
      return;
    }
    try {
      await apiRequest(`/api/lessons/${encodeURIComponent(lesson.id)}/complete`, {
        method: 'POST',
        token: getStudentToken(),
      });
      // Show success only after the server returns 200
      onDone(lesson.id);
    } catch (err) {
      // ApiError with status 0 is a network failure (code 'network'); isOfflineError covers fetch TypeErrors
      if (isOfflineError(err) || (err && err.status === 0)) {
        await queueOffline();
      } else {
        setErrorKey('lessonSaveFailed');
      }
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

      {/* Completed badge (not a button), the offline note, or the Mark as done button */}
      {done ? (
        <div className="min-h-[56px] rounded-2xl bg-green-100 text-green-800 text-lg font-semibold flex items-center justify-center">
          {t('lessonDone')}
        </div>
      ) : queued ? (
        <p role="status" className="rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-900 text-lg font-semibold px-4 py-3">
          {t('lessonSavedOffline')}
        </p>
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
          {errorKey && (
            <p className="text-lg font-semibold text-red-600" aria-live="polite">
              {t(errorKey)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Lesson text comes from chapter.json. Completion is saved on the server, or queued on the phone while offline.
export default function LessonScreen({ chapter }) {
  const { t } = useLang();
  // Set of lesson ids the server has accepted during this visit
  const [doneIds, setDoneIds] = useState(() => new Set());
  const [online, setOnline] = useState(navigator.onLine);

  // Track connection so the offline note and completion path stay current
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Adds one lesson to the done set so its badge shows immediately
  function handleDone(lessonId) {
    setDoneIds((prev) => new Set(prev).add(lessonId));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Lessons already loaded stay readable offline; the note appears only when offline */}
      {!online && (
        <p role="status" className="rounded-2xl bg-gray-100 text-gray-700 px-4 py-3 text-lg">
          {t('offlineBanner')}
        </p>
      )}
      {chapter.lessons.map((lesson, i) => (
        <LessonSection
          key={lesson.id}
          lesson={lesson}
          index={i}
          done={doneIds.has(lesson.id)}
          online={online}
          onDone={handleDone}
        />
      ))}
    </div>
  );
}
