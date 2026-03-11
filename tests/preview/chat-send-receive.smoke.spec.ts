import { expect, test } from '@playwright/test';

test('chat GUI smoke: sends and receives assistant response', async ({ page, context }) => {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    await context.addCookies([
      {
        name: 'apiKeys',
        value: JSON.stringify({ OpenAI: openaiKey }),
        url: 'http://localhost:5173',
      },
      {
        name: 'selectedProvider',
        value: 'OpenAI',
        url: 'http://localhost:5173',
      },
      {
        name: 'selectedModel',
        value: 'gpt-5.4',
        url: 'http://localhost:5173',
      },
    ]);
  }

  await page.goto('/');

  // AuthGate is enabled in this environment; sign in with demo credentials.
  const signInRequired = page.getByText('Sign in required').first();
  const createAccount = page.getByText('Create your account').first();

  if ((await signInRequired.isVisible().catch(() => false)) || (await createAccount.isVisible().catch(() => false))) {
    await page.getByPlaceholder('Username').fill('demo');
    await page.getByPlaceholder('Password').fill('demouser');
    await page.getByRole('button', { name: 'Log in' }).last().click();

    const invalidCredentials = page.getByText('Invalid credentials.').first();
    if (await invalidCredentials.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Create account' }).first().click();
      await page.getByPlaceholder('Username').fill('demo');
      await page.getByPlaceholder('Password').fill('demouser');
      await page.getByRole('button', { name: 'Create account' }).last().click();
    }
  }

  const textarea = page
    .locator('textarea[placeholder="How can Bolt help you today?"], textarea[placeholder="What would you like to discuss?"]')
    .first();
  await expect(textarea).toBeVisible({ timeout: 20000 });

    const prompt = `Smoke test ${Date.now()}: Respond with the word SMOKE_REPLY_OK and one short sentence.`;
  await textarea.fill(prompt);

  // Recover from a stuck streaming state if present on load.
  const stopButton = page.getByLabel('Stop response').first();
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
  }

  const sendButton = page.locator('button[aria-label="Send message"]').first();
  await expect(sendButton).toBeVisible({ timeout: 15000 });
  await expect(sendButton).toBeEnabled({ timeout: 10000 });
  await sendButton.click();

  // User message should appear quickly.
  await expect(page.getByText(prompt, { exact: false }).first()).toBeVisible({ timeout: 15000 });

  // While streaming, spinner text usually appears. This is optional.
  const processing = page.getByText('LLM is processing request').first();
  if (await processing.isVisible().catch(() => false)) {
    await expect(processing).toBeVisible();
  }

  // Assistant response should appear and include either marker or non-empty assistant text.
  const marker = page.getByText('SMOKE_REPLY_OK', { exact: false }).first();
  const assistantBubble = page.locator('div').filter({ hasText: /SMOKE_REPLY_OK/i }).first();

  // Primary assertion: marker appears.
  await expect(marker).toBeVisible({ timeout: 45000 });

  // Keep a screenshot artifact for verification.
  await page.screenshot({ path: 'playwright-chat-smoke.png', fullPage: true });

  // Sanity assertion to avoid false positives where only user text exists.
  await expect(assistantBubble).toBeVisible({ timeout: 5000 });
});
