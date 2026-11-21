// Only the doubt, question id and approved steps are sent. No name, PIN or profile id.
export async function askTutor(doubt, questionId, solutionSteps) {
  try {
    const res = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doubt: doubt.trim(), questionId, solutionSteps }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, reply: json.reply };
    return { ok: false, error: json.detail || 'ట్యూటర్ ప్రస్తుతం అందుబాటులో లేదు' };
  } catch {
    return { ok: false, error: 'ఇంటర్నెట్ అవసరం — ట్యూటర్ పనిచేయదు' };
  }
}
