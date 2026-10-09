import { ChatChannel } from '../types';

export const CHAT_CHANNELS: ChatChannel[] = [
  {
    id: 'general',
    name: 'Общий эфир',
    description: 'Главные дороги и оперативная обстановка Новосибирска',
    icon: '📻',
  },
  {
    id: 'bridges',
    name: 'Мосты и переправы',
    description: 'Димитровский, Октябрьский и Бугринский мосты',
    icon: '🌉',
  },
  {
    id: 'crossings',
    name: 'Ж/Д Переезды',
    description: 'ул. Троллейная, Станционная, Бетонная',
    icon: '🚧',
  },
  {
    id: 'leninskiy',
    name: 'Ленинский & Кировский',
    description: 'пл. Маркса, Ватутина, Немировича, Титова',
    icon: '🏙️',
  },
  {
    id: 'oktyabrskiy',
    name: 'Октябрьский район',
    description: 'Большевистская, Кирова, Восход, Выборная',
    icon: '🚗',
  },
  {
    id: 'central',
    name: 'Центр & Заельцовский',
    description: 'Красный проспект, Ипподромская, Фабричная',
    icon: '🚦',
  },
];
