'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { getMutationCount } from '@/lib/offline/mutation-queue';
import { syncPendingMutations } from '@/lib/offline/sync';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const checkPending = useCallback(async () => {
    try {
      const count = await getMutationCount();
      setPendingCount(count);
    } catch {
      /* IndexedDB may not be available */
    }
  }, []);

  // Poll pending count: on mount and every 5 seconds when offline
  useEffect(() => {
    // Schedule initial check in next microtask to avoid sync setState in effect
    const timeout = setTimeout(() => {
      void checkPending();
    }, 0);
    if (!isOnline) {
      const interval = setInterval(() => {
        void checkPending();
      }, 5000);
      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    }
    return () => {
      clearTimeout(timeout);
    };
  }, [isOnline, checkPending]);

  // Auto-sync when coming back online (via event handler, not effect setState)
  useEffect(() => {
    function handleOnline() {
      if (syncingRef.current || pendingCount === 0) return;
      syncingRef.current = true;
      setSyncing(true);
      syncPendingMutations()
        .then(() => {
          setPendingCount(0);
          setSyncing(false);
          syncingRef.current = false;
        })
        .catch(() => {
          setSyncing(false);
          syncingRef.current = false;
        });
    }

    if (isOnline && pendingCount > 0 && !syncingRef.current) {
      handleOnline();
    }

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [isOnline, pendingCount]);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`px-4 py-1.5 text-center text-xs font-medium ${
        !isOnline
          ? 'bg-amber-500 text-amber-950'
          : syncing
            ? 'bg-blue-500 text-white'
            : 'bg-amber-500 text-amber-950'
      }`}
    >
      {!isOnline
        ? `You're offline${pendingCount > 0 ? ` · ${pendingCount} pending change${pendingCount > 1 ? 's' : ''}` : ''}`
        : syncing
          ? 'Syncing changes...'
          : `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`}
    </div>
  );
}
