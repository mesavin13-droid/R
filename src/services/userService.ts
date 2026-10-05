import { UserProfile } from '../types';
import { INITIAL_USERS } from '../data/seedData';

const CURRENT_USER_KEY = 'roadlive_current_user_id';
const ALL_USERS_KEY = 'roadlive_users_v1';

export class UserService {
  private static users: UserProfile[] = [];

  static initialize() {
    if (this.users.length > 0) return;

    try {
      const stored = localStorage.getItem(ALL_USERS_KEY);
      if (stored) {
        this.users = JSON.parse(stored);
      } else {
        this.users = [...INITIAL_USERS];
        this.persist();
      }
    } catch {
      this.users = [...INITIAL_USERS];
    }
  }

  static syncTelegramUser(tgUser: { id: number; first_name: string; last_name?: string; username?: string }): UserProfile {
    this.initialize();
    const targetId = `tg-${tgUser.id}`;
    let user = this.users.find((u) => u.id === targetId);
    if (!user) {
      user = {
        id: targetId,
        email: tgUser.username ? `${tgUser.username}@telegram.org` : `${tgUser.id}@telegram.org`,
        fullName: `${tgUser.first_name} ${tgUser.last_name || ''}`.trim(),
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${tgUser.id}`,
        role: 'driver',
        level: 'Новичок',
        rating: 5.0,
        helpfulConfirmationsCount: 15,
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
    const user = this.users.find((u) => u.id === storedId);
    return user || this.users[0]; // defaults to Dmitry Sokolov (driver1)
  }

  static setCurrentUser(userId: string): UserProfile {
    this.initialize();
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, user.id);
      return user;
    }
    return this.users[0];
  }

  static toggleUserBan(userId: string): boolean {
    this.initialize();
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;
    user.isBanned = !user.isBanned;
    this.persist();
    return user.isBanned;
  }
}
