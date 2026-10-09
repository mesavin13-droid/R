import { UserProfile } from '../types';

const CURRENT_USER_KEY = 'roadlive_current_user_id';
const ALL_USERS_KEY = 'roadlive_users_v2';

const GUEST_USER: UserProfile = {
  id: 'guest',
  email: '',
  fullName: 'Водитель',
  role: 'driver',
  level: 'Новичок',
  rating: 5,
  helpfulConfirmationsCount: 0,
  eventsCount: 0,
  questionsCount: 0,
  answersCount: 0,
  reportsCount: 0,
  isBanned: false,
  createdAt: '1970-01-01T00:00:00.000Z',
};

export class UserService {
  private static users: UserProfile[] = [];

  static initialize() {
    if (this.users.length > 0) return;

    try {
      const stored = localStorage.getItem(ALL_USERS_KEY);
      this.users = stored ? JSON.parse(stored) : [];
    } catch {
      this.users = [];
    }
  }

  static syncTelegramUser(tgUser: { id: number; first_name: string; last_name?: string; username?: string }, role: UserProfile['role'] = 'driver'): UserProfile {
    this.initialize();
    const targetId = `tg-${tgUser.id}`;
    let user = this.users.find((u) => u.id === targetId);
    if (!user) {
      user = {
        id: targetId,
        email: tgUser.username ? `${tgUser.username}@telegram.org` : `${tgUser.id}@telegram.org`,
        fullName: `${tgUser.first_name} ${tgUser.last_name || ''}`.trim(),
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${tgUser.id}`,
        role,
        level: 'Новичок',
        rating: 5.0,
        helpfulConfirmationsCount: 0,
        eventsCount: 0,
        questionsCount: 0,
        answersCount: 0,
        reportsCount: 0,
        isBanned: false,
        createdAt: new Date().toISOString()
      };
      this.users.push(user);
      this.persist();
    } else {
      // update name if changed
      user.fullName = `${tgUser.first_name} ${tgUser.last_name || ''}`.trim();
      user.role = role;
      this.persist();
    }
    localStorage.setItem(CURRENT_USER_KEY, user.id);
    return user;
  }

  private static persist() {
    try {
      localStorage.setItem(ALL_USERS_KEY, JSON.stringify(this.users));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  static getAllUsers(): UserProfile[] {
    this.initialize();
    return [...this.users];
  }

  static getCurrentUser(): UserProfile {
    this.initialize();
    const storedId = localStorage.getItem(CURRENT_USER_KEY);
    return this.users.find((u) => u.id === storedId) || GUEST_USER;
  }

  static setCurrentUser(userId: string): UserProfile {
    this.initialize();
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, user.id);
      return user;
    }
    return GUEST_USER;
  }
}
