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
