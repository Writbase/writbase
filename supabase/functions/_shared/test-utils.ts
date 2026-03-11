import type { AgentContext, AgentPermission, AgentRole } from './types.ts'

/**
 * Chainable mock that mimics the Supabase PostgREST builder.
 * Configure responses with `setResponse()` before using.
 */
export class MockQueryBuilder {
  private response: { data: unknown; error: unknown } = { data: null, error: null }

  setResponse(data: unknown, error: unknown = null): this {
    this.response = { data, error }
    return this
  }

  from(_table: string): this { return this }
  select(_columns?: string): this { return this }
  insert(_data: unknown): this { return this }
  update(_data: unknown): this { return this }
  delete(): this { return this }
  upsert(_data: unknown, _opts?: unknown): this { return this }
  eq(_column: string, _value: unknown): this { return this }
  neq(_column: string, _value: unknown): this { return this }
  is(_column: string, _value: unknown): this { return this }
  in(_column: string, _values: unknown[]): this { return this }
  or(_filter: string): this { return this }
  order(_column: string, _opts?: unknown): this { return this }
  limit(_count: number): this { return this }
  range(_from: number, _to: number): this { return this }
  abortSignal(_signal: AbortSignal): this { return this }

  single(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve(this.response)
  }

  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve(this.response)
  }

  then(
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown
  ): Promise<unknown> {
    return Promise.resolve(this.response).then(resolve, reject)
  }

  rpc(_fn: string, _params?: unknown): this { return this }
}

/**
 * Create a mock SupabaseClient that returns the configured response.
 * Use `mockClient.setResponse(data)` to configure what queries return.
 */
export function createMockSupabaseClient(): MockQueryBuilder {
  return new MockQueryBuilder()
}

/**
 * Create a test AgentContext with sensible defaults.
 */
export function createTestContext(overrides: Omit<Partial<AgentContext>, 'permissions'> & { permissions?: Partial<AgentPermission>[] } = {}): AgentContext {
  const permissions = (overrides.permissions ?? []).map((p) => ({
    id: p.id ?? 'perm-1',
    projectId: p.projectId ?? 'proj-1',
    projectSlug: p.projectSlug ?? 'test-project',
    projectName: p.projectName ?? 'Test Project',
    departmentId: p.departmentId ?? null,
    departmentSlug: p.departmentSlug ?? null,
    departmentName: p.departmentName ?? null,
    canRead: p.canRead ?? true,
    canCreate: p.canCreate ?? true,
    canUpdate: p.canUpdate ?? true,
    isProjectArchived: p.isProjectArchived ?? false,
    isDepartmentArchived: p.isDepartmentArchived ?? null,
  }))

  return {
    keyId: overrides.keyId ?? 'test-key-id',
    name: overrides.name ?? 'test-agent',
    role: overrides.role ?? ('worker' as AgentRole),
    isActive: overrides.isActive ?? true,
    specialPrompt: overrides.specialPrompt ?? null,
    permissions,
  }
}
