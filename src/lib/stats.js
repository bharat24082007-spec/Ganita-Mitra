// Pure stats helpers. No IndexedDB access and no side effects, so they are easy to test.

// Local calendar date key (YYYY-MM-DD) for a timestamp.
function dateKey(ts) {
  return new Date(ts).toLocaleDateString('en-CA');
}

// Summarises one profile's attempts and lesson views for the progress screen.
export function computeStats(attempts, lessonViews) {
  // Distinct lessons and questions, each counted once.
  const lessonsCompleted = new Set(lessonViews.map((v) => v.lessonId)).size;
  const questionsAttempted = new Set(attempts.map((a) => a.questionId)).size;

  // Every attempt counts toward accuracy, not just distinct questions.
  const correctCount = attempts.filter((a) => a.correct === true).length;
  const accuracy = attempts.length === 0 ? 0 : Math.round((100 * correctCount) / attempts.length);

  // Count attempts per local day so streak and the 7-day chart share one source.
  const countByDay = {};
  let lastActive = null;
  for (const a of attempts) {
    const key = dateKey(a.timestamp);
    countByDay[key] = (countByDay[key] || 0) + 1;
    if (lastActive === null || a.timestamp > lastActive) lastActive = a.timestamp;
  }

  // Start from today; if today is empty, a streak can still end yesterday.
  const dayAt = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return dateKey(d);
  };
  let streak = 0;
  let offset = countByDay[dayAt(0)] ? 0 : 1;
  while (countByDay[dayAt(offset)]) {
    streak++;
    offset++;
  }

  // Count mistakes per topic; keep first-seen order so ties resolve predictably.
  const mistakes = new Map();
  for (const a of attempts) {
    if (a.correct === false) {
      mistakes.set(a.topic, (mistakes.get(a.topic) || 0) + 1);
    }
  }
  const weakTopics = [...mistakes.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([topic]) => topic);

  // Oldest first, so the chart reads left to right.
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = dayAt(i);
    last7Days.push({ date, count: countByDay[date] || 0 });
  }

  return {
    lessonsCompleted,
    questionsAttempted,
    accuracy,
    streak,
    lastActive,
    weakTopics,
    last7Days,
  };
}

// Number of attempts not yet uploaded to the server.
export function syncSummary(attempts) {
  return { pending: attempts.filter((a) => a.synced !== true).length };
}
