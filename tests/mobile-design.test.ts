import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = (name: string) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('compact, horizontally scrollable map filters keep the map visible', () => {
  const css = file('src/roadlive-mobile-polish.css');
  const header = file('src/components/layout/TopHeader.tsx');
  const rail = css.match(/\.rl-category-filter-rail\s*\{([^}]+)\}/);
  assert.ok(rail, 'missing mobile filter rail');
  assert.match(rail![1], /height:\s*53px/);
  assert.match(rail![1], /overflow-x:\s*auto/);
  assert.match(css, /\.rl-category-filter\s*\{[\s\S]*?height:\s*41px/);
  assert.match(css, /\.rl-category-filter-label[\s\S]*?white-space:\s*nowrap/);
  assert.match(header, /roadMarkerIconIndex\(/);
  assert.match(header, /192px 29px/, 'glossy sprite must remain present, compactly sized');
  assert.doesNotMatch(header, /rl-category-pin-shell/, 'obsolete oversized drop SVG must not return');
});

test('guests get one CTA, with all mutation tools still gated by Telegram', () => {
  const app = file('src/App.tsx');
  assert.match(app, /className="rl-guest-nav"/);
  assert.match(app, /if \(!isTelegramAuthenticated\) return askForLogin\(\)/);
  assert.doesNotMatch(app, /Гостевой просмотр · Войти через Telegram/, 'duplicated login overlay');
  assert.match(app, /isGuest=\{!isTelegramAuthenticated\}/);
});

test('shared typography and compact dialogs reach every primary screen', () => {
  const main = file('src/main.tsx');
  assert.match(main, /roadlive-mobile-polish\.css/);
  for (const path of [
    'src/components/questions/QuestionFeed.tsx',
    'src/components/chat/DriverChat.tsx',
    'src/components/route/RoutePlanner.tsx',
    'src/components/profile/UserProfile.tsx',
    'src/components/admin/AdminDashboard.tsx',
  ]) {
    assert.match(file(path), /rl-page-shell/, path);
    assert.match(file(path), /rl-page-header/, path);
  }
  for (const path of [
    'src/components/events/ReportTypePicker.tsx',
    'src/components/events/CreateEventModal.tsx',
    'src/components/events/QuickSosModal.tsx',
    'src/components/events/EventDetailSheet.tsx',
    'src/components/stations/StationSheet.tsx',
    'src/components/questions/AskQuestionModal.tsx',
    'src/components/common/AboutServiceModal.tsx',
  ]) {
    assert.match(file(path), /rl-dialog-surface/, path);
  }
});
