import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TelegramService } from '../src/services/telegramService';

test('Telegram JS SDK loaded in Safari does not force Mini App login', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { Telegram: { WebApp: { initData: '' } } },
    });
    assert.equal(TelegramService.isTelegramClient(), false);
    assert.equal(TelegramService.isTelegramWebApp(), false);

    // Presence of an actual signed-data string switches into Mini App mode.
    (globalThis as any).window.Telegram.WebApp.initData = 'auth_date=123&hash=abc';
    assert.equal(TelegramService.isTelegramClient(), true);
    assert.equal(TelegramService.isTelegramWebApp(), true);
  } finally {
    if (old) Object.defineProperty(globalThis, 'window', old);
    else delete (globalThis as any).window;
  }
});
