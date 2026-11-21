import { useEffect, useState } from 'react';
import { getUnsyncedAttempts } from '../lib/db.js';
import { useLang } from '../lib/i18n.js';

// Shows how many answers are still waiting to reach the server
export default function SyncIndicator() {
  const { t } = useLang();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const list = await getUnsyncedAttempts();
      if (!cancelled) setPending(list.length);
    }
    refresh();
    // Poll, and also refresh at once when the connection returns
    const timer = setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, []);

  const done = pending === 0;
  // Pill with a coloured dot: green when all is synced, amber while answers are pending
  return (
    <div
      className={`self-start inline-flex items-center gap-2 rounded-full px-3 py-1 text-base font-semibold ${
        done ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-3 h-3 rounded-full ${done ? 'bg-green-500' : 'bg-amber-500'}`}
      />
      {done ? t('syncDone') : t('syncPending', { count: pending })}
    </div>
  );
}
