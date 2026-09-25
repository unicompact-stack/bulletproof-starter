import React from 'react';
import { User } from '../../types';

/**
 * Avatar — аватар пользователя.
 * Если фото нет (например, сотрудник создан в админ-панели) —
 * показываем цветной круг с инициалами. Цвет стабилен для каждого имени.
 */

const PALETTE = [
  'bg-[#168BEA]', 'bg-[#2CCB70]', 'bg-[#9546D8]', 'bg-[#F59E0B]',
  'bg-[#EF4444]', 'bg-[#0EA5E9]', 'bg-[#14B8A6]', 'bg-[#F97316]',
];

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorOf(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

interface Props {
  user: User;
  size?: number; // px
  className?: string;
}

export const Avatar: React.FC<Props> = ({ user, size = 40, className = '' }) => {
  const hasPhoto = !!user.avatar && user.avatar.startsWith('http');

  if (hasPhoto) {
    return (
      <img
        src={user.avatar}
        alt={user.fullName}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover border border-slate-200 ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      className={`rounded-full flex items-center justify-center text-white font-black shrink-0 ${colorOf(user.fullName)} ${className}`}
    >
      {initialsOf(user.fullName)}
    </div>
  );
};
