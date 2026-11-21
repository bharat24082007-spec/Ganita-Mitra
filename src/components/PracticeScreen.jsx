import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, getStudentId, getStudentToken } from '../lib/api.js';
import { pickNextQuestion } from '../lib/adaptive.js';
import { cleanAnswerInput } from '../lib/checkAnswer.js';
import { cacheQuestions, getCachedQuestions, newUuid, savePendingAttempt } from '../lib/db.js';
import { isOfflineError, makePendingAttempt } from '../lib/offlineQueue.js';
import { triggerSync } from '../lib/sync.js';
import { loc, mistakeHintFor, topicKey, topicLabel, useLang } from '../lib/i18n.js';
import TutorPanel from './TutorPanel.jsx';

// Practice: questions come from the server (cached for offline use). Correctness, hints and solutions come from POST /check.
export default function PracticeScreen({ profile, questions, topicFilter }) {
  const { lang, t } = useLang();
  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState('');
  // Message holds an i18n key so it switches language with the toggle. info = neutral note (not correct/incorrect).
  const [message, setMessage] = useState({ key: '', ok: false, info: false });
  const [hints, setHints] = useState([]);
  const [mistakeHint, setMistakeHint] = useState(null);
  const [solution, setSolution] = useState(null);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  // Question rows saved on this phone; used only when the live list is missing
  const [cached, setCached] = useState(null);
  // Correct question ids this session (drives the progress bar)
  const [doneIds, setDoneIds] = useState(() => new Set());
  // This session's answers, used only to pick the next question
  const historyRef = useRef([]);
  // uuid for the current submission; reused on any retry of the same answer, cleared once the server responds
  const attemptRef = useRef(null);
  // True once an answer was queued offline, so a reconnect triggers a sync
  const queuedRef = useRef(false);

  const source = Array.isArray(questions) && questions.length > 0 ? questions : cached;

  // Memoized so the load effect only re-runs when the pool really changes
  const pool = useMemo(() => {
    if (!source) return null;
    return topicFilter ? source.filter((q) => topicKey(q) === topicFilter) : source;
  }, [source, topicFilter]);

  // Track connection; when it returns after an offline save, sync the queue
  useEffect(() => {
    const on = () => {
      setOnline(true);
      if (queuedRef.current) {
        queuedRef.current = false;
        triggerSync();
      }
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Keep a copy of the live list for offline use; read the copy when no live list is available
  useEffect(() => {
    if (Array.isArray(questions) && questions.length > 0) {
      cacheQuestions(questions);
      return;
    }
    let active = true;
    getCachedQuestions().then((rows) => {
      if (active) setCached(rows);
    });
    return () => {
      active = false;
    };
  }, [questions]);

  function loadNext() {
    if (!pool || pool.length === 0) return;
    const q = pickNextQuestion(pool, historyRef.current);
    setQuestion(q);
    setHints([]);
    setMistakeHint(null);
    setSolution(null);
    setFinished(false);
    setInput('');
    setMessage({ key: '', ok: false, info: false });
    attemptRef.current = null;
  }

  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, pool, topicFilter]);

  // Same question and same answer keep one uuid, so a retry is idempotent on the server
  function uuidFor(questionId, answer) {
    const prev = attemptRef.current;
    if (prev && prev.questionId === questionId && prev.answer === answer) return prev.uuid;
    const next = { questionId, answer, uuid: newUuid() };
    attemptRef.current = next;
    return next.uuid;
  }

  // Queues the answer on this phone. Shows only the saved note, never a correct or incorrect verdict.
  async function saveOffline(questionId, answer, uuid) {
    setBusy(true);
    let result;
    try {
      const record = makePendingAttempt({
        profileId: getStudentId(),
        questionId,
        answer,
        lang,
        uuid,
        createdAt: new Date().toISOString(),
      });
      result = await savePendingAttempt(record);
    } catch {
      result = { ok: false, error: 'INVALID' };
    }
    setBusy(false);
    if (!result.ok) {
      const key = result.error === 'QUOTA' ? 'storageFull' : result.error === 'INVALID' ? 'checkFailed' : 'storageError';
      setMessage({ key, ok: false, info: false });
      return;
    }
    queuedRef.current = true;
    setFinished(true);
    setMessage({ key: 'offlineSavedPending', ok: false, info: true });
  }

  async function handleSubmit() {
    if (!question || busy || finished) return;
    const answer = cleanAnswerInput(input);
    if (answer === '') {
      setMessage({ key: 'writeAnswer', ok: false, info: false });
      return;
    }
    const qid = question.id;
    const uuid = uuidFor(qid, answer);

    if (!online) {
      await saveOffline(qid, answer, uuid);
      return;
    }

    setBusy(true);
    let res;
    try {
      res = await apiRequest(`/api/questions/${encodeURIComponent(qid)}/check`, {
        method: 'POST',
        token: getStudentToken(),
        body: { answer, lang, clientId: uuid },
      });
    } catch (err) {
      setBusy(false);
      // ApiError with status 0 is a network failure (code 'network'); isOfflineError covers fetch TypeErrors
      if (isOfflineError(err) || (err && err.status === 0)) {
        await saveOffline(qid, answer, uuid);
        return;
      }
      setMessage({ key: 'checkFailed', ok: false, info: false });
      return;
    }
    setBusy(false);
    attemptRef.current = null;
    historyRef.current = [
      ...historyRef.current,
      { questionId: qid, correct: res.is_correct, topic: topicKey(question) },
    ];

    if (res.is_correct) {
      setMessage({ key: 'correct', ok: true, info: false });
      setDoneIds((prev) => new Set(prev).add(qid));
      setFinished(true);
      return;
    }

    // Wrong: the server sends the hint for this attempt, a mistake note, and a solution after enough tries
    setMessage({ key: 'wrongTryAgain', ok: false, info: false });
    if (res.hint) setHints((h) => [...h, res.hint]);
    setMistakeHint(res.mistake_hint ?? null);
    if (res.solution != null) {
      setSolution(res.solution);
      setFinished(true);
    }
  }

  if (!source) {
    return <p className="text-xl">{t('loading')}</p>;
  }

  if (pool.length === 0) {
    return <p className="text-xl">{t(online ? 'noQuestionsTopic' : 'offlineBanner')}</p>;
  }

  if (!question) {
    return <p className="text-xl">{t('loading')}</p>;
  }

  const doneCount = doneIds.size;
  const percent = Math.min(100, Math.round((doneCount / pool.length) * 100));
  // Server solution is an object with bilingual step lists; empty when there is no solution
  const stepsForLang = solution == null ? null : lang === 'te' ? solution.solution_steps_te : solution.solution_steps_en;
  const solutionSteps = Array.isArray(stepsForLang) ? stepsForLang : [];
  // Mistake code from the server mapped to bilingual text; '' for unknown codes
  const mistakeText = mistakeHintFor(mistakeHint, lang);

  return (
    <div className="flex flex-col gap-4">
      {/* Offline note: hints and checking need the server */}
      {!online && (
        <p role="status" className="rounded-2xl bg-gray-100 text-gray-700 px-4 py-3 text-lg">
          {t('offlineBanner')}
        </p>
      )}

      {/* Progress bar: amber-to-violet fill, label uses the questionCount key */}
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-violet-800">
          {t('questionCount', { n: doneCount, m: pool.length })}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pool.length}
          aria-valuenow={doneCount}
          className="h-3 w-full bg-violet-100 rounded-full overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-violet-600 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {topicFilter && (
          <span className="rounded-full bg-amber-100 text-amber-900 px-4 py-2 text-lg">
            {t('topicPrefix', { topic: topicLabel(source, topicFilter, lang) })}
          </span>
        )}

        {/* Topic chip */}
        <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 text-violet-800 px-4 py-2 text-lg font-semibold">
          <span aria-hidden="true">📐</span>
          {loc(question.topic, lang)}
        </span>
      </div>

      <div className="card p-5">
        <p className="text-2xl leading-relaxed">{loc(question.question, lang)}</p>
      </div>

      <input
        type="text"
        autoComplete="off"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={finished}
        placeholder="x=?, y=?"
        className="text-2xl min-h-[56px] w-full border-2 border-violet-200 focus:border-violet-500 focus:outline-none rounded-2xl px-4 bg-white"
      />

      <TutorPanel question={question} />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={finished || busy}
        className="w-full min-h-[56px] bg-violet-600 text-white text-xl font-semibold rounded-2xl shadow-md disabled:opacity-50"
      >
        {t('submit')}
      </button>

      <p className="text-lg text-gray-600">{t('answerFormatHint')}</p>

      {/* Keep the live region mounted so screen readers announce each new message */}
      <div aria-live="polite">
        {message.key && (
          <p
            className={`rounded-2xl px-4 py-3 text-xl font-semibold ${
              message.ok
                ? 'bg-emerald-100 text-emerald-800 anim-pop'
                : message.info
                  ? 'bg-amber-50 text-amber-900 border-2 border-amber-200'
                  : 'bg-rose-100 text-rose-800 anim-shake'
            }`}
          >
            {message.ok && <span aria-hidden="true">✓ </span>}
            {t(message.key)}
          </p>
        )}
      </div>

      {/* Server hints, one card per wrong attempt */}
      {hints.length > 0 && (
        <div className="flex flex-col gap-3">
          {hints.map((h, i) => (
            <div
              key={i}
              className="anim-fade flex items-start gap-3 rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 text-lg leading-relaxed"
            >
              <span className="shrink-0 w-9 h-9 rounded-full bg-amber-400 text-white font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <p className="flex-1">
                <span aria-hidden="true">💡 </span>
                {typeof h === 'string' ? h : loc(h, lang)}
              </p>
            </div>
          ))}
        </div>
      )}

      {mistakeText && (
        <div className="anim-fade rounded-2xl bg-rose-50 border-2 border-rose-200 p-4 text-lg leading-relaxed">
          <p className="font-semibold">{t('mistakeLabel')}</p>
          <p>{mistakeText}</p>
        </div>
      )}

      {/* Full solution from the server: only when it is not null */}
      {solution != null && solutionSteps.length > 0 && (
        <div className="anim-fade rounded-2xl bg-blue-50 border-2 border-blue-200 p-4 flex flex-col gap-3">
          <h3 className="text-xl font-bold">{t('solution')}</h3>
          <ol className="flex flex-col gap-3">
            {solutionSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-lg leading-relaxed">
                <span className="shrink-0 w-9 h-9 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {finished && (
        <button
          type="button"
          onClick={loadNext}
          className="w-full min-h-[56px] bg-amber-500 text-white text-xl font-semibold rounded-2xl shadow-md"
        >
          {t('nextQuestion')}
        </button>
      )}
    </div>
  );
}
