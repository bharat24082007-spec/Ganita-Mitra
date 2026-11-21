import { topicKey } from './i18n.js';

// Picks the next question: focus on the weakest topic, otherwise follow chapter order.
// Attempts store topicKey(question), so topics are compared by that key.
export function pickNextQuestion(questions, attempts) {
  if (!questions || questions.length === 0) return undefined;

  const solved = new Set(attempts.filter((a) => a.correct === true).map((a) => a.questionId));

  const mistakes = new Map();
  for (const a of attempts) {
    if (a.correct === false) mistakes.set(a.topic, (mistakes.get(a.topic) || 0) + 1);
  }

  // Scan in chapter order with a strict '>' so ties go to the topic that appears first.
  let topic = null;
  let best = 0;
  for (const q of questions) {
    const n = mistakes.get(topicKey(q)) || 0;
    if (n > best) {
      best = n;
      topic = topicKey(q);
    }
  }

  if (topic !== null) {
    const topicQs = questions.filter((q) => topicKey(q) === topic);
    return topicQs.find((q) => !solved.has(q.id)) ?? topicQs[0];
  }

  // No mistakes yet: move through the chapter in order.
  return questions.find((q) => !solved.has(q.id)) ?? questions[0];
}
