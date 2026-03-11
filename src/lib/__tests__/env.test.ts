import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('env validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('validates correct environment variables', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.test');

    const { env } = await import('@/lib/env');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('eyJhbGciOiJIUzI1NiJ9.test');
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'some-key');

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing or invalid environment variables',
    );
  });

  it('throws when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing or invalid environment variables',
    );
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is not a valid URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'some-key');

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing or invalid environment variables',
    );
  });

  it('throws when both variables are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing or invalid environment variables',
    );
  });
});
