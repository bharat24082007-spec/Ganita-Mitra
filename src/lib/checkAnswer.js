// Accepted formats for the answer x=2, y=3:
//   "x=2, y=3", "x=2,y=3", "y=3,x=2"
// Case, whitespace and a trailing '.' or ';' are ignored, since students type freely.

export const ANSWER_FORMAT_HINT = 'ఉదాహరణ: x=2, y=3 (x, y విలువలను కామాతో రాయండి)';

function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '').replace(/[.;]$/, '');
}

export function checkAnswer(input, correct) {
  const given = normalize(input);
  const right = normalize(correct);
  if (given === right) return true;

  // Also accept the pair in swapped order (y first) when the answer is x=<a>,y=<b>.
  const m = right.match(/^x=([^,]+),y=([^,]+)$/);
  return m ? given === `y=${m[2]},x=${m[1]}` : false;
}
