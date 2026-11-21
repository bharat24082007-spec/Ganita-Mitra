export function isVoiceSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Returns a stop function. Telugu recognition; one final result, no interim text.
export function startListening({ onResult, onError }) {
  try {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'te-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => onResult(e.results[0][0].transcript);
    recognition.onerror = (e) => onError(e.error);
    recognition.start();
    return () => recognition.stop();
  } catch (err) {
    onError(err?.message || 'voice-start-failed');
    return () => {};
  }
}
