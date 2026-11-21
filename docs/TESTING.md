# Testing

No tests were executed while writing this document. The results below are as reported by the tester.

## Commands (Windows)

Run from the repository root:

```bat
npm.cmd run build
node --test src/lib/offlineQueue.test.mjs
python -m pytest backend/tests -q
node --check public/sw.js
```

## Latest Reported Results

These are tester-reported results, **not executed during this documentation step**.

| Check | Reported result |
| --- | --- |
| `npm.cmd run build` | Build successful |
| `node --test src/lib/offlineQueue.test.mjs` | 10 passed |
| `python -m pytest backend/tests -q` | 106 passed, 1 httpx deprecation warning |
| `node --check public/sw.js` | Not reported |

## Manual Browser and Device Checklist

Status: **PENDING**. None of these checks has been performed.

- [ ] Offline reload (PENDING)
- [ ] Offline answer submission (PENDING)
- [ ] Offline lesson completion (PENDING)
- [ ] Reconnection and sync (PENDING)
- [ ] Duplicate prevention (PENDING)
- [ ] Multiple student profiles (PENDING)
- [ ] Parent/student isolation (PENDING)
- [ ] Service-worker updates (PENDING)
- [ ] Android installation (PENDING)
- [ ] 360px responsive layout (PENDING)
- [ ] 430px responsive layout (PENDING)
