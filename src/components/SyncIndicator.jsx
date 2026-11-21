import { useEffect, useState } from 'react';
import { getUnsyncedAttempts } from '../lib/db.js';

// Shows how many answers are still waiting to reach the server
export default function SyncIndicator() {
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
  return (
    <div
      className={`self-start rounded-full px-4 py-2 text-base font-semibold ${
        done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {done ? 'సమకాలీకరించబడింది ✓' : `సమకాలీకరణ పెండింగ్: ${pending}`}
    </div>
  );
}
