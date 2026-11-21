import { useEffect, useState } from 'react';
import { AVATARS, createStudent, listStudents, verifyStudentPin } from '../lib/profiles.js';
import { errorKeyFor } from '../lib/api.js';
import { useLang } from '../lib/i18n.js';
import PinPad from './PinPad.jsx';

const MAX_PROFILES = 3;

// Profile picker from the backend, with loading, empty and error states.
// Adding a profile needs a 4-digit PIN entered twice. The browser only checks that the two entries match.
export default function ProfileScreen({ onSelect, onEnter, onParentView }) {
  const { lang, t } = useLang();
  const [profiles, setProfiles] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].key);
  const [prefLang, setPrefLang] = useState(lang);
  const [formError, setFormError] = useState('');
  // Add-profile PIN steps: 'new' then 'confirm'
  const [pinStep, setPinStep] = useState('form');
  const [firstPin, setFirstPin] = useState('');

  function load() {
    setLoadError(false);
    setProfiles(null);
    listStudents()
      .then(setProfiles)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    load();
  }, []);

  function startAdd() {
    if (!profiles || profiles.length >= MAX_PROFILES) return;
    setFormError('');
    setName('');
    setAvatar(AVATARS[0].key);
    setPrefLang(lang);
    setPinStep('form');
    setAdding(true);
  }

  function submitForm(e) {
    e.preventDefault();
    if (name.trim() === '') {
      setFormError('nameRequired');
      return;
    }
    setFormError('');
    setPinStep('new');
  }

  // Second PIN entry: the server gets the PIN only after both entries match
  async function confirmPin(pin) {
    if (pin !== firstPin) return 'pinMismatch';
    try {
      const profile = await createStudent({
        displayName: name.trim(),
        avatar,
        preferredLanguage: prefLang,
        pin,
      });
      await verifyStudentPin(profile.id, pin);
      onEnter(profile);
      return null;
    } catch (err) {
      // Shown inside the PIN pad (for example maxProfiles on 409)
      return errorKeyFor(err);
    }
  }

  if (adding) {
    if (pinStep === 'form') {
      return (
        <form onSubmit={submitForm} className="flex flex-col gap-5">
          <h2 className="text-3xl font-bold">{t('addProfileTitle')}</h2>

          <label className="flex flex-col gap-2 text-lg font-semibold">
            {t('nameLabel')}
            <input
              type="text"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              className="text-xl min-h-[56px] w-full border-2 border-violet-200 focus:border-violet-500 focus:outline-none rounded-2xl px-4 bg-white"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold">{t('avatarLabel')}</span>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-label={a.key}
                  aria-pressed={avatar === a.key}
                  onClick={() => setAvatar(a.key)}
                  className={`min-h-[52px] rounded-xl text-2xl border-2 ${
                    avatar === a.key ? 'border-amber-500 bg-amber-50' : 'border-violet-100 bg-white'
                  }`}
                >
                  {a.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold">{t('langLabel')}</span>
            <div className="grid grid-cols-2 gap-2">
              {['te', 'en'].map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={prefLang === code}
                  onClick={() => setPrefLang(code)}
                  className={`min-h-[52px] rounded-xl text-lg font-semibold border-2 ${
                    prefLang === code ? 'border-amber-500 bg-amber-50' : 'border-violet-100 bg-white'
                  }`}
                >
                  {code === 'te' ? 'తెలుగు' : 'English'}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-xl font-semibold text-red-600" aria-live="polite">
              {t(formError)}
            </p>
          )}

          <button
            type="submit"
            className="min-h-[56px] w-full rounded-2xl bg-violet-600 text-white text-lg font-semibold shadow-md"
          >
            {t('saveProfile')}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="min-h-[56px] w-full rounded-2xl bg-white border-2 border-violet-600 text-violet-700 text-lg font-semibold"
          >
            {t('cancel')}
          </button>
        </form>
      );
    }

    return (
      <PinPad
        key={pinStep}
        title={t(pinStep === 'new' ? 'newPinTitle' : 'confirmPinTitle')}
        onSubmit={(pin) => {
          if (pinStep === 'new') {
            setFirstPin(pin);
            setPinStep('confirm');
            return Promise.resolve(null);
          }
          return confirmPin(pin);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  let list;
  if (loadError) {
    list = (
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-xl text-red-600">{t('profilesError')}</p>
        <button
          type="button"
          onClick={load}
          className="min-h-[52px] w-full rounded-2xl bg-violet-600 text-white text-lg font-semibold"
        >
          {t('retry')}
        </button>
      </div>
    );
  } else if (profiles === null) {
    list = <p className="text-xl">{t('profilesLoading')}</p>;
  } else if (profiles.length === 0) {
    list = <p className="text-xl">{t('profilesEmpty')}</p>;
  } else {
    list = profiles.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onSelect(p)}
        className="card w-full min-h-[120px] flex items-center gap-4 rounded-2xl bg-white shadow-md p-4 text-left active:scale-95 transition"
      >
        {/* 72px circle with a soft violet background behind the avatar */}
        <span className="w-[72px] h-[72px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-4xl">
          {p.avatar}
        </span>
        <span className="flex-1 text-2xl font-bold">{p.name}</span>
        {/* Right chevron */}
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-violet-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    ));
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-3xl font-bold">👋 {t('whoLearning')}</h2>

      {list}

      {profiles && profiles.length < MAX_PROFILES && (
        <button
          type="button"
          onClick={startAdd}
          className="min-h-[56px] w-full rounded-2xl bg-amber-500 text-white text-lg font-semibold shadow-sm active:scale-95 transition"
        >
          {t('addProfile')}
        </button>
      )}

      <button
        type="button"
        onClick={() => onParentView()}
        className="min-h-[56px] w-full rounded-2xl bg-white border-2 border-violet-600 text-violet-700 text-lg font-semibold shadow-sm active:scale-95 transition"
      >
        <span aria-hidden="true">👨‍👩‍👧 </span>
        {t('parentView')}
      </button>
    </div>
  );
}
