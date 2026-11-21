import { useEffect, useRef, useState } from 'react';
import { addAttempt, getAttempts } from '../lib/db.js';
import { pickNextQuestion } from '../lib/adaptive.js';
import { checkAnswer, ANSWER_FORMAT_HINT } from '../lib/checkAnswer.js';

export default function PracticeScreen({ profile, questions, onAttemptSaved }) {
  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState({ text: '', ok: false });
  const [hintsShown, setHintsShown] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [solutionShown, setSolutionShown] = useState(false);
  const [finished, setFinished] = useState(false);
  // Prevents saving the same question twice (double tap, rapid clicks)
  const savedRef = useRef(false);

  async function loadNext() {
    const attempts = await getAttempts(profile.id);
    const mapped = attempts.map((a) => ({
      questionId: a.questionId,
      correct: a.correct,
      topic: a.topic,
    }));
    const q = pickNextQuestion(questions, mapped);
    savedRef.current = false;
    setQuestion(q);
    setHintsShown(0);
    setWrongCount(0);
    setSolutionShown(false);
    setFinished(false);
    setInput('');
    setMessage({ text: '', ok: false });
  }

  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, questions]);

  // Hints and solution are passed in explicitly so the saved record never reads stale state
  async function finish(correct, hints, solution) {
    if (savedRef.current) return;
    savedRef.current = true;
    await addAttempt({
      profileId: profile.id,
      questionId: question.id,
      correct,
      topic: question.topic,
      hintsUsed: hints,
      solutionShown: solution,
    });
    setSolutionShown(solution);
    setFinished(true);
    onAttemptSaved?.();
  }

  function handleSubmit() {
    if (!question) return;
    if (input.trim() === '') {
      setMessage({ text: 'జవాబు రాయండి', ok: false });
      return;
    }
    if (checkAnswer(input, question.answer)) {
      setMessage({ text: 'సరైనది!', ok: true });
      finish(true, hintsShown, solutionShown);
    } else {
      // Wrong answers are not saved; the learner can retry
      setMessage({ text: 'తప్పు, మళ్లీ ప్రయత్నించు', ok: false });
      setWrongCount(wrongCount + 1);
    }
  }

  function showSolution() {
    setSolutionShown(true);
    finish(false, hintsShown, true);
  }

  if (!question) {
    return <p className="text-xl">లోడ్ అవుతోంది...</p>;
  }

  const canHelp = !finished && wrongCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <span className="self-start rounded-full bg-violet-100 px-4 py-2 text-lg">
        {question.topic}
      </span>

      <p className="text-xl">{question.question}</p>

      <input
        type="text"
        autoComplete="off"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={finished}
        placeholder="x=?, y=?"
        className="text-2xl min-h-[56px] border-2 rounded-xl px-4 bg-white"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={finished}
        className="min-h-[56px] bg-violet-600 text-white text-xl rounded-xl disabled:opacity-50"
      >
        సమర్పించు
      </button>

      <p className="text-base text-gray-600">{ANSWER_FORMAT_HINT}</p>

      <p
        aria-live="polite"
        className={`text-xl font-semibold ${message.ok ? 'text-green-600' : 'text-red-600'}`}
      >
        {message.text}
      </p>

      {canHelp && (
        <div className="flex flex-col gap-3">
          {hintsShown === 0 && (
            <button
              type="button"
              onClick={() => setHintsShown(1)}
              className="min-h-[56px] rounded-xl bg-white border-2 text-xl"
            >
              సూచన 1
            </button>
          )}
          {hintsShown === 1 && (
            <button
              type="button"
              onClick={() => setHintsShown(2)}
              className="min-h-[56px] rounded-xl bg-white border-2 text-xl"
            >
              సూచన 2
            </button>
          )}
          {question.hints.slice(0, hintsShown).map((h, i) => (
            <div key={i} className="bg-yellow-100 rounded-xl p-4 text-lg">
              {h}
            </div>
          ))}
          <button
            type="button"
            onClick={showSolution}
            className="min-h-[56px] rounded-xl bg-white border-2 text-xl"
          >
            పూర్తి పరిష్కారం చూపించు
          </button>
        </div>
      )}

      {finished && (
        <>
          <div className="bg-blue-50 rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-xl font-bold">పరిష్కారం</h3>
            <ol className="list-decimal pl-6 text-lg flex flex-col gap-1">
              {question.solution.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={loadNext}
            className="min-h-[56px] bg-violet-600 text-white text-xl rounded-xl"
          >
            తరువాతి ప్రశ్న
          </button>
        </>
      )}
    </div>
  );
}
