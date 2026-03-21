'use client';

import { useServiceWorker } from '@/lib/hooks/use-service-worker';

export function SwRegister() {
  useServiceWorker();
  return null;
}
