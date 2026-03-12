export interface WritBaseError {
  code: string
  message: string
  recovery?: string
  fields?: Record<string, string>
  current_version?: number
  retry_after?: number
  request_id?: string
}

export const ErrorCodes = {
  UNAUTHORIZED: 'unauthorized_agent_key',
  INACTIVE_KEY: 'inactive_agent_key',
  SCOPE_NOT_ALLOWED: 'scope_not_allowed',
  INVALID_PROJECT: 'invalid_project',
  INVALID_DEPARTMENT: 'invalid_department',
  TASK_NOT_FOUND: 'task_not_found',
  UPDATE_NOT_ALLOWED: 'update_not_allowed',
  VALIDATION_ERROR: 'validation_error',
  VERSION_CONFLICT: 'version_conflict',
  RATE_LIMITED: 'rate_limited',
  INSUFFICIENT_MANAGER_SCOPE: 'insufficient_manager_scope',
  SELF_MODIFICATION_DENIED: 'self_modification_denied',
  INVALID_ASSIGNEE: 'invalid_assignee',
  CIRCULAR_DELEGATION: 'circular_delegation',
  DELEGATION_DEPTH_EXCEEDED: 'delegation_depth_exceeded',
  ASSIGN_NOT_ALLOWED: 'assign_not_allowed',
  INTERNAL_ERROR: 'internal_error',
} as const

export function unauthorizedError(): WritBaseError {
  return {
    code: ErrorCodes.UNAUTHORIZED,
    message: 'Invalid or missing agent key.',
    recovery: 'Provide a valid agent key in the Authorization header as "Bearer wb_<key_id>_<secret>".',
  }
}

export function inactiveKeyError(): WritBaseError {
  return {
    code: ErrorCodes.INACTIVE_KEY,
    message: 'This agent key has been deactivated.',
    recovery: 'Contact an admin to reactivate the key or provision a new one.',
  }
}

export function scopeNotAllowedError(project: string, action: string): WritBaseError {
  return {
    code: ErrorCodes.SCOPE_NOT_ALLOWED,
    message: `Agent does not have "${action}" permission for project "${project}".`,
    recovery: 'Request the needed permission from an admin via the dashboard.',
  }
}

export function invalidProjectError(project: string): WritBaseError {
  return {
    code: ErrorCodes.INVALID_PROJECT,
    message: `Project "${project}" does not exist or is archived.`,
    recovery: 'Verify the project slug and ensure it is not archived.',
  }
}

export function invalidDepartmentError(department: string): WritBaseError {
  return {
    code: ErrorCodes.INVALID_DEPARTMENT,
    message: `Department "${department}" does not exist or is archived.`,
    recovery: 'Verify the department slug and ensure it is not archived.',
  }
}

export function taskNotFoundError(taskId: string): WritBaseError {
  return {
    code: ErrorCodes.TASK_NOT_FOUND,
    message: `Task "${taskId}" was not found.`,
    recovery: 'Verify the task ID is correct and that you have read access to its project.',
  }
}

export function updateNotAllowedError(reason: string): WritBaseError {
  return {
    code: ErrorCodes.UPDATE_NOT_ALLOWED,
    message: `Update not allowed: ${reason}`,
    recovery: 'Check agent permissions and task ownership rules.',
  }
}

export function validationError(fields: Record<string, string>): WritBaseError {
  return {
    code: ErrorCodes.VALIDATION_ERROR,
    message: 'One or more fields failed validation.',
    recovery: 'Fix the listed fields and retry.',
    fields,
  }
}

export function versionConflictError(currentVersion: number): WritBaseError {
  return {
    code: ErrorCodes.VERSION_CONFLICT,
    message: 'The task was modified since you last read it.',
    recovery: 'Re-fetch the task to get the current version, then retry your update with the new version number.',
    current_version: currentVersion,
  }
}

export function rateLimitedError(retryAfter: number): WritBaseError {
  return {
    code: ErrorCodes.RATE_LIMITED,
    message: 'Rate limit exceeded.',
    recovery: 'Wait and retry after the indicated time.',
    retry_after: retryAfter,
  }
}

export function insufficientManagerScopeError(): WritBaseError {
  return {
    code: ErrorCodes.INSUFFICIENT_MANAGER_SCOPE,
    message: 'This action requires manager role.',
    recovery: 'Use a manager-level agent key to perform this action.',
  }
}

export function selfModificationDeniedError(): WritBaseError {
  return {
    code: ErrorCodes.SELF_MODIFICATION_DENIED,
    message: 'An agent cannot modify its own key.',
    recovery: 'Ask a different agent or a human admin to make this change.',
  }
}

export function invalidAssigneeError(assignee: string): WritBaseError {
  return {
    code: ErrorCodes.INVALID_ASSIGNEE,
    message: `Agent "${assignee}" does not exist, is inactive, or has no permissions in this project.`,
    recovery: 'Verify the agent key ID or name is correct and the agent is active with project access.',
  }
}

export function circularDelegationError(): WritBaseError {
  return {
    code: ErrorCodes.CIRCULAR_DELEGATION,
    message: 'This agent has already been in the delegation chain for this task.',
    recovery: 'Assign the task to a different agent that has not previously handled it.',
  }
}

export function delegationDepthExceededError(): WritBaseError {
  return {
    code: ErrorCodes.DELEGATION_DEPTH_EXCEEDED,
    message: 'Maximum delegation depth (3) reached for this task.',
    recovery: 'This task has been reassigned too many times. Complete it directly or create a new task.',
  }
}

export function assignNotAllowedError(project: string): WritBaseError {
  return {
    code: ErrorCodes.ASSIGN_NOT_ALLOWED,
    message: `Agent does not have "assign" permission for project "${project}".`,
    recovery: 'Request the can_assign permission from an admin via the dashboard.',
  }
}

export function internalError(message: string): WritBaseError {
  return {
    code: ErrorCodes.INTERNAL_ERROR,
    message,
  }
}

/**
 * Format a WritBaseError (or ad-hoc error object) as an MCP tool error response.
 */
export function mcpError(error: WritBaseError) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(error) }],
    isError: true,
  }
}
