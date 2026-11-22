import { useState } from 'react';
import { AVATARS, createStudent, loginByPin, verifyStudentPin, getDeviceId } from '../lib/profiles.js';
import { errorKeyFor, setStudentSession } from '../lib/api.js';
import { useLang } from '../lib/i18n.js';
import PinPad from './PinPad.jsx';
import Button from './ui/Button.jsx';

// Small brand mark: a rounded primary square with a plus glyph. Decorative only.
function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-primary" aria-hidden="true">
      <rect x="0" y="0" width="48" height="48" rx="14" fill="currentColor" />
      <path d="M24 13v22M13 24h22" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

// First screen: PIN-only login (the server finds the student from the PIN).
// Adding a profile needs a 4-digit PIN entered twice. The browser only checks that the two entries match.
export default function ProfileScreen({ onEnter, onParentView }) {
  const { lang, t } = useLang();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].key);
  const [prefLang, setPrefLang] = useState(lang);
  const [formError, setFormError] = useState('');
  // Add-profile PIN steps: 'new' then 'confirm'
  const [pinStep, setPinStep] = useState('form');
  const [firstPin, setFirstPin] = useState('');
  // Changing this key remounts the login PIN pad, which clears the digits entered so far
  const [loginPadKey, setLoginPadKey] = useState(0);

  function startAdd() {
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

  // Login PIN: the server returns the student id and token for the matching student.
  // errorKeyFor maps 401 to pinWrong and 429 to pinLocked.
  async function submitLoginPin(pin) {
    try {
      const res = await loginByPin(pin, getDeviceId());
      setStudentSession(res.student_id, res.token);
      onEnter({
        id: res.student_id,
        name: res.display_name,
        avatar: AVATARS.find((a) => a.key === res.avatar)?.emoji ?? '🙂',
        preferredLanguage: res.preferred_language,
      });
      return null;
    } catch (err) {
      return errorKeyFor(err);
    }
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
        <form onSubmit={submitForm} className="mx-auto flex w-full max-w-sm flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            <BrandMark />
            <h2 className="text-center text-3xl font-bold text-ink">{t('addProfileTitle')}</h2>
          </div>

          <label className="flex flex-col gap-2 text-lg font-semibold text-ink">
            {t('nameLabel')}
            <input
              type="text"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              className="h-[52px] w-full rounded-lg border border-primary/25 bg-surface px-4 text-xl text-ink focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-ink">{t('avatarLabel')}</span>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-label={a.key}
                  aria-pressed={avatar === a.key}
                  onClick={() => setAvatar(a.key)}
                  className={`flex h-12 w-12 items-center justify-self-center rounded-lg border-2 bg-surface text-2xl transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                    avatar === a.key ? 'border-primary bg-primary/10' : 'border-primary/15'
                  }`}
                >
                  <span className="mx-auto">{a.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-ink">{t('langLabel')}</span>
            <div role="group" className="grid grid-cols-2 gap-2 rounded-lg bg-primary/5 p-1">
              {['te', 'en'].map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={prefLang === code}
                  onClick={() => setPrefLang(code)}
                  className={`min-h-[48px] rounded-md border-2 text-lg font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                    prefLang === code
                      ? 'border-primary bg-surface text-primary-dark'
                      : 'border-transparent text-muted'
                  }`}
                >
                  {code === 'te' ? 'తెలుగు' : 'English'}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-lg font-semibold text-danger" aria-live="polite">
              {t(formError)}
            </p>
          )}

          <Button type="submit" size="lg" className="h-[52px] w-full">
            {t('saveProfile')}
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)} className="h-[52px] w-full">
            {t('cancel')}
          </Button>
        </form>
      );
    }

    return (
      <div className="mx-auto w-full max-w-sm">
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
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        <BrandMark />
      </div>

      <PinPad
        key={loginPadKey}
        title={t('whoLearning')}
        onSubmit={submitLoginPin}
        onCancel={() => setLoginPadKey((k) => k + 1)}
      />

      <div className="flex flex-col gap-3 border-t border-primary/15 pt-5">
        <Button variant="secondary" onClick={startAdd} className="h-[52px] w-full">
          {t('addProfile')}
        </Button>

        <Button variant="ghost" onClick={() => onParentView()} className="h-[52px] w-full">
          <span aria-hidden="true">👨‍👩‍👧 </span>
          {t('parentView')}
        </Button>
      </div>
    </div>
  );
}

