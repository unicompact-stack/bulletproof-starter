import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../shared/Avatar';
import { Send, MessageSquare, Users, User } from 'lucide-react';
import { User as UserType } from '../../types';

/**
 * ChatScreen — чат работника.
 * Два режима: «Общий чат» (все) и «Лично» (1:1 с диспетчером).
 */

type ChatMode = 'common' | 'personal';

export const ChatScreen: React.FC = () => {
  const { chatMessages, sendChatMessage, currentUser, users, clearNotifications } = useApp();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('common');
  const boxRef = useRef<HTMLDivElement>(null);

  // Личный собеседник мастера — диспетчер
  const counterpart: UserType | undefined = useMemo(
    () => users.find((u) => u.role === 'dispatcher') || users.find((u) => u.role === 'admin'),
    [users],
  );

  const visibleMessages = useMemo(() => {
    if (mode === 'common') return chatMessages.filter((m) => !m.recipientId);
    // Личные: переписка между мной и собеседником в обе стороны
    return chatMessages.filter((m) => {
      if (!m.recipientId) return false;
      const me = currentUser.id;
      const other = counterpart?.id;
      return (
        (m.senderId === me && m.recipientId === other) ||
        (m.senderId === other && m.recipientId === me)
      );
    });
  }, [chatMessages, mode, currentUser.id, counterpart]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [visibleMessages]);

  useEffect(() => {
    clearNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendChatMessage(text, undefined, mode === 'personal' ? counterpart?.id : undefined);
    setInput('');
  };

  const fmtTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#F4F7FA]">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-black text-slate-900">Чат</h1>

        {/* Переключатель режима чата */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('common')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'common'
                ? 'bg-[#168BEA] text-white shadow-md shadow-blue-500/20'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Общий чат
          </button>
          <button
            onClick={() => setMode('personal')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'personal'
                ? 'bg-[#168BEA] text-white shadow-md shadow-blue-500/20'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            Лично · {counterpart ? counterpart.fullName.split(' ')[0] : 'диспетчер'}
          </button>
        </div>
      </div>

      <div ref={boxRef} className="flex-1 overflow-y-auto px-4 pb-3 space-y-2.5">
        {visibleMessages.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            {mode === 'common' ? 'Сообщений пока нет' : 'Личных сообщений пока нет — напишите первым'}
          </div>
        )}
        {visibleMessages.map((msg) => {
          const isMe = msg.senderId === currentUser.id;
          const isManager = msg.senderRole === 'dispatcher' || msg.senderRole === 'admin';
          const sender = users.find((u) => u.id === msg.senderId);
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && sender && <Avatar user={sender} size={28} />}
              <div
                className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl ${
                  isMe
                    ? 'bg-[#168BEA] text-white rounded-br-md'
                    : isManager
                    ? 'bg-[#EFF6FF] text-slate-800 rounded-bl-md border border-[#BFE1FF]'
                    : 'bg-white text-slate-800 rounded-bl-md border border-slate-200'
                }`}
              >
                <div className={`text-[10px] font-bold mb-0.5 ${isMe ? 'opacity-80' : 'text-slate-400'}`}>
                  {isMe ? 'Вы' : msg.senderName}
                  {isManager && !isMe && <span className="ml-1 text-[#168BEA]">· руководитель</span>}
                </div>
                <div className="text-sm leading-relaxed break-words">{msg.text}</div>
                <div className={`text-[10px] mt-1 ${isMe ? 'opacity-70' : 'text-slate-400'}`}>{fmtTime(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 bg-white border-t border-slate-200 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder={mode === 'common' ? 'Написать в общий чат...' : 'Личное сообщение диспетчеру...'}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#168BEA]"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2.5 rounded-xl bg-[#168BEA] text-white font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-1 text-center">
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <MessageSquare className="w-3 h-3" />
          {mode === 'common'
            ? 'Общий чат виден всем — и руководителю, и бригаде'
            : 'Личные сообщения видят только вы и диспетчер'}
        </span>
      </div>
    </div>
  );
};
