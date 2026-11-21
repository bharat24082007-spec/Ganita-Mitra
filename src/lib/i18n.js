import React, { useContext } from 'react';

// Single source of UI text. Each key has a Telugu ('te') and English ('en') string.
// Tokens: {name} is replaced by vars.name in t(). Used tokens: pinEnter {name},
// topicPrefix {topic}, syncPending {count}. Math like x=2, y=3 stays English in both.
// Telugu is the default; the English text is written for a Class 9 student.
export const STRINGS = {
  loadError: { te: 'పాఠ్య డేటా లోడ్ కాలేదు', en: 'Lesson data did not load' },
  loading: { te: 'లోడ్ అవుతోంది...', en: 'Loading...' },
  parentGroup: { te: 'తల్లిదండ్రులు / ఉపాధ్యాయులు', en: 'Parents / Teachers' },
  parentView: { te: 'తల్లిదండ్రులు / ఉపాధ్యాయుల వీక్షణ', en: 'Parent / Teacher view' },
  switchProfile: { te: 'ప్రొఫైల్ మార్చు', en: 'Switch profile' },
  tabLesson: { te: 'పాఠం', en: 'Lesson' },
  tabPractice: { te: 'అభ్యాసం', en: 'Practice' },
  tabProgress: { te: 'పురోగతి', en: 'Progress' },
  allTopics: { te: 'అన్ని అంశాలు', en: 'All topics' },
  offline: { te: 'ఆఫ్‌లైన్ — ఇంటర్నెట్ లేదు', en: 'Offline — no internet' },
  example: { te: 'ఉదాహరణ', en: 'Example' },
  tutorUnavailable: { te: 'ట్యూటర్ ప్రస్తుతం అందుబాటులో లేదు', en: 'The tutor is not available right now' },
  needInternetTutor: { te: 'ఇంటర్నెట్ అవసరం — ట్యూటర్ పనిచేయదు', en: 'Internet needed — the tutor does not work offline' },
  pinWrong: { te: 'PIN తప్పు', en: 'Wrong PIN' },
  pinEnter: { te: '{name} కోసం PIN నమోదు చేయండి', en: 'Enter the PIN for {name}' },
  cancel: { te: 'రద్దు', en: 'Cancel' },
  whoLearning: { te: 'ఈరోజు ఎవరు నేర్చుకుంటున్నారు?', en: 'Who is learning today?' },
  lastActivity: { te: 'చివరి కార్యాచరణ:', en: 'Last activity:' },
  noActivity: { te: 'ఇంకా కార్యాచరణ లేదు', en: 'No activity yet' },
  accuracy: { te: 'ఖచ్చితత్వం', en: 'Accuracy' },
  weakTopics: { te: 'బలహీన అంశాలు', en: 'Weak topics' },
  none: { te: 'లేవు', en: 'None' },
  back: { te: 'వెనుకకు', en: 'Back' },
  writeAnswer: { te: 'జవాబు రాయండి', en: 'Write an answer' },
  correct: { te: 'సరైనది!', en: 'Correct!' },
  wrongTryAgain: { te: 'తప్పు, మళ్లీ ప్రయత్నించు', en: 'Wrong, try again' },
  noQuestionsTopic: { te: 'ఈ అంశంలో ప్రశ్నలు లేవు', en: 'No questions in this topic' },
  topicPrefix: { te: 'అంశం: {topic}', en: 'Topic: {topic}' },
  submit: { te: 'సమర్పించు', en: 'Submit' },
  hint1: { te: 'సూచన 1', en: 'Hint 1' },
  hint2: { te: 'సూచన 2', en: 'Hint 2' },
  showSolution: { te: 'పూర్తి పరిష్కారం చూపించు', en: 'Show full solution' },
  solution: { te: 'పరిష్కారం', en: 'Solution' },
  nextQuestion: { te: 'తరువాతి ప్రశ్న', en: 'Next question' },
  answerFormatHint: {
    te: 'ఉదాహరణ: x=2, y=3 (x, y విలువలను కామాతో రాయండి)',
    en: 'Example: x=2, y=3 (write the x and y values separated by a comma)',
  },
  myProgress: { te: 'నా పురోగతి', en: 'My progress' },
  lessonsDone: { te: 'పూర్తి చేసిన పాఠాలు', en: 'Lessons completed' },
  questionsTried: { te: 'అభ్యసించిన ప్రశ్నలు', en: 'Questions attempted' },
  streak: { te: 'వరుస రోజులు', en: 'Day streak' },
  daysUnit: { te: ' రోజులు', en: ' days' },
  noWeakTopics: { te: 'ఇంకా బలహీన అంశాలు లేవు', en: 'No weak topics yet' },
  practiceTopic: { te: 'ఈ అంశం ప్రాక్టీస్ చేయండి', en: 'Practice this topic' },
  syncDone: { te: 'సమకాలీకరించబడింది ✓', en: 'Synced ✓' },
  syncPending: { te: 'సమకాలీకరణ పెండింగ్: {count}', en: 'Sync pending: {count}' },
  askDoubt: { te: 'ప్రశ్న అడగండి', en: 'Ask a question' },
  tutorNeedsNet: {
    te: 'ట్యూటర్ పనిచేయడానికి ఇంటర్నెట్ అవసరం. పాఠం మరియు అభ్యాసం ఆఫ్‌లైన్‌లో పనిచేస్తాయి.',
    en: 'The tutor needs internet. Lessons and practice work offline.',
  },
  thinking: { te: 'ఆలోచిస్తోంది...', en: 'Thinking...' },
  doubtPlaceholder: { te: 'మీ సందేహం రాయండి', en: 'Type your doubt' },
  send: { te: 'పంపు', en: 'Send' },
  stopVoice: { te: 'ఆపు', en: 'Stop' },
  speakVoice: { te: '🎤 మాట్లాడండి', en: '🎤 Speak' },
  markDone: { te: 'పూర్తయింది గుర్తించండి', en: 'Mark as done' },
  lessonDone: { te: 'పూర్తయింది ✓', en: 'Completed ✓' },
  questionCount: { te: 'ప్రశ్న {n} / {m}', en: 'Question {n} of {m}' },
  tutorTitle: { te: 'మిత్ర గురువు', en: 'Mitra Teacher' },
  tutorIntro: { te: 'ఏ సందేహమైనా అడగండి!', en: 'Ask any doubt!' },
  sendBtn: { te: 'పంపు', en: 'Send' },
  micBtn: { te: 'మాట్లాడండి', en: 'Speak' },
  stopBtn: { te: 'ఆపు', en: 'Stop' },
  correctMsg: { te: 'సరైనది!', en: 'Correct!' },
  wrongMsg: { te: 'తప్పు, మళ్లీ ప్రయత్నించు', en: 'Wrong, try again' },
  progressTitle: { te: 'నా పురోగతి', en: 'My progress' },
  parentTitle: { te: 'తల్లిదండ్రులు / ఉపాధ్యాయుల వీక్షణ', en: 'Parent / Teacher view' },
  accuracyLabel: { te: 'ఖచ్చితత్వం', en: 'Accuracy' },
  streakLabel: { te: 'వరుస రోజులు', en: 'Day streak' },
  lessonsLabel: { te: 'పూర్తి చేసిన పాఠాలు', en: 'Lessons completed' },
  questionsLabel: { te: 'అభ్యసించిన ప్రశ్నలు', en: 'Questions attempted' },
  days: { te: 'రోజులు', en: 'days' },
  pinLocked: { te: 'చాలా సార్లు తప్పు PIN. కొంత సేపు ఆగి మళ్లీ ప్రయత్నించండి', en: 'Too many wrong attempts. Wait a while and try again.' },
  networkError: { te: 'ఇంటర్నెట్ కనెక్షన్ లేదు. మళ్లీ ప్రయత్నించండి', en: 'No internet connection. Try again.' },
  genericError: { te: 'ఏదో తప్పు జరిగింది. మళ్లీ ప్రయత్నించండి', en: 'Something went wrong. Try again.' },
  serverUnavailable: { te: 'సర్వర్ ప్రస్తుతం అందుబాటులో లేదు', en: 'The server is not available right now' },
  profileMissing: { te: 'ప్రొఫైల్ కనబడలేదు', en: 'Profile not found' },
  profilesLoading: { te: 'ప్రొఫైళ్లు లోడ్ అవుతున్నాయి...', en: 'Loading profiles...' },
  profilesEmpty: { te: 'ఇంకా ప్రొఫైల్ లేదు. కొత్త ప్రొఫైల్ జోడించండి.', en: 'No profiles yet. Add a new profile.' },
  profilesError: { te: 'ప్రొఫైళ్లు లోడ్ కాలేదు', en: 'Profiles did not load' },
  retry: { te: 'మళ్లీ ప్రయత్నించు', en: 'Try again' },
  addProfile: { te: '+ కొత్త ప్రొఫైల్ జోడించు', en: '+ Add profile' },
  addProfileTitle: { te: 'కొత్త ప్రొఫైల్', en: 'New profile' },
  nameLabel: { te: 'పేరు', en: 'Name' },
  avatarLabel: { te: 'అవతార్', en: 'Avatar' },
  langLabel: { te: 'భాష', en: 'Language' },
  saveProfile: { te: 'ప్రొఫైల్ సృష్టించు', en: 'Create profile' },
  nameRequired: { te: 'పేరు రాయండి', en: 'Enter a name' },
  newPinTitle: { te: 'కొత్త 4 అంకెల PIN ఎంచుకోండి', en: 'Choose a 4-digit PIN' },
  confirmPinTitle: { te: 'PIN మళ్లీ నమోదు చేయండి', en: 'Enter the PIN again' },
  pinMismatch: { te: 'PIN సరిపోలలేదు. మళ్లీ ప్రయత్నించండి', en: 'PINs do not match. Try again.' },
  maxProfiles: { te: 'ఒక పరికరంలో గరిష్టంగా 3 ప్రొఫైళ్లు మాత్రమే', en: 'Maximum 3 profiles on this device' },
  tutorRateLimited: { te: 'ఇప్పుడు ప్రశ్నలు ఎక్కువయ్యాయి. కొంత సేపు ఆగి అడగండి', en: 'Too many questions right now. Wait a little and ask again.' },
  tutorUpstream: { te: 'ట్యూటర్ సేవలో సమస్య. మళ్లీ ప్రయత్నించండి', en: 'The tutor service had a problem. Try again.' },
  tutorNotConfigured: { te: 'ట్యూటర్ ఇంకా సెటప్ కాలేదు', en: 'The tutor is not set up yet.' },
  tutorSwitchLang: { te: 'English', en: 'తెలుగు' },

  lessonSaveFailed: { te: 'సేవ్ కాలేదు. ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి', en: 'Could not save. Check the internet and try again.' },
  questionsLoadFailed: { te: 'ప్రశ్నలు లోడ్ కాలేదు', en: 'Questions did not load' },
  checkFailed: { te: 'తనిఖీ జరగలేదు. మళ్లీ ప్రయత్నించండి', en: 'Could not check the answer. Try again.' },
  mistakeLabel: { te: 'సాధారణ తప్పు', en: 'Common mistake' },
  hintLabel: { te: 'సూచన', en: 'Hint' },
  progressLoadFailed: { te: 'పురోగతి లోడ్ కాలేదు', en: 'Progress did not load' },
  parentSetupTitle: { te: 'తల్లిదండ్రుల ఖాతా సెటప్', en: 'Set up the parent / teacher account' },
  parentSetupHint: { te: 'ఒకసారి మాత్రమే. సెటప్ కోడ్ మరియు 4 అంకెల PIN నమోదు చేయండి', en: 'One-time setup. Enter the setup code and a 4-digit PIN.' },
  setupCode: { te: 'సెటప్ కోడ్', en: 'Setup code' },
  setupButton: { te: 'సెటప్ చేయి', en: 'Set up' },
  setupDone: { te: 'సెటప్ పూర్తయింది. ఇప్పుడు లాగిన్ అవ్వండి', en: 'Setup complete. Now log in.' },
  setupConflict: { te: 'ఖాతా ఇప్పటికే సెటప్ అయింది', en: 'The account is already set up' },
  setupInvalidCode: { te: 'సెటప్ కోడ్ తప్పు', en: 'Wrong setup code' },
  setupNotConfigured: { te: 'సర్వర్‌లో సెటప్ కాన్ఫిగర్ కాలేదు', en: 'Setup is not configured on the server' },
  parentLoginTitle: { te: 'తల్లిదండ్రులు / ఉపాధ్యాయుల లాగిన్', en: 'Parent / teacher login' },
  parentNotSetup: { te: 'ఖాతా ఇంకా సెటప్ కాలేదు', en: 'The account is not set up yet' },
  parentLogout: { te: 'లాగ్ అవుట్', en: 'Log out' },
  parentSessionExpired: { te: 'మళ్లీ లాగిన్ అవ్వండి', en: 'Please log in again' },
  parentForbidden: { te: 'ఈ పేజీకి తల్లిదండ్రుల అనుమతి అవసరం', en: 'Parent access is required' },
  studentsList: { te: 'విద్యార్థులు', en: 'Students' },
  noStudents: { te: 'ఇంకా విద్యార్థులు లేరు', en: 'No students yet' },
  viewReport: { te: 'నివేదిక చూడండి', en: 'View report' },
  recommendations: { te: 'సిఫార్సులు', en: 'Recommendations' },
  reportLoadFailed: { te: 'నివేదిక లోడ్ కాలేదు', en: 'Report did not load' },
  questionsAttemptedCount: { te: 'ప్రయత్నించిన ప్రశ్నలు: {n}', en: 'Questions attempted: {n}' },
  correctCount: { te: 'సరైనవి: {n}', en: 'Correct: {n}' },
  noTopicsYet: { te: 'ఇంకా అంశాల డేటా లేదు', en: 'No topic data yet' },


};

// Default language for new users and for the profile screen before any choice is saved.
export const DEFAULT_LANG = 'te';

// Looks up a string for a language, falling back to Telugu, then to the key itself.
// vars fills {name} tokens; tokens without a value are left as they are.
export function t(lang, key, vars) {
  let s = STRINGS[key]?.[lang] ?? STRINGS[key]?.te ?? key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      s = s.split('{' + name + '}').join(vars[name]);
    }
  }
  return s;
}

// Reads a question field that may be {te, en} (new data) or a plain string (old data).
export function loc(field, lang) {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') return field[lang] ?? field.te ?? '';
  return '';
}

// Returns the stable Telugu topic key. Attempts store this key, so it must never change with language.
export function topicKey(question) {
  const topic = question.topic;
  return topic && typeof topic === 'object' ? topic.te : topic;
}

// Shows a topic name in the chosen language; falls back to the stored key if no question matches.
export function topicLabel(questions, key, lang) {
  const question = questions.find((q) => topicKey(q) === key);
  return question ? loc(question.topic, lang) : key;
}

// Mistake codes sent by POST /check (mistake_hint) mapped to bilingual text. Raw codes are never shown.
export const MISTAKE_HINTS = {
  sign_of_constant: {
    te: 'స్థిర పదం c యొక్క గుర్తును తనిఖీ చేయండి',
    en: 'Check the sign of the constant term c.',
  },
  sign_of_coefficient: {
    te: 'y గుణకం (b) యొక్క గుర్తును తనిఖీ చేయండి',
    en: 'Check the sign of the coefficient of y (b).',
  },
};

// Returns the text for a mistake code in the chosen language, or '' for unknown codes.
export function mistakeHintFor(code, lang) {
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(MISTAKE_HINTS, code)) return '';
  const entry = MISTAKE_HINTS[code];
  return entry[lang] ?? entry.te;
}

// Topic labels for the backend topic ids returned by GET /progress and the parent report.
export const TOPIC_LABELS = {
  standard_form: { te: 'ప్రామాణిక రూపం', en: 'Standard form' },
  coefficients: { te: 'గుణకాలు', en: 'Coefficients' },
  solutions: { te: 'పరిష్కారాలు', en: 'Solutions' },
  ordered_pairs: { te: 'క్రమయుగ్మాలు', en: 'Ordered pairs' },
  graphs: { te: 'ఆలేఖనాలు', en: 'Graphs' },
  substitution: { te: 'ప్రతిక్షేపణ', en: 'Substitution' },
  elimination: { te: 'తొలగింపు', en: 'Elimination' },
  mixed: { te: 'మిశ్రమ', en: 'Mixed' },
};

// Returns the label for a backend topic id in the chosen language; falls back to the id when no label exists.
export function topicLabelFor(id, lang) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(TOPIC_LABELS, id)) return id;
  const entry = TOPIC_LABELS[id];
  return entry[lang] ?? entry.te;
}

// Holds the current language and setter so any screen can switch it without a reload.
export const LangContext = React.createContext({ lang: DEFAULT_LANG, setLang: () => {} });

// Hook for components: returns the current language, its setter, and a bound t(key, vars).
export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  return { lang, setLang, t: (key, vars) => t(lang, key, vars) };
}
