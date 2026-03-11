import type { SupabaseClient } from '@supabase/supabase-js';

type ResponseConfig = { data: unknown; error: unknown };

/**
 * Chainable mock that mimics the Supabase PostgREST builder.
 * Tracks calls for assertions and returns configured responses.
 */
class MockBuilder {
  private responses: ResponseConfig[] = [];
  private responseIndex = 0;
  calls: { method: string; args: unknown[] }[] = [];

  /** Push a response to the queue. Each query pops the next one. */
  addResponse(data: unknown, error: unknown = null): this {
    this.responses.push({ data, error });
    return this;
  }

  private track(method: string, ...args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  private nextResponse(): ResponseConfig {
    if (this.responseIndex < this.responses.length) {
      return this.responses[this.responseIndex++];
    }
    return { data: null, error: null };
  }

  from(table: string): this {
    return this.track('from', table);
  }
  select(columns?: string): this {
    return this.track('select', columns);
  }
  insert(data: unknown): this {
    return this.track('insert', data);
  }
  update(data: unknown): this {
    return this.track('update', data);
  }
  delete(): this {
    return this.track('delete');
  }
  eq(col: string, val: unknown): this {
    return this.track('eq', col, val);
  }
  neq(col: string, val: unknown): this {
    return this.track('neq', col, val);
  }
  is(col: string, val: unknown): this {
    return this.track('is', col, val);
  }
  in(col: string, vals: unknown[]): this {
    return this.track('in', col, vals);
  }
  order(col: string, opts?: unknown): this {
    return this.track('order', col, opts);
  }
  range(from: number, to: number): this {
    return this.track('range', from, to);
  }
  limit(count: number): this {
    return this.track('limit', count);
  }

  rpc(fn: string, params?: unknown): this {
    return this.track('rpc', fn, params);
  }

  single(): Promise<ResponseConfig> {
    this.track('single');
    return Promise.resolve(this.nextResponse());
  }

  maybeSingle(): Promise<ResponseConfig> {
    this.track('maybeSingle');
    return Promise.resolve(this.nextResponse());
  }

  // biome-ignore lint/suspicious/noThenProperty: required to make MockBuilder thenable like Supabase PostgREST builder
  then(
    resolve: (value: ResponseConfig) => unknown,
    reject?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    return Promise.resolve(this.nextResponse()).then(resolve, reject);
  }
}

/**
 * Create a mock SupabaseClient for testing service functions.
 */
export function createMockSupabase(): MockBuilder & SupabaseClient {
  return new MockBuilder() as unknown as MockBuilder & SupabaseClient;
}
