// The browser no longer judges answers. Correctness is decided by the server at
// POST /api/questions/{id}/check. This helper only trims what the student typed before sending it.
export function cleanAnswerInput(input) {
  return String(input ?? '').trim();
}
