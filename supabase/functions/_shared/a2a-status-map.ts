import type { Status } from './types.ts'

/**
 * A2A protocol task lifecycle states (Draft v1.0).
 * WritBase only maps the subset it persists — wire-only sentinels
 * like 'unknown' are excluded.
 */
export type A2ATaskStatus =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'

const writBaseToA2A: Record<Status, A2ATaskStatus> = {
  todo: 'submitted',
  in_progress: 'working',
  blocked: 'input-required',
  done: 'completed',
  failed: 'failed',
  cancelled: 'canceled',
}

const a2aToWritBase: Record<A2ATaskStatus, Status> = {
  submitted: 'todo',
  working: 'in_progress',
  'input-required': 'blocked',
  completed: 'done',
  failed: 'failed',
  canceled: 'cancelled',
}

export function toA2AStatus(status: Status): A2ATaskStatus {
  return writBaseToA2A[status]
}

export function fromA2AStatus(a2aStatus: A2ATaskStatus): Status {
  return a2aToWritBase[a2aStatus]
}
