import { useEffect, useState } from 'react';

export default function OfflineBadge() {
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

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-50 bg-yellow-300 text-gray-900 text-xl text-center py-3 px-4 font-semibold"
    >
      ఆఫ్‌లైన్ — ఇంటర్నెట్ లేదు
    </div>
  );
}
