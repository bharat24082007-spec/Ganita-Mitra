import { useEffect, useState } from 'react';
import {
  ApiError,
  apiRequest,
  clearParentToken,
  errorKeyFor,
  getParentToken,
  setParentToken,
} from '../lib/api.js';
import { AVATARS } from '../lib/profiles.js';
import { topicLabelFor, useLang } from '../lib/i18n.js';
import PinPad from './PinPad.jsx';
import { BackIcon } from './Icons.jsx';

const AVATAR_EMOJI = Object.fromEntries(AVATARS.map((a) => [a.key, a.emoji]));

// Parent / teacher area: one-time setup, PIN login, a student list and per-student reports.
// The parent token lives in sessionStorage only. The setup code is kept in component state and cleared.
export default function ParentView({ onExit }) {
  const { t, lang } = useLang();
  const [mode, setMode] = useState(() => (getParentToken() ? 'dashboard' : 'login'));
  // Banner key shown on the login screen (for example after the session expired)
  const [notice, setNotice] = useState('');

  // Setup
  const [setupCode, setSetupCode] = useState('');

  // Dashboard
  const [students, setStudents] = useState(null);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');

  // A rejected parent token sends the user back to login; a 403 means the token is not a parent token
  function handleAuthError(err, setError) {
    if (err instanceof ApiError && err.status === 401) {
      clearParentToken();
      setStudents(null);
      setReport(null);
      setSelectedId(null);
      setNotice('parentSessionExpired');
      setMode('login');
      return;
    }
    if (err instanceof ApiError && err.status === 403) {
      setError('parentForbidden');
      return;
    }
    setError(errorKeyFor(err));
  }

  useEffect(() => {
    if (mode !== 'dashboard') return undefined;
    let cancelled = false;
    setStudents(null);
    setListError('');
    apiRequest('/api/parents/students', { token: getParentToken() })
      .then((res) => {
        if (!cancelled) setStudents(res.students || []);
      })
      .catch((err) => {
        if (!cancelled) handleAuthError(err, setListError);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function openReport(studentId) {
    setSelectedId(studentId);
    setReport(null);
    setReportError('');
    try {
      const res = await apiRequest(`/api/parents/students/${encodeURIComponent(studentId)}/report`, {
        token: getParentToken(),
      });
      setReport(res);
    } catch (err) {
      handleAuthError(err, setReportError);
    }
  }

  // Returns null on success, or an i18n key for the PIN pad to show
  async function login(pin) {
    try {
      const res = await apiRequest('/api/parents/login', { method: 'POST', body: { pin } });
      setParentToken(res.token);
      setNotice('');
      setMode('dashboard');
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return 'parentNotSetup';
      return errorKeyFor(err);
    }
  }

  // Returns null on success, or an i18n key for the PIN pad to show. The setup code is sent once and not kept.
  async function setup(pin) {
    const code = setupCode.trim();
    try {
      await apiRequest('/api/parents/setup', {
        method: 'POST',
        body: { pin },
        headers: { 'X-Setup-Token': code },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return 'setupInvalidCode';
      if (err instanceof ApiError && err.status === 409) return 'setupConflict';
      if (err instanceof ApiError && err.status === 503) return 'setupNotConfigured';
      return errorKeyFor(err);
    }
    setSetupCode('');
    setNotice('setupDone');
    setMode('login');
    return null;
  }

  function logout() {
    clearParentToken();
    setStudents(null);
    setReport(null);
    setSelectedId(null);
    setNotice('');
    setMode('login');
  }

  if (mode === 'setup') {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-2xl font-bold">{t('parentSetupTitle')}</h2>
        <p className="text-lg text-gray-700">{t('parentSetupHint')}</p>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          {t('setupCode')}
          <input
            type="password"
            autoComplete="off"
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            className="text-xl min-h-[56px] w-full border-2 border-violet-200 focus:border-violet-500 focus:outline-none rounded-2xl px-4 bg-white"
          />
        </label>
        {setupCode.trim() !== '' && (
          <PinPad key="setup-pin" title={t('newPinTitle')} onSubmit={setup} onCancel={() => setMode('login')} />
        )}
        {setupCode.trim() === '' && (
          <button
            type="button"
            onClick={() => {
              setSetupCode('');
              setMode('login');
            }}
            className="min-h-[56px] w-full rounded-2xl bg-white border-2 border-violet-600 text-violet-700 text-lg font-semibold"
          >
            {t('cancel')}
          </button>
        )}
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <div className="flex flex-col gap-5">
        {notice && (
          <p className="text-lg font-semibold text-violet-800" aria-live="polite">
            {t(notice)}
          </p>
        )}
        <PinPad
          key="login-pin"
          title={t('parentLoginTitle')}
          onSubmit={login}
          onCancel={onExit}
        />
        {notice === 'parentNotSetup' && (
          <button
            type="button"
            onClick={() => setMode('setup')}
            className="min-h-[56px] w-full rounded-2xl bg-amber-500 text-white text-lg font-semibold"
          >
            {t('parentSetupTitle')}
          </button>
        )}
      </div>
    );
  }

  // Dashboard
  let studentList;
  if (listError) {
    studentList = <p className="text-xl text-red-600">{t(listError)}</p>;
  } else if (students === null) {
    studentList = <p className="text-xl">{t('loading')}</p>;
  } else if (students.length === 0) {
    studentList = <p className="text-xl">{t('noStudents')}</p>;
  } else {
    studentList = (
      <div className="flex flex-col gap-3">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openReport(s.id)}
            aria-pressed={selectedId === s.id}
            className={`card min-h-[64px] flex items-center gap-3 rounded-2xl p-4 text-left text-xl font-semibold border-2 ${
              selectedId === s.id ? 'border-amber-500 bg-amber-50' : 'border-violet-100 bg-white'
            }`}
          >
            <span aria-hidden="true" className="text-3xl">{AVATAR_EMOJI[s.avatar] ?? '🙂'}</span>
            <span className="flex-1">{s.display_name}</span>
            <span className="text-base text-violet-700">{t('viewReport')}</span>
          </button>
        ))}
      </div>
    );
  }

  let reportView = null;
  if (selectedId) {
    if (reportError) {
      reportView = <p className="text-xl text-red-600">{t(reportError)}</p>;
    } else if (!report) {
      reportView = <p className="text-xl">{t('loading')}</p>;
    } else {
      reportView = (
        <div className="card p-4 flex flex-col gap-4">
          <h3 className="text-2xl font-bold">
            <span aria-hidden="true">{AVATAR_EMOJI[report.student.avatar] ?? '🙂'} </span>
            {report.student.display_name}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-violet-50 p-3">
              <p className="text-base text-gray-600">{t('accuracyLabel')}</p>
              <p className="text-2xl font-bold">{report.accuracy_pct}%</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3">
              <p className="text-base text-gray-600">{t('lessonsDone')}</p>
              <p className="text-2xl font-bold">{report.lessons_completed}</p>
            </div>
          </div>
          <p className="text-lg">{t('questionsAttemptedCount', { n: report.questions_attempted })}</p>
          <p className="text-lg">{t('correctCount', { n: report.correct })}</p>

          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">{t('weakTopics')}</h4>
            {report.weak_topics.length ? (
              <div className="flex flex-wrap gap-2">
                {report.weak_topics.map((topic) => (
                  <span key={topic} className="rounded-full bg-rose-100 text-rose-800 text-lg px-3 py-1">
                    {topicLabelFor(topic, lang)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-lg">{t('none')}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">{t('recommendations')}</h4>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-lg">
              {report.recommendations.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <span aria-hidden="true">👨‍👩‍👧</span>
        {t('parentTitle')}
      </h2>

      {studentList}
      {reportView}

      <button
        type="button"
        onClick={logout}
        className="w-full min-h-[56px] rounded-2xl bg-white border-2 border-violet-600 text-violet-700 text-lg font-semibold"
      >
        {t('parentLogout')}
      </button>
      <button
        type="button"
        onClick={() => onExit()}
        className="w-full min-h-[56px] rounded-2xl border-2 border-violet-600 text-violet-700 text-lg font-semibold flex items-center justify-center gap-2"
      >
        <BackIcon className="w-6 h-6" />
        {t('back')}
      </button>
    </div>
  );
}
