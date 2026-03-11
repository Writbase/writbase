import { test } from '@playwright/test';

test.describe('Authentication', () => {
  test.skip('should show login page when not authenticated', async ({ page }) => {
    // Navigate to root and verify redirect to /login
  });

  test.skip('should login with valid credentials and redirect to /tasks', async ({ page }) => {
    // Fill email/password, submit, verify redirect
  });

  test.skip('should show error message with invalid credentials', async ({ page }) => {
    // Fill bad credentials, submit, verify error toast
  });

  test.skip('should sign out and redirect to login page', async ({ page }) => {
    // Authenticate, click Sign out, verify redirect to /login
  });

  test.skip('should protect dashboard routes when not authenticated', async ({ page }) => {
    // Attempt direct navigation to /tasks, /agent-keys, verify redirect
  });
});
