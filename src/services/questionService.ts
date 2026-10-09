import { DriverQuestion, QuestionAnswer, UserProfile } from '../types';
import { localRealtime } from '../lib/supabase';
import { TelegramService } from './telegramService';

const STORAGE_KEY = 'roadlive_questions_v2';

function fromServerQuestion(row: any): DriverQuestion {
  return {
    id: row.id,
    userId: row.user_id || 'unknown',
    authorName: row.author_name || 'Водитель',
    cityId: row.city_id,
    districtId: row.district_id || undefined,
    category: row.category,
    question: row.question,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: row.address || '',
    answersCount: Number(row.answers_count || 0),
    status: row.status || 'open',
    createdAt: row.created_at,
    answers: Array.isArray(row.answers) ? row.answers.map((a: any): QuestionAnswer => ({
      id: a.id,
      questionId: a.question_id,
      userId: a.user_id || 'unknown',
      authorName: a.author_name || 'Водитель',
      authorLevel: a.is_verified ? 'Эксперт района' : 'Новичок',
      content: a.content,
      helpfulCount: Number(a.helpful_count || 0),
      isVerified: Boolean(a.is_verified),
      createdAt: a.created_at,
    })) : [],
  };
}

export class QuestionService {
  private static questions: DriverQuestion[] = [];

  static initialize() {
    if (this.questions.length > 0) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.questions = stored ? JSON.parse(stored) : [];
    } catch {
      this.questions = [];
    }
  }

  private static persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.questions)); }
    catch (e) { console.warn('Storage quota exceeded', e); }
  }

  static async getQuestionsAsync(cityId = 'nsk-city-01'): Promise<DriverQuestion[]> {
    if (TelegramService.isTelegramWebApp()) {
      if (!TelegramService.getCachedAuthoritativeIdentity()) throw new Error('Сессия Telegram отсутствует');
      const response = await fetch(`/api/questions?cityId=${encodeURIComponent(cityId)}`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.questions)) {
        throw new Error(payload?.error || 'Не удалось загрузить вопросы');
      }
      this.questions = payload.questions.map(fromServerQuestion);
      return this.questions;
    }
    return this.getQuestions();
  }

  static getQuestions(filter: 'all' | 'new' | 'unanswered' | 'popular' | 'my' = 'all', currentUserId?: string): DriverQuestion[] {
    this.initialize();
    let list = [...this.questions];
    switch (filter) {
      case 'new': list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'unanswered': list = list.filter((q) => q.answersCount === 0 || !q.answers?.length); break;
      case 'popular': list.sort((a, b) => b.answersCount - a.answersCount); break;
      case 'my':
        if (currentUserId) list = list.filter((q) => q.userId === currentUserId);
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      default: list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }

  static async deleteQuestion(questionId: string, userId: string): Promise<boolean> {
    this.initialize();
    if (TelegramService.isTelegramWebApp()) {
      if (!TelegramService.getCachedAuthoritativeIdentity()?.userId || TelegramService.getCachedAuthoritativeIdentity()?.userId !== userId) {
        throw new Error('Действие запрещено');
      }
      const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Не удалось удалить вопрос');
      this.questions = this.questions.filter((q) => q.id !== questionId);
      return true;
    }
    const index = this.questions.findIndex((q) => q.id === questionId && q.userId === userId);
    if (index === -1) return false;
    this.questions.splice(index, 1); this.persist();
    localRealtime.broadcast('questions_channel', { type: 'DELETE', questionId });
    return true;
  }

  static async askQuestion(data: {
    category: string; question: string; latitude: number; longitude: number; address: string; cityId?: string; districtId?: string;
  }, user: UserProfile): Promise<DriverQuestion> {
    this.initialize();
    if (TelegramService.isTelegramWebApp()) {
      const identity = TelegramService.getCachedAuthoritativeIdentity();
      if (!identity || identity.userId !== user.id) throw new Error('Пользователь не совпадает с Telegram-сессией');
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.question) throw new Error(payload?.error || 'Не удалось сохранить вопрос');
      const question = fromServerQuestion(payload.question);
      this.questions.unshift(question);
      return question;
    }

    const newQ: DriverQuestion = {
      id: `q-${Date.now()}`, userId: user.id, authorName: user.fullName,
      cityId: data.cityId || 'nsk-city-01', districtId: data.districtId,
      category: data.category, question: data.question.trim(), latitude: data.latitude, longitude: data.longitude,
      address: data.address, answersCount: 0, status: 'open', createdAt: new Date().toISOString(), answers: [],
    };
    this.questions.unshift(newQ); this.persist();
    localRealtime.broadcast('questions_channel', { type: 'INSERT', question: newQ });
    return newQ;
  }

  static async answerQuestion(questionId: string, content: string, user: UserProfile): Promise<QuestionAnswer> {
    this.initialize();
    if (TelegramService.isTelegramWebApp()) {
      const identity = TelegramService.getCachedAuthoritativeIdentity();
      if (!identity || identity.userId !== user.id) throw new Error('Пользователь не совпадает с Telegram-сессией');
      const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.answer) throw new Error(payload?.error || 'Не удалось сохранить ответ');
      const answer: QuestionAnswer = {
        id: payload.answer.id, questionId: payload.answer.question_id, userId: payload.answer.user_id || user.id,
        authorName: payload.answer.author_name || user.fullName, authorLevel: payload.answer.is_verified ? 'Эксперт района' : 'Новичок',
        content: payload.answer.content, helpfulCount: Number(payload.answer.helpful_count || 0),
        isVerified: Boolean(payload.answer.is_verified), createdAt: payload.answer.created_at,
      };
      const q = this.questions.find((item) => item.id === questionId);
      if (q) { q.answers = [...(q.answers || []), answer]; q.answersCount = Number(payload.question?.answers_count ?? q.answers.length); }
      return answer;
    }

    const q = this.questions.find((item) => item.id === questionId);
    if (!q) throw new Error('Вопрос не найден');
    const answer: QuestionAnswer = {
      id: `ans-${Date.now()}`, questionId, userId: user.id, authorName: user.fullName, authorLevel: user.level,
      content: content.trim(), helpfulCount: 0, isVerified: user.level === 'Эксперт района' || user.role === 'admin',
      createdAt: new Date().toISOString(),
    };
    q.answers = [...(q.answers || []), answer]; q.answersCount = q.answers.length; this.persist();
    localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });
    return answer;
  }

  static async markAnswerHelpful(questionId: string, answerId: string): Promise<void> {
    this.initialize();
    if (TelegramService.isTelegramWebApp()) {
      const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/helpful`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answerId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.answer) throw new Error(payload?.error || 'Не удалось отметить ответ');
      const q = this.questions.find((item) => item.id === questionId);
      const a = q?.answers?.find((item) => item.id === answerId);
      if (a) a.helpfulCount = Number(payload.answer.helpful_count || 0);
      return;
    }
    const q = this.questions.find((item) => item.id === questionId);
    const ans = q?.answers?.find((a) => a.id === answerId);
    if (!ans) return;
    ans.helpfulCount += 1; this.persist();
    localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });
  }

  static async deleteAnswer(questionId: string, answerId: string, userId: string): Promise<boolean> {
    this.initialize();
    if (TelegramService.isTelegramWebApp()) {
      const identity = TelegramService.getCachedAuthoritativeIdentity();
      if (!identity || identity.userId !== userId) throw new Error('Действие запрещено');
      const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/answers/${encodeURIComponent(answerId)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Не удалось удалить ответ');
      const q = this.questions.find((item) => item.id === questionId);
      if (q) { q.answers = (q.answers || []).filter((a) => a.id !== answerId); q.answersCount = Math.max(0, q.answersCount - 1); }
      return true;
    }
    const q = this.questions.find((item) => item.id === questionId);
    if (!q?.answers) return false;
    const index = q.answers.findIndex((a) => a.id === answerId && a.userId === userId);
    if (index === -1) return false;
    q.answers.splice(index, 1); q.answersCount = q.answers.length; this.persist();
    localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });
    return true;
  }
}
