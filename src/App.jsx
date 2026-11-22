import { useEffect, useRef, useState } from 'react';
import ProfileScreen from './components/ProfileScreen.jsx';
import LessonScreen from './components/LessonScreen.jsx';
import PracticeScreen from './components/PracticeScreen.jsx';
import ProgressScreen from './components/ProgressScreen.jsx';
import ParentView from './components/ParentView.jsx';
import OfflineBadge from './components/OfflineBadge.jsx';
import Card from './components/ui/Card.jsx';
import Button from './components/ui/Button.jsx';
import { BookIcon, PencilIcon, ChartIcon, SwitchIcon } from './components/Icons.jsx';
import { flushQueue, startSyncOnReconnect } from './lib/sync.js';
import { registerServiceWorker, applyUpdate } from './lib/swRegister.js';
import { apiRequest, clearStudentToken, getStudentToken } from './lib/api.js';
import { getLang, setLang, getLastLang, setLastLang } from './lib/db.js';
import { DEFAULT_LANG, LangContext, loc, t } from './lib/i18n.js';

// Server question list (no answers) mapped to the shape the practice and progress screens use
function toQuestion(row) {
  return {
    id: row.id,
    topic: row.topic,
    question: { te: row.prompt_te, en: row.prompt_en },
    hintCount: row.hint_count,
    difficulty: row.difficulty,
    questionType: row.question_type,
  };
}

export default function App() {
  const [screen, setScreen] = useState('profile');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [tab, setTab] = useState('lesson');
  const [practiceTopic, setPracticeTopic] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [lang, setLangState] = useState(DEFAULT_LANG);
  // Questions come from the backend once a student is signed in
  const [questions, setQuestions] = useState(null);
  const [questionsError, setQuestionsError] = useState(false);
  // A new service worker is waiting; the registration is kept so applyUpdate can activate it
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef(null);

  useEffect(() => {
    if (!currentProfile) {
      setQuestions(null);
      return undefined;
    }
    let cancelled = false;
    setQuestionsError(false);
    apiRequest('/api/chapters/linear-equations/questions', { token: getStudentToken() })
      .then((res) => {
        if (!cancelled) setQuestions(res.questions.map(toQuestion));
      })
      .catch(() => {
        if (!cancelled) setQuestionsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProfile]);

  useEffect(() => {
    fetch('/data/chapter.json')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setChapter)
      .catch(() => setLoadError(true));
  }, []);

  // Push queued attempts on load and whenever the connection returns
  useEffect(() => startSyncOnReconnect(), []);

  // Register the service worker once; show a banner when a new version is waiting
  useEffect(() => {
    registerServiceWorker((registration) => {
      registrationRef.current = registration;
      setUpdateReady(true);
    });
  }, []);

  // Restore the last used language on start
  useEffect(() => {
    Promise.resolve(getLastLang()).then((saved) => {
      if (saved) setLangState(saved);
    });
  }, []);

  // Switch instantly; remember it as the last used and per profile when one is chosen
  function changeLang(next) {
    setLangState(next);
    setLastLang(next);
    if (currentProfile) setLang(currentProfile.id, next);
  }

  // Called after the server accepts a student's PIN (or a new profile is created)
  function enterProfile(profile) {
    setCurrentProfile(profile);
    setTab('lesson');
    setScreen('home');
    // The profile's saved language overrides the last used one, if it has one
    setLangState(profile.preferredLanguage || DEFAULT_LANG);
    Promise.resolve(getLang(profile.id)).then((saved) => {
      if (saved) setLangState(saved);
    });
    // Push any queued attempts now that a token is held
    flushQueue();
  }

  const tx = (key, vars) => t(lang, key, vars);

  // The home screen is the only one with the bottom tab bar, so it gets extra bottom padding
  const isHome = screen === 'home' && !!chapter && !loadError;

  let body;
  if (loadError) {
    body = <p className="text-xl text-red-600">{tx('loadError')}</p>;
  } else if (!chapter) {
    body = <p className="text-xl">{tx('loading')}</p>;
  } else if (screen === 'profile') {
    body = (
      <ProfileScreen
        onEnter={enterProfile}
        onParentView={() => setScreen('parent')}
      />
    );
  } else if (screen === 'parent') {
    body = <ParentView onExit={() => setScreen('profile')} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {/* Dashboard header: greeting, chapter title, and the two main actions (no invented stats) */}
        <Card className="flex flex-col gap-3 border border-primary/15 shadow-soft">
          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold text-ink">
              {tx('greetingHello')}, {currentProfile.name}
            </p>
            <p className="text-lg text-muted">{loc(chapter.chapter, lang)}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" className="flex-1 min-w-[140px]" onClick={() => setTab('lesson')}>
              {tx('continueLearning')}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 min-w-[140px]"
              onClick={() => {
                setTab('practice');
                setPracticeTopic(null);
              }}
            >
              {tx('tabPractice')}
            </Button>
          </div>
        </Card>

        {/* Chapter title in a card with an amber accent stripe */}
        <div className="card border-l-4 border-amber-500 p-4">
          <h1 className="text-2xl font-bold">{loc(chapter.chapter, lang)}</h1>
        </div>

        {questionsError && <p className="text-xl text-red-600">{tx('questionsLoadFailed')}</p>}

        {tab === 'lesson' ? (
          <LessonScreen chapter={chapter} profileId={currentProfile.id} />
        ) : tab === 'practice' ? (
          <>
            {practiceTopic && (
              <button
                type="button"
                onClick={() => setPracticeTopic(null)}
                className="min-h-[48px] self-start px-4 bg-violet-50 text-violet-700 rounded-xl text-lg font-semibold"
              >
                {tx('allTopics')}
              </button>
            )}
            <PracticeScreen
              profile={currentProfile}
              questions={questions}
              topicFilter={practiceTopic || undefined}
            />
          </>
        ) : (
          <ProgressScreen
            profile={currentProfile}
            questions={questions || []}
            onPractice={(topic) => {
              setPracticeTopic(topic);
              setTab('practice');
            }}
          />
        )}
      </div>
    );
  }

  // Top bar on every screen: avatar and name (when a profile is set), language toggle,
  // and a switch-profile button (when a profile is set). The active language is highlighted.
  const topBar = (
    <header className="sticky top-0 z-10 bg-surface shadow-sm">
      <div className="flex min-h-[64px] flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {currentProfile && (
            <>
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl"
              >
                {currentProfile.avatar}
              </span>
              <span className="truncate text-lg font-semibold">{currentProfile.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => changeLang(lang === 'te' ? 'en' : 'te')}
            className="min-h-[44px] px-2 sm:px-3 bg-surface border-2 border-primary text-primary-dark text-base rounded-xl font-semibold"
          >
            <span className={`px-1 rounded ${lang === 'te' ? 'bg-primary text-white' : ''}`}>తెలుగు</span>
            {' | '}
            <span className={`px-1 rounded ${lang === 'en' ? 'bg-primary text-white' : ''}`}>English</span>
          </button>
          {currentProfile && (
            <button
              type="button"
              onClick={() => {
                // Switching profile signs the student out: the token is cleared from sessionStorage
                clearStudentToken();
                setCurrentProfile(null);
                setPracticeTopic(null);
                setScreen('profile');
              }}
              aria-label={tx('switchProfile')}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 px-2 sm:px-3 bg-primary/10 text-primary-dark text-base rounded-xl font-semibold"
            >
              <SwitchIcon className="w-5 h-5" />
              <span className="hidden sm:inline">{tx('switchProfile')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );

  // Bottom tab bar (home only): three equal tabs; the active one is primary with an accent top border
  const tabs = [
    { key: 'lesson', label: tx('tabLesson'), Icon: BookIcon },
    { key: 'practice', label: tx('tabPractice'), Icon: PencilIcon },
    { key: 'progress', label: tx('tabProgress'), Icon: ChartIcon },
  ];
  const tabBar = (
    <nav className="fixed bottom-0 inset-x-0 z-20 mx-auto grid w-full max-w-[480px] grid-cols-3 bg-surface shadow-[0_-4px_14px_rgba(0,0,0,0.08)]">
      {tabs.map(({ key, label, Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 border-t-4 text-lg font-semibold ${
              active ? 'border-accent text-primary' : 'border-transparent text-muted'
            }`}
          >
            <Icon className="w-7 h-7" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <LangContext.Provider value={{ lang, setLang: changeLang, t: tx }}>
      <OfflineBadge />
      {updateReady && (
        <div
          role="status"
          className="fixed bottom-0 inset-x-0 z-40 mx-auto flex w-full max-w-[480px] flex-wrap items-center justify-between gap-2 bg-violet-600 px-4 py-3 text-lg text-white shadow-[0_-4px_14px_rgba(0,0,0,0.12)]"
        >
          <span>{tx('updateAvailable')}</span>
          <button
            type="button"
            onClick={() => applyUpdate(registrationRef.current)}
            className="min-h-[44px] px-4 bg-amber-500 text-gray-900 rounded-xl font-semibold"
          >
            {tx('updateNow')}
          </button>
        </div>
      )}
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        {topBar}
        <main className={`flex-1 px-4 pt-4 ${isHome ? 'pb-24' : 'pb-4'}`}>{body}</main>
      </div>
      {isHome && tabBar}
    </LangContext.Provider>
  );
}
