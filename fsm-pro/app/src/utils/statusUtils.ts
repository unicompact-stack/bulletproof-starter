import { TaskStatus, Priority, PhotoCategory } from '../types';

export interface StatusConfig {
  label: string;
  colorHex: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  lightBg: string;
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  new: {
    label: 'Новая',
    colorHex: '#2CCB70',
    badgeBg: 'bg-[#2CCB70]',
    badgeText: 'text-white',
    borderClass: 'border-[#2CCB70]',
    lightBg: 'bg-[#2CCB70]/10 text-[#1B8D4C]',
  },
  assigned: {
    label: 'Назначена',
    colorHex: '#9546D8',
    badgeBg: 'bg-[#9546D8]',
    badgeText: 'text-white',
    borderClass: 'border-[#9546D8]',
    lightBg: 'bg-[#9546D8]/10 text-[#9546D8]',
  },
  in_progress: {
    label: 'В работе',
    colorHex: '#168BEA',
    badgeBg: 'bg-[#168BEA]',
    badgeText: 'text-white',
    borderClass: 'border-[#168BEA]',
    lightBg: 'bg-[#168BEA]/10 text-[#0D62A7]',
  },
  under_review: {
    label: 'На проверке',
    colorHex: '#9546D8',
    badgeBg: 'bg-[#9546D8]',
    badgeText: 'text-white',
    borderClass: 'border-[#9546D8]',
    lightBg: 'bg-[#9546D8]/10 text-[#7C3AED]',
  },
  completed: {
    label: 'Завершена',
    colorHex: '#2CCB70',
    badgeBg: 'bg-[#2CCB70]',
    badgeText: 'text-white',
    borderClass: 'border-[#2CCB70]',
    lightBg: 'bg-[#2CCB70]/10 text-[#1B8D4C]',
  },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string }> = {
  low: { label: 'Низкий', bg: 'bg-slate-100', text: 'text-slate-600' },
  medium: { label: 'Обычный', bg: 'bg-blue-50', text: 'text-blue-700' },
  high: { label: 'Высокий', bg: 'bg-amber-50', text: 'text-amber-700' },
  urgent: { label: 'Срочно!', bg: 'bg-rose-50', text: 'text-rose-700 font-bold' },
};

export const PHOTO_CATEGORY_CONFIG: Record<PhotoCategory, { label: string; minRequired: number; desc: string }> = {
  before: { label: 'До начала работ', minRequired: 2, desc: 'Общий вид и состояние объекта до вмешательства' },
  process: { label: 'Процесс выполнения', minRequired: 1, desc: 'Ключевые промежуточные монтажные этапы' },
  result: { label: 'Результат', minRequired: 3, desc: 'Готовая работа с разных ракурсов и качество швов' },
  defects: { label: 'Дефекты / Скрытые работы', minRequired: 0, desc: 'Обнаруженные повреждения или скрытые узлы' },
  materials: { label: 'Материалы', minRequired: 0, desc: 'Упаковки, маркировка и остатки материалов' },
  documents: { label: 'Документы / Счётчики', minRequired: 0, desc: 'Акты, показания приборов, заводские номера' },
};

export function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}
