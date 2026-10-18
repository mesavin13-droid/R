import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TelegramService } from '../src/services/telegramService';

test('the Telegram SDK alone does not block the public map with a login error', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { Telegram: { WebApp: { initData: '' } } },
    });
    assert.equal(TelegramService.isTelegramClient(), false);
    (globalThis as any).window.Telegram.WebApp.initData = 'auth_date=1&hash=xyz';
    assert.equal(TelegramService.isTelegramClient(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete (globalThis as any).window;
  }
});
