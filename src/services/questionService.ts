import { DriverQuestion, QuestionAnswer, UserProfile } from '../types';
import { INITIAL_QUESTIONS } from '../data/seedData';
import { localRealtime } from '../lib/supabase';

const STORAGE_KEY = 'roadlive_questions_v1';

export class QuestionService {
  private static questions: DriverQuestion[] = [];

  static initialize() {
    if (this.questions.length > 0) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.questions = JSON.parse(stored);
      } else {
        this.questions = [...INITIAL_QUESTIONS];
        this.persist();
      }
    } catch {
      this.questions = [...INITIAL_QUESTIONS];
    }
  }

  private static persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.questions));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  static getQuestions(filter: 'all' | 'new' | 'unanswered' | 'popular' | 'my' = 'all', currentUserId?: string): DriverQuestion[] {
    this.initialize();

    let list = [...this.questions];

    switch (filter) {
      case 'new':
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'unanswered':
        list = list.filter((q) => q.answersCount === 0 || !q.answers || q.answers.length === 0);
        break;
      case 'popular':
        list.sort((a, b) => b.answersCount - a.answersCount);
        break;
      case 'my':
        if (currentUserId) {
          list = list.filter((q) => q.userId === currentUserId);
        }
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      default:
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list;
  }

  static deleteQuestion(questionId: string, userId: string): boolean {
    this.initialize();
    const index = this.questions.findIndex((q) => q.id === questionId && q.userId === userId);
    if (index !== -1) {
      this.questions.splice(index, 1);
      this.persist();
      localRealtime.broadcast('questions_channel', { type: 'DELETE', questionId });
      return true;
    }
    return false;
  }

  static askQuestion(
    data: {
      category: string;
      question: string;
      latitude: number;
      longitude: number;
      address: string;
      cityId?: string;
      districtId?: string;
    },
    user: UserProfile
  ): DriverQuestion {
    this.initialize();

    const newQ: DriverQuestion = {
      id: `q-${Date.now()}`,
      userId: user.id,
      authorName: user.fullName,
      cityId: data.cityId || 'nsk-city-01',
      districtId: data.districtId,
      category: data.category,
      question: data.question.trim(),
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      answersCount: 0,
      status: 'open',
      createdAt: new Date().toISOString(),
      answers: [],
    };

    this.questions.unshift(newQ);
    this.persist();

    localRealtime.broadcast('questions_channel', { type: 'INSERT', question: newQ });
    return newQ;
  }

  static answerQuestion(
    questionId: string,
    content: string,
    user: UserProfile
  ): QuestionAnswer {
    this.initialize();

    const q = this.questions.find((item) => item.id === questionId);
    if (!q) throw new Error('Вопрос не найден');

    const answer: QuestionAnswer = {
      id: `ans-${Date.now()}`,
      questionId,
      userId: user.id,
      authorName: user.fullName,
      authorLevel: user.level,
      content: content.trim(),
      helpfulCount: 0,
      isVerified: user.level === 'Эксперт района' || user.role === 'admin',
      createdAt: new Date().toISOString(),
    };

    if (!q.answers) q.answers = [];
    q.answers.push(answer);
    q.answersCount = q.answers.length;

    this.persist();
    localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });

    return answer;
  }

  static markAnswerHelpful(questionId: string, answerId: string): void {
    this.initialize();

    const q = this.questions.find((item) => item.id === questionId);
    if (!q || !q.answers) return;

    const ans = q.answers.find((a) => a.id === answerId);
    if (ans) {
      ans.helpfulCount += 1;
      this.persist();
      localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });
    }
  }

  static deleteAnswer(questionId: string, answerId: string, userId: string): boolean {
    this.initialize();
    const q = this.questions.find((item) => item.id === questionId);
    if (!q || !q.answers) return false;

    const index = q.answers.findIndex((a) => a.id === answerId && a.userId === userId);
    if (index !== -1) {
      q.answers.splice(index, 1);
      q.answersCount = q.answers.length;
      this.persist();
      localRealtime.broadcast('questions_channel', { type: 'UPDATE', question: q });
      return true;
    }
    return false;
  }
}
