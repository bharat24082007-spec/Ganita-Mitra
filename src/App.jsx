import { useEffect, useState } from 'react';
import ProfileScreen from './components/ProfileScreen.jsx';
import PinPad from './components/PinPad.jsx';
import LessonScreen from './components/LessonScreen.jsx';
import PracticeScreen from './components/PracticeScreen.jsx';
import ProgressScreen from './components/ProgressScreen.jsx';
import ParentView from './components/ParentView.jsx';
import OfflineBadge from './components/OfflineBadge.jsx';
import { BookIcon, PencilIcon, ChartIcon, SwitchIcon } from './components/Icons.jsx';
import { flushQueue, startSyncOnReconnect } from './lib/sync.js';
import { verifyStudentPin } from './lib/profiles.js';
import { apiRequest, clearStudentToken, errorKeyFor, getStudentToken } from './lib/api.js';
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
  const [selected, setSelected] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [tab, setTab] = useState('lesson');
  const [practiceTopic, setPracticeTopic] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [lang, setLangState] = useState(DEFAULT_LANG);
  // Questions come from the backend once a student is signed in
  const [questions, setQuestions] = useState(null);
  const [questionsError, setQuestionsError] = useState(false);

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
    setSelected(null);
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
        onSelect={(p) => {
          setSelected(p);
          setScreen('pin');
        }}
        onEnter={enterProfile}
        onParentView={() => setScreen('parent')}
      />
    );
  } else if (screen === 'pin') {
    body = (
      <PinPad
        name={selected.name}
        onSubmit={async (pin) => {
          // The server checks the PIN; the browser only sends it
          try {
            await verifyStudentPin(selected.id, pin);
          } catch (err) {
            return errorKeyFor(err);
          }
          enterProfile(selected);
          return null;
        }}
        onCancel={() => setScreen('profile')}
      />
    );
  } else if (screen === 'parent') {
    body = <ParentView onExit={() => setScreen('profile')} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
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
    <header className="sticky top-0 z-10 bg-white shadow-sm">
      <div className="flex min-h-[64px] items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {currentProfile && (
            <>
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-2xl"
              >
                {currentProfile.avatar}
              </span>
              <span className="truncate text-lg font-semibold">{currentProfile.name}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => changeLang(lang === 'te' ? 'en' : 'te')}
            className="min-h-[44px] px-3 bg-white border-2 border-violet-600 text-violet-700 text-base rounded-xl font-semibold"
          >
            <span className={`px-1 rounded ${lang === 'te' ? 'bg-violet-600 text-white' : ''}`}>తెలుగు</span>
            {' | '}
            <span className={`px-1 rounded ${lang === 'en' ? 'bg-violet-600 text-white' : ''}`}>English</span>
          </button>
          {currentProfile && (
            <button
              type="button"
              onClick={() => {
                // Switching profile signs the student out: the token is cleared from sessionStorage
                clearStudentToken();
                setCurrentProfile(null);
                setSelected(null);
                setPracticeTopic(null);
                setScreen('profile');
              }}
              className="flex min-h-[44px] items-center gap-1 px-3 bg-violet-50 text-violet-700 text-base rounded-xl font-semibold"
            >
              <SwitchIcon className="w-5 h-5" />
              <span>{tx('switchProfile')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );

  // Bottom tab bar (home only): three equal tabs; the active one is violet with an amber top border
  const tabs = [
    { key: 'lesson', label: tx('tabLesson'), Icon: BookIcon },
    { key: 'practice', label: tx('tabPractice'), Icon: PencilIcon },
    { key: 'progress', label: tx('tabProgress'), Icon: ChartIcon },
  ];
  const tabBar = (
    <nav className="fixed bottom-0 inset-x-0 z-20 mx-auto grid w-full max-w-[480px] grid-cols-3 bg-white shadow-[0_-4px_14px_rgba(0,0,0,0.08)]">
      {tabs.map(({ key, label, Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 border-t-4 text-lg font-semibold ${
              active ? 'border-amber-500 text-violet-600' : 'border-transparent text-gray-500'
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
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        {topBar}
        <main className={`flex-1 px-4 pt-4 ${isHome ? 'pb-24' : 'pb-4'}`}>{body}</main>
      </div>
      {isHome && tabBar}
    </LangContext.Provider>
  );
}
