import { useEffect, useRef, useState } from 'react';
import { askTutor } from '../lib/tutor.js';
import { isVoiceSupported, startListening } from '../lib/voice.js';
import { t as translate } from '../lib/i18n.js';

// Inline SVG icons (no icon library)
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}

// askTutor returns { ok:false, status:0, code:'network' } when the request never reached the server.
function isNetworkFailure(res) {
  return res.code === 'network' || res.status === 0;
}

// Maps a failed tutor call to a user message. The tutor needs internet, so network errors say so.
function tutorErrorKey(res) {
  if (isNetworkFailure(res)) return 'tutorNeedsInternet';
  if (res.status === 429) return 'tutorRateLimited';
  if (res.status === 503) return 'tutorNotConfigured';
  if (res.status === 502) return 'tutorUpstream';
  return 'genericError';
}

// Tutor chat for one question. The tutor has its own language switch, defaulting to Telugu.
// It sends only the message, the question id and the language. Solution steps never leave the browser.
export default function TutorPanel({ question }) {
  const [tutorLang, setTutorLang] = useState('te');
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [messages, setMessages] = useState([]);
  const [doubt, setDoubt] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const stopRef = useRef(null);
  const qidRef = useRef(question.id);
  // Strings in this panel follow the tutor's own language, not the app language
  const tr = (key, vars) => translate(tutorLang, key, vars);

  // Track connection; stop the mic and the typing indicator when going offline
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => {
      setOnline(false);
      setBusy(false);
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
    // Offline: never start a request, and keep the unsent text in the input
    if (!text || busy || !online || navigator.onLine === false) return;
    const qid = question.id;
    const studentMsg = { role: 'student', text };
    setMessages((m) => [...m, studentMsg]);
    setDoubt('');
    setBusy(true);
    const res = await askTutor(text, qid, tutorLang);
    if (qidRef.current !== qid) return;
    if (!res.ok && isNetworkFailure(res)) {
      // Not sent: remove the bubble, put the text back, and show the offline message
      setMessages((m) => [...m.filter((x) => x !== studentMsg), { role: 'error', text: tr('tutorNeedsInternet') }]);
      setDoubt((current) => (current ? current : text));
      setBusy(false);
      return;
    }
    setMessages((m) => [
      ...m,
      res.ok ? { role: 'tutor', text: res.reply } : { role: 'error', text: tr(tutorErrorKey(res)) },
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
      lang: tutorLang,
      onResult: (r) => setDoubt((prev) => (prev ? prev + ' ' : '') + r),
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
  // The typing indicator only shows while online
  const typing = busy && online;

  return (
    <div className="flex flex-col gap-3">
      {/* Toggle pill */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start min-h-[56px] inline-flex items-center gap-2 rounded-full bg-amber-100 border-2 border-amber-300 text-amber-900 text-xl font-semibold px-5 shadow-sm"
      >
        <span aria-hidden="true">🧑‍🏫</span>
        {tr('tutorTitle')}
      </button>

      {open && (
        <div className="card flex flex-col gap-4 p-4">
          {/* Header: teacher avatar, title, language switch */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="shrink-0 w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center text-2xl"
              >
                🧑‍🏫
              </div>
              <div className="flex flex-col">
                <h3 className="text-xl font-bold">{tr('tutorTitle')}</h3>
                <p className="text-lg text-gray-600">{tr('tutorIntro')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTutorLang((l) => (l === 'te' ? 'en' : 'te'))}
              className="shrink-0 min-h-[44px] px-3 rounded-xl border-2 border-violet-600 text-violet-700 text-base font-semibold"
            >
              {tr('tutorSwitchLang')}
            </button>
          </div>

          {/* Offline: gray notice; the input stays so unsent text is kept, but send is disabled */}
          {!online && (
            <div className="bg-gray-100 text-gray-700 p-4 text-lg rounded-2xl flex items-start gap-3">
              <span aria-hidden="true" className="text-2xl">📡</span>
              <p>{tr('tutorNeedsInternet')}</p>
            </div>
          )}

          {online && <p className="text-base text-gray-600">{tr('tutorNeedsNet')}</p>}

          {/* Chat area: scrolls past 50vh */}
          {(messages.length > 0 || typing) && (
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`anim-fade max-w-[85%] rounded-2xl px-4 py-3 text-lg leading-relaxed whitespace-pre-wrap ${
                    m.role === 'student'
                      ? 'self-end bg-violet-600 text-white'
                      : m.role === 'tutor'
                        ? 'self-start bg-white border-2 border-gray-200 shadow-sm text-gray-800'
                        : 'self-start bg-rose-50 text-rose-700 border-2 border-rose-200'
                  }`}
                >
                  {m.text}
                </div>
              ))}

              {/* Busy: three pulsing dots, with the thinking text as label and caption */}
              {typing && (
                <div className="self-start flex flex-col gap-1">
                  <div
                    role="status"
                    aria-label={tr('thinking')}
                    className="flex items-center gap-1.5 rounded-2xl bg-white border-2 border-gray-200 shadow-sm px-4 py-3"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse" />
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-lg text-gray-600">{tr('thinking')}</p>
                </div>
              )}
            </div>
          )}

          {/* Input row: textarea, mic (when supported), send */}
          <div className="flex items-end gap-2">
            <textarea
              value={doubt}
              onChange={(e) => setDoubt(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={tr('doubtPlaceholder')}
              className="flex-1 min-h-[56px] text-xl border-2 border-violet-200 focus:border-violet-500 focus:outline-none rounded-2xl p-3 bg-white"
            />

            {showMic && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? tr('stopVoice') : tr('speakVoice')}
                aria-pressed={listening}
                className={`shrink-0 min-w-[56px] min-h-[56px] w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md ${
                  listening ? 'bg-amber-600 animate-pulse' : 'bg-amber-500'
                }`}
              >
                <MicIcon />
              </button>
            )}

            <button
              type="button"
              onClick={send}
              disabled={busy || !online}
              aria-label={tr('send')}
              className="shrink-0 min-w-[56px] min-h-[56px] w-14 h-14 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
