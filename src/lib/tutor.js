import { apiRequest, getStudentToken } from './api.js';

// Sends one tutor question with the student token. The message, optional question id and language
// are the only fields sent: no solution steps, no student id, no name.
// Returns { ok, reply, ... } or { ok: false, status, code } so the UI can pick the right message.
export async function askTutor(message, questionId, language = 'te') {
  const body = { message: String(message ?? '').trim(), language };
  if (questionId) body.questionId = questionId;
  try {
    const res = await apiRequest('/api/tutor', {
      method: 'POST',
      token: getStudentToken(),
      body,
    });
    return { ok: true, reply: res.reply, hint: res.hint, steps: res.steps, finalAnswer: res.final_answer };
  } catch (err) {
    return { ok: false, status: err.status ?? 0, code: err.code ?? 'network' };
  }
}
