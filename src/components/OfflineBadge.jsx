import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.js';

// Top banner shown only while offline; hidden again as soon as the connection returns
export default function OfflineBadge() {
  const { t } = useLang();
  const [online, setOnline] = useState(navigator.onLine);

  // Track connectivity live so the banner appears/disappears without a reload
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  // Full-width on phones, capped and centred at the app's 480px width
  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-50 max-w-[480px] mx-auto rounded-b-2xl bg-amber-400 text-gray-900 text-lg text-center py-3 px-4 font-semibold shadow"
    >
      <span aria-hidden="true">📡</span> {t('offline')}
    </div>
  );
}
