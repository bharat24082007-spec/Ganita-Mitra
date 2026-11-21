import { useEffect, useRef, useState } from 'react';
import { askTutor } from '../lib/tutor.js';
import { isVoiceSupported, startListening } from '../lib/voice.js';

export default function TutorPanel({ question }) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [messages, setMessages] = useState([]);
  const [doubt, setDoubt] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const stopRef = useRef(null);
  const qidRef = useRef(question.id);

  // Track connection; stop the mic when going offline
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => {
      setOnline(false);
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Stop the mic on unmount
  useEffect(() => () => stopRef.current?.(), []);

  // Fresh chat for each question; ignore replies to an old question
  useEffect(() => {
    qidRef.current = question.id;
    setMessages([]);
    setBusy(false);
  }, [question.id]);

  async function send() {
    const text = doubt.trim();
    if (!text || busy) return;
    const qid = question.id;
    setMessages((m) => [...m, { role: 'student', text }]);
    setDoubt('');
    setBusy(true);
    const res = await askTutor(text, qid, question.solution);
    if (qidRef.current !== qid) return;
    setMessages((m) => [
      ...m,
      res.ok ? { role: 'tutor', text: res.reply } : { role: 'error', text: res.error },
    ]);
    setBusy(false);
  }

  function toggleMic() {
    if (listening) {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      return;
    }
    stopRef.current = startListening({
      onResult: (t) => setDoubt((prev) => (prev ? prev + ' ' : '') + t),
      onError: () => {
        stopRef.current?.();
        stopRef.current = null;
        setListening(false);
        setVoiceFailed(true);
      },
    });
    setListening(true);
  }

  const showMic = online && !voiceFailed && isVoiceSupported();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-[56px] bg-amber-500 text-white text-xl rounded-xl px-4"
      >
        ప్రశ్న అడగండి
      </button>

      {open && !online && (
        <div className="bg-gray-200 text-gray-700 rounded-xl p-4 text-lg">
          ట్యూటర్ పనిచేయడానికి ఇంటర్నెట్ అవసరం. పాఠం మరియు అభ్యాసం ఆఫ్‌లైన్‌లో పనిచేస్తాయి.
        </div>
      )}

      {open && online && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-xl p-3 text-lg whitespace-pre-wrap ${
                  m.role === 'student'
                    ? 'self-end bg-violet-100'
                    : m.role === 'tutor'
                      ? 'self-start bg-white border-2'
                      : 'self-start bg-red-50 text-red-600 border-2 border-red-200'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {busy && <p className="text-lg text-gray-600">ఆలోచిస్తోంది...</p>}

          <textarea
            value={doubt}
            onChange={(e) => setDoubt(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="మీ సందేహం రాయండి"
            className="text-xl min-h-[96px] border-2 rounded-xl p-3 bg-white"
          />

          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="min-h-[56px] bg-violet-600 text-white text-xl rounded-xl disabled:opacity-50"
          >
            పంపు
          </button>

          {showMic && (
            <button
              type="button"
              onClick={toggleMic}
              className="min-h-[56px] bg-white border-2 text-xl rounded-xl"
            >
              {listening ? 'ఆపు' : '🎤 మాట్లాడండి'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
