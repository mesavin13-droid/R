import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = (name: string) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('map stays primary: five visible filters, other categories in expandable menu', () => {
  const header = file('src/components/layout/TopHeader.tsx');
  const css = file('src/roadlive-quiet.css');
  assert.match(header, /const primaryCategories: Category\[\]/);
  assert.match(header, /const otherCategories: Category\[\]/);
  const primary = header.split('const primaryCategories: Category[] = [')[1].split('];')[0];
  assert.equal((primary.match(/id: '/g) || []).length, 5, 'five essential categories on map');
  assert.match(header, /aria-expanded=\{moreOpen\}/);
  assert.match(header, /rl-filter-menu/);
  assert.match(css, /\.rl-filter-line\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(header, /animate-marquee|roadMarkerIconIndex|rl-category-filter-rail/);
});

test('navigation exposes essentials and keeps secondary sections reachable', () => {
  const nav = file('src/components/layout/BottomNav.tsx');
  const map = file('src/components/map/RoadMap.tsx');
  assert.match(nav, /rl-nav-grid/);
  assert.match(nav, /rl-simple-nav-sos/);
  for (const destination of ['questions', 'route', 'stations', 'profile']) {
    assert.match(nav, new RegExp("id: '" + destination + "'"));
  }
  assert.match(map, /rl-map-report-button/);
  assert.doesNotMatch(map, /FloatingMapAdSticker/);
  assert.match(map, /onSelectEvent\(myActiveSos\)/);
  assert.match(map, /handleCloseMySos/);
});

test('quiet stylesheet loads last, shared screens and dialog surfaces remain', () => {
  const main = file('src/main.tsx');
  assert.match(main, /roadlive-mobile-polish\.css/);
  assert.match(main, /roadlive-quiet\.css/);
  assert.ok(main.indexOf('roadlive-mobile-polish.css') < main.indexOf('roadlive-quiet.css'));
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
  assert.match(file('src/components/events/ReportTypePicker.tsx'), /rl-report-picker-sheet/);
  for (const path of [
    'src/components/events/CreateEventModal.tsx',
    'src/components/events/QuickSosModal.tsx',
    'src/components/events/EventDetailSheet.tsx',
    'src/components/stations/StationSheet.tsx',
    'src/components/questions/AskQuestionModal.tsx',
  ]) {
    assert.match(file(path), /rl-dialog-surface/, path);
  }
});

test('guest-only map and Telegram write gate stay intact', () => {
  const app = file('src/App.tsx');
  assert.match(app, /className="rl-guest-nav"/);
  assert.match(app, /if \(!isTelegramAuthenticated\) return askForLogin\(\)/);
  assert.match(app, /isGuest=\{!isTelegramAuthenticated\}/);
});


test('chat, route and profile are calmer without losing their controls', () => {
  const chat = file('src/components/chat/DriverChat.tsx');
  const profile = file('src/components/profile/UserProfile.tsx');
  const route = file('src/components/route/RoutePlanner.tsx');
  assert.match(chat, /rl-channel-selector/);
  assert.match(chat, /<select/);
  assert.match(chat, /CHAT_CHANNEL_GROUPS\.map/);
  assert.match(chat, /showPresets &&/);
  assert.match(chat, /handleSendMessage/);
  assert.match(profile, /rl-profile-avatar/);
  assert.match(profile, /rl-profile-stats/);
  assert.match(profile, /<details className="rl-profile-achievements/);
  assert.ok(profile.indexOf('rl-profile-stats') > profile.indexOf('Tab Contents'),
    'statistics must be in scrollable profile content, not over the fold');
  assert.match(route, /<Construction className/);
  assert.doesNotMatch(route, /'🚧'|'🚗'|'👮'|'⛽'/);
});

test('CSS and runtime palette agree on shared colors', () => {
  const css = file('src/index.css');
  const runtime = file('src/theme/tokens.ts');
  assert.match(css, /--color-graphite:\s*#10151d/);
  assert.match(runtime, /graphite:\s*'#10151d'/);
  assert.match(css, /--color-accent:\s*#83b3ff/);
  assert.match(runtime, /accent:\s*'#83b3ff'/);
});
