import { useEffect, useState } from 'react';
import ProfileScreen from './components/ProfileScreen.jsx';
import PinPad from './components/PinPad.jsx';
import LessonScreen from './components/LessonScreen.jsx';
import PracticeScreen from './components/PracticeScreen.jsx';
import ProgressScreen from './components/ProgressScreen.jsx';
import ParentView from './components/ParentView.jsx';
import OfflineBadge from './components/OfflineBadge.jsx';
import { startSyncOnReconnect } from './lib/sync.js';
import { PARENT_PIN } from './lib/profiles.js';

export default function App() {
  const [screen, setScreen] = useState('profile');
  const [selected, setSelected] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [tab, setTab] = useState('lesson');
  const [practiceTopic, setPracticeTopic] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loadError, setLoadError] = useState(false);

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

  let body;
  if (loadError) {
    body = <p className="text-xl text-red-600">పాఠ్య డేటా లోడ్ కాలేదు</p>;
  } else if (!chapter) {
    body = <p className="text-xl">లోడ్ అవుతోంది...</p>;
  } else if (screen === 'profile') {
    body = (
      <ProfileScreen
        onSelect={(p) => {
          setSelected(p);
          setScreen('pin');
        }}
        onParentView={() => setScreen('parentPin')}
      />
    );
  } else if (screen === 'pin') {
    body = (
      <PinPad
        name={selected.name}
        onSubmit={(pin) => {
          if (pin === selected.pin) {
            setCurrentProfile(selected);
            setTab('lesson');
            setScreen('home');
            return true;
          }
          return false;
        }}
        onCancel={() => setScreen('profile')}
      />
    );
  } else if (screen === 'parentPin') {
    body = (
      <PinPad
        name="తల్లిదండ్రులు / ఉపాధ్యాయులు"
        onSubmit={(pin) => {
          if (pin === PARENT_PIN) {
            setScreen('parent');
            return true;
          }
          return false;
        }}
        onCancel={() => setScreen('profile')}
      />
    );
  } else if (screen === 'parent') {
    body = <ParentView onExit={() => setScreen('profile')} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-4xl">{currentProfile.avatar}</span>
            <span className="text-2xl font-semibold">{currentProfile.name}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentProfile(null);
              setSelected(null);
              setPracticeTopic(null);
              setScreen('profile');
            }}
            className="min-h-[48px] px-3 bg-gray-200 rounded-xl text-lg"
          >
            ప్రొఫైల్ మార్చు
          </button>
        </div>

        <h1 className="text-2xl font-bold">{chapter.chapter}</h1>

        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setTab('lesson')}
            className={`min-h-[56px] text-xl rounded-xl ${
              tab === 'lesson' ? 'bg-violet-600 text-white' : 'bg-white'
            }`}
          >
            పాఠం
          </button>
          <button
            type="button"
            onClick={() => setTab('practice')}
            className={`min-h-[56px] text-xl rounded-xl ${
              tab === 'practice' ? 'bg-violet-600 text-white' : 'bg-white'
            }`}
          >
            అభ్యాసం
          </button>
          <button
            type="button"
            onClick={() => setTab('progress')}
            className={`min-h-[56px] text-xl rounded-xl ${
              tab === 'progress' ? 'bg-violet-600 text-white' : 'bg-white'
            }`}
          >
            పురోగతి
          </button>
        </div>

        {tab === 'lesson' ? (
          <LessonScreen chapter={chapter} profileId={currentProfile.id} />
        ) : tab === 'practice' ? (
          <>
            {practiceTopic && (
              <button
                type="button"
                onClick={() => setPracticeTopic(null)}
                className="min-h-[48px] self-start px-3 bg-gray-200 rounded-xl text-lg"
              >
                అన్ని అంశాలు
              </button>
            )}
            <PracticeScreen
              profile={currentProfile}
              questions={chapter.questions}
              onAttemptSaved={() => {}}
              topicFilter={practiceTopic || undefined}
            />
          </>
        ) : (
          <ProgressScreen
            profile={currentProfile}
            onPractice={(topic) => {
              setPracticeTopic(topic);
              setTab('practice');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <OfflineBadge />
      <div className="max-w-xl mx-auto min-h-screen p-4">{body}</div>
    </>
  );
}
