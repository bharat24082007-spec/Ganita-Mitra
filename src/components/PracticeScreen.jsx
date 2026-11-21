import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, getStudentToken } from '../lib/api.js';
import { pickNextQuestion } from '../lib/adaptive.js';
import { cleanAnswerInput } from '../lib/checkAnswer.js';
import { loc, mistakeHintFor, topicKey, topicLabel, useLang } from '../lib/i18n.js';
import TutorPanel from './TutorPanel.jsx';

// Practice: questions come from the server. Correctness, hints and solutions come from POST /check.
export default function PracticeScreen({ profile, questions, topicFilter }) {
  const { lang, t } = useLang();
  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState('');
  // Message holds an i18n key so it switches language with the toggle
  const [message, setMessage] = useState({ key: '', ok: false });
  const [hints, setHints] = useState([]);
  const [mistakeHint, setMistakeHint] = useState(null);
  const [solution, setSolution] = useState(null);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  // Correct question ids this session (drives the progress bar)
  const [doneIds, setDoneIds] = useState(() => new Set());
  // This session's answers, used only to pick the next question
  const historyRef = useRef([]);

  // Memoized so the load effect only re-runs when the pool really changes
  const pool = useMemo(() => {
    if (!questions) return null;
    return topicFilter ? questions.filter((q) => topicKey(q) === topicFilter) : questions;
  }, [questions, topicFilter]);

  function loadNext() {
    if (!pool || pool.length === 0) return;
    const q = pickNextQuestion(pool, historyRef.current);
    setQuestion(q);
    setHints([]);
    setMistakeHint(null);
    setSolution(null);
    setFinished(false);
    setInput('');
    setMessage({ key: '', ok: false });
  }

  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, pool, topicFilter]);

  async function handleSubmit() {
    if (!question || busy || finished) return;
    const answer = cleanAnswerInput(input);
    if (answer === '') {
      setMessage({ key: 'writeAnswer', ok: false });
      return;
    }
    setBusy(true);
    let res;
    try {
      res = await apiRequest(`/api/questions/${encodeURIComponent(question.id)}/check`, {
        method: 'POST',
        token: getStudentToken(),
        body: { answer, lang },
      });
    } catch {
      setBusy(false);
      setMessage({ key: 'checkFailed', ok: false });
      return;
    }
    setBusy(false);
    historyRef.current = [
      ...historyRef.current,
      { questionId: question.id, correct: res.is_correct, topic: topicKey(question) },
    ];

    if (res.is_correct) {
      setMessage({ key: 'correct', ok: true });
      setDoneIds((prev) => new Set(prev).add(question.id));
      setFinished(true);
      return;
    }

    // Wrong: the server sends the hint for this attempt, a mistake note, and a solution after enough tries
    setMessage({ key: 'wrongTryAgain', ok: false });
    if (res.hint) setHints((h) => [...h, res.hint]);
    setMistakeHint(res.mistake_hint ?? null);
    if (res.solution != null) {
      setSolution(res.solution);
      setFinished(true);
    }
  }

  if (!questions) {
    return <p className="text-xl">{t('loading')}</p>;
  }

  if (pool.length === 0) {
    return <p className="text-xl">{t('noQuestionsTopic')}</p>;
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
            {t('topicPrefix', { topic: topicLabel(questions, topicFilter, lang) })}
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
