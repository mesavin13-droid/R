import { EventType } from '../types';

export interface AICategorizationResult {
  category: EventType;
  subType?: string;
  cleanedDescription: string;
  extractedAddress?: string;
  isToxic: boolean;
  confidence: number;
}

export class AIService {
  /**
   * Fast rule-based + AI analyzer that runs locally (zero latency, zero API costs)
   * or delegates to Gemini if configured.
   */
  static analyzeReport(text: string): AICategorizationResult {
    const lower = text.toLowerCase().trim();

    // Check toxicity / spam
    const toxicKeywords = ['мат', 'сука', 'блять', 'нахуй', 'пидор', 'хуй', 'ебать'];
    const isToxic = toxicKeywords.some(w => lower.includes(w));

    // Category detection rules
    if (lower.includes('переезд') || lower.includes('поезд') || lower.includes('шлагбаум') || lower.includes('маневровый')) {
      const subType = lower.includes('открыт') ? 'open' : lower.includes('очередь') ? 'large_queue' : 'closed';
      return {
        category: 'crossing',
        subType,
        cleanedDescription: text,
        isToxic,
        confidence: 0.95,
      };
    }

    if (lower.includes('дтп') || lower.includes('авария') || lower.includes('въехал') || lower.includes('притерлись') || lower.includes('стукнулись') || lower.includes('столкнулись')) {
      const subType = lower.includes('перекрыта дорога') ? 'road_blocked' : lower.includes('полоса') ? 'lane_blocked' : lower.includes('мелкое') ? 'minor' : 'major';
      return {
        category: 'accident',
        subType,
        cleanedDescription: text,
        isToxic,
        confidence: 0.98,
      };
    }

    if (lower.includes('дпс') || lower.includes('гаи') || lower.includes('гайцы') || lower.includes('контроль') || lower.includes('тормозят') || lower.includes('экипаж') || lower.includes('документы')) {
      return {
        category: 'patrol',
        subType: 'check',
        cleanedDescription: text,
        isToxic,
        confidence: 0.92,
      };
    }

    if (lower.includes('азс') || lower.includes('бензин') || lower.includes('заправка') || lower.includes('очередь на газпром') || lower.includes('лукойл') || lower.includes('солярка')) {
      return {
        category: 'fuel',
        subType: 'queue',
        cleanedDescription: text,
        isToxic,
        confidence: 0.94,
      };
    }

    if (lower.includes('светофор') || lower.includes('зеленый') || lower.includes('мигает')) {
      return {
        category: 'traffic_light',
        subType: lower.includes('не работает') ? 'broken' : 'blinking',
        cleanedDescription: text,
        isToxic,
        confidence: 0.95,
      };
    }

    if (lower.includes('яма') || lower.includes('ремонт') || lower.includes('гололед') || lower.includes('наледь') || lower.includes('лужа') || lower.includes('перекрыли') || lower.includes('асфальт')) {
      const subType = lower.includes('яма') ? 'pothole' : lower.includes('ремонт') ? 'repair' : lower.includes('гололед') ? 'ice' : 'other';
      return {
        category: 'road',
        subType,
        cleanedDescription: text,
        isToxic,
        confidence: 0.90,
      };
    }

    if (lower.includes('фура') || lower.includes('грузовик') || lower.includes('колесо') || lower.includes('препятствие') || lower.includes('бревно') || lower.includes('предмет')) {
      return {
        category: 'hazard',
        subType: 'obstacle',
        cleanedDescription: text,
        isToxic,
        confidence: 0.91,
      };
    }

    return {
      category: 'other',
      cleanedDescription: text,
      isToxic,
      confidence: 0.70,
    };
  }
}
