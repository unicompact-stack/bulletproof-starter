import React from 'react';
import { useApp } from '../../context/AppContext';
import { HelpCircle, MessageSquare, Phone, BookOpen, RotateCcw } from 'lucide-react';

export const HelpScreen: React.FC = () => {
  const { resetDemoState, showToast, sendChatMessage, authMode, logout } = useApp();
  const isDemo = authMode === 'demo';

  const handleSendMessage = () => {
    sendChatMessage('Здравствуйте, нужна помощь по задаче');
    showToast('Сообщение отправлено диспетчеру');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F4F7FA]">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-black text-slate-900">Помощь</h1>
        <p className="text-xs text-slate-500 mt-1">Справка и связь с диспетчером</p>
      </div>

      <div className="px-4 py-4 space-y-3">
        <button
          onClick={handleSendMessage}
          className="w-full bg-white rounded-2xl p-4 text-left border border-slate-100 shadow-sm active:scale-[0.98] transition-transform flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#168BEA]/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-6 h-6 text-[#168BEA]" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Написать диспетчеру</div>
            <div className="text-xs text-slate-500">Быстрое сообщение о помощи</div>
          </div>
        </button>

        <button
          onClick={() => window.location.href = 'tel:+74951234567'}
          className="w-full bg-white rounded-2xl p-4 text-left border border-slate-100 shadow-sm active:scale-[0.98] transition-transform flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Phone className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Позвонить в поддержку</div>
            <div className="text-xs text-slate-500">+7 (495) 123-45-67</div>
          </div>
        </button>

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Как работать с приложением</span>
          </div>
          <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
            <li>Открой задачу из раздела «Мои задачи»</li>
            <li>Нажми «Начать работу»</li>
            <li>Сделай фото результата</li>
            <li>Добавь комментарий если нужно</li>
            <li>Нажми «Отправить на проверку»</li>
          </ol>
        </div>

        {isDemo && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="text-xs text-amber-600 font-bold mb-1">Учебный режим</div>
            <div className="text-sm text-amber-800">
              Это демо-режим. Данные не сохраняются на сервере.
            </div>
          </div>
        )}

        <button
          onClick={() => {
            resetDemoState();
            logout();
          }}
          className="w-full bg-white rounded-2xl p-4 text-left border border-slate-100 shadow-sm active:scale-[0.98] transition-transform flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <RotateCcw className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Сбросить и выйти</div>
            <div className="text-xs text-slate-500">Вернуться к экрану входа</div>
          </div>
        </button>

        {/* Номер сборки — быстрая проверка, какая версия запущена */}
        <div className="text-center text-[11px] text-slate-400 pt-1">
          FSM PRO · сборка: <span className="font-bold">{__APP_BUILD__}</span>
        </div>
      </div>
    </div>
  );
};
