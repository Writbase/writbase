import { toast } from 'sonner';
import { createTaskAction, updateTaskAction } from '@/app/(dashboard)/actions/task-actions';
import {
  getAllMutations,
  getPendingMutations,
  removeMutation,
  updateMutationStatus,
} from './mutation-queue';

export async function syncPendingMutations(): Promise<{
  synced: number;
  failed: number;
  conflicts: number;
}> {
  const pending = await getPendingMutations();
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  for (const mutation of pending) {
    await updateMutationStatus(mutation.id, 'syncing');

    try {
      if (mutation.type === 'create_task') {
        const formData = new FormData();
        for (const [key, val] of Object.entries(mutation.payload)) {
          if (val != null) {
            formData.set(
              key,
              typeof val === 'object'
                ? JSON.stringify(val)
                : String(val as string | number | boolean),
            );
          }
        }
        const result = await createTaskAction(formData);
        if (result.success) {
          await removeMutation(mutation.id);
          synced++;
        } else {
          await updateMutationStatus(mutation.id, 'failed');
          failed++;
        }
      } else {
        const result = await updateTaskAction(
          mutation.payload as Parameters<typeof updateTaskAction>[0],
        );
        if (result.success) {
          await removeMutation(mutation.id);
          synced++;
        } else if (result.code === 'version_conflict') {
          await updateMutationStatus(mutation.id, 'conflict');
          conflicts++;
        } else {
          await updateMutationStatus(mutation.id, 'failed');
          failed++;
        }
      }
    } catch {
      await updateMutationStatus(mutation.id, 'failed');
      failed++;
    }
  }

  if (synced > 0) toast.success(`Synced ${synced} offline change${synced > 1 ? 's' : ''}`);
  if (conflicts > 0)
    toast.warning(`${conflicts} change${conflicts > 1 ? 's' : ''} had conflicts (discarded)`);
  if (failed > 0) toast.error(`${failed} change${failed > 1 ? 's' : ''} failed to sync`);

  // Clean up conflicts and failed mutations (discard for MVP)
  const allMutations = await getAllMutations();
  for (const m of allMutations) {
    if (m.status === 'conflict' || m.status === 'failed') {
      await removeMutation(m.id);
    }
  }

  return { synced, failed, conflicts };
}
