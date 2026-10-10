import { ChatChannel } from '../types';

export const CHAT_CHANNEL_GROUPS: { id: ChatChannel['group']; label: string }[] = [
  { id: 'general', label: 'Общее' },
  { id: 'landmarks', label: 'Мосты и переезды' },
  { id: 'districts', label: 'Районы города' },
];

export const CHAT_CHANNELS: ChatChannel[] = [
  // --- Общее ---
  {
    id: 'general',
    name: 'Общий эфир',
    description: 'Главные дороги и оперативная обстановка Новосибирска',
    icon: '📻',
    group: 'general',
  },

  // --- Мосты и переезды (ключевые узкие места) ---
  {
    id: 'bridges',
    name: 'Мосты и переправы',
    description: 'Димитровский, Октябрьский и Бугринский мосты',
    icon: '🌉',
    group: 'landmarks',
  },
  {
    id: 'crossings',
    name: 'Ж/Д Переезды',
    description: 'ул. Троллейная, Станционная, Бетонная',
    icon: '🚧',
    group: 'landmarks',
  },

  // --- Районы Новосибирска ---
  {
    id: 'leninskiy',
    name: 'Ленинский & Кировский',
    description: 'пл. Маркса, Ватутина, Немировича, Титова',
    icon: '🏙️',
    group: 'districts',
  },
  {
    id: 'oktyabrskiy',
    name: 'Октябрьский',
    description: 'Большевистская, Кирова, Восход, Выборная',
    icon: '🚗',
    group: 'districts',
  },
  {
    id: 'central',
    name: 'Центральный & Заельцовский',
    description: 'Красный проспект, Ипподромская, Фабричная',
    icon: '🚦',
    group: 'districts',
  },
  {
    id: 'dzerszhinskiy',
    name: 'Дзержинский',
    description: 'Красный проспект (север), Богдана Хмельницкого',
    icon: '🏘️',
    group: 'districts',
  },
  {
    id: 'kalininskiy',
    name: 'Калининский',
    description: 'Русаковская, Плахотного, Кропоткина',
    icon: '🌲',
    group: 'districts',
  },
  {
    id: 'pervomaiskiy',
    name: 'Первомайский',
    description: 'Ипподромская, Лытинское шоссе',
    icon: '🛣️',
    group: 'districts',
  },
  {
    id: 'sovetskiy',
    name: 'Советский',
    description: 'Академгородок, Никитина, Троллейная',
    icon: '🎓',
    group: 'districts',
  },
  {
    id: 'zheldor',
    name: 'Железнодорожный (Чкаловский)',
    description: 'Вокзальная часть, Станционная, Владимировская',
    icon: '🚉',
    group: 'districts',
  },
];

