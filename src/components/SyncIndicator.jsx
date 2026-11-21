import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.js';
import { getSyncStatus, subscribeSyncStatus, triggerSync } from '../lib/sync.js';

// Shows the sync state. 'synced' is shown only when the sync engine reports it, never from the pending count alone.
export default function SyncIndicator() {
  const { t } = useLang();
  const [status, setStatus] = useState(getSyncStatus);

  useEffect(() => subscribeSyncStatus((next) => setStatus(next)), []);

  const { state, pending, lastSynced } = status;
  const hasPending = pending > 0;

  let tone = 'bg-amber-100 text-amber-900';
  let dot = 'bg-amber-500';
  let text = null;
  let retry = false;

  if (state === 'syncing') {
    text = t('syncInProgress');
  } else if (state === 'synced') {
    tone = 'bg-green-100 text-green-800';
    dot = 'bg-green-500';
    text = t('syncDone');
  } else if ((state === 'failed' || state === 'offline') && hasPending) {
    tone = 'bg-red-100 text-red-800';
    dot = 'bg-red-500';
    text = t('syncFailedRetained');
    retry = true;
  } else if (hasPending) {
    text = t('syncPendingCount', { count: pending });
  }

  if (!text && !lastSynced) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      {text && (
        <div
          role="status"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-base font-semibold ${tone}`}
        >
          <span aria-hidden="true" className={`w-3 h-3 rounded-full ${dot}`} />
          {text}
        </div>
      )}
      {lastSynced && (
        <p className="text-sm text-gray-600">
          {t('lastSynced', { time: new Date(lastSynced).toLocaleTimeString() })}
        </p>
      )}
      {retry && (
        <button
          type="button"
          onClick={() => triggerSync()}
          className="min-h-[44px] px-4 bg-violet-50 text-violet-700 text-base rounded-xl font-semibold"
        >
          {t('syncRetry')}
        </button>
      )}
    </div>
  );
}
