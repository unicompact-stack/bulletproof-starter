import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { MobileFrame } from './components/mobile/MobileFrame';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DemoGuide } from './components/mobile/DemoGuide';
import { ProfileModal } from './components/mobile/ProfileModal';
import { Avatar } from './components/shared/Avatar';
import { resolveAuthCode, resolveUserCode, getAccessCodes } from './auth';
import {
  Wrench, CheckCircle2, Key, ArrowRight, LogOut, GraduationCap, ShieldCheck,
} from 'lucide-react';

/**
 * App.tsx — корневая разводка приложения.
 *
 * Логика входа (Фаза 1–3):
 *  - authMode === null      → экран входа (код или демо).
 *  - authMode === 'worker'  → панель работника (мобильная).
 *  - authMode === 'manager' → панель руководителя.
 *  - authMode === 'demo'    → панель работника + явный учебный режим.
 */

// ============ ЭКРАН ВХОДА ============
const LoginScreen: React.FC = () => {
  const { login, enterDemo, users } = useApp();
  const [loginCode, setLoginCode] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = () => {
    const resolved = resolveAuthCode(loginCode);
    if (resolved === null) {
      setLoginError('Неверный код. Проверьте и попробуйте снова.');
      return;
    }
    // Заблокированный (уволенный) мастер по коду не входит
    if (resolved === 'worker') {
      const uid = resolveUserCode(loginCode);
      const target = uid ? users.find((u) => u.id === uid) : null;
      if (target?.isBlocked) {
        setLoginError('Доступ закрыт. Обратитесь к руководителю.');
        return;
      }
    }
    setLoginError('');
    // Личный код мастера → панель именно этого мастера
    login(resolved, resolved === 'worker' ? (resolveUserCode(loginCode) ?? undefined) : undefined);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-tr from-[#168BEA] to-[#2CCB70] flex items-center justify-center shadow-2xl shadow-blue-500/30">
            <Wrench className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black mb-1">FSM PRO</h1>
          <p className="text-slate-400 text-sm">Управление выездными работами</p>
        </div>

        {/* Вход по коду */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-[#168BEA]" />
            <span className="text-sm font-bold text-white">Вход по коду доступа</span>
          </div>

          <input
            type="text"
            inputMode="numeric"
            value={loginCode}
            onChange={(e) => { setLoginCode(e.target.value); setLoginError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="Введите код доступа"
            autoFocus
            className="w-full px-4 py-3.5 bg-white/10 border border-white/15 rounded-2xl text-white placeholder-slate-400 text-center text-lg tracking-[0.4em] focus:outline-none focus:border-[#168BEA]"
          />

          {loginError && (
            <div className="mt-3 text-xs text-red-400 font-medium text-center">{loginError}</div>
          )}

          <button
            onClick={handleLogin}
            className="w-full mt-4 bg-[#168BEA] hover:bg-[#1478CC] text-white font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            Войти
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-500 leading-relaxed">
            Код работника — <span className="font-bold text-slate-300">{getAccessCodes().worker}</span><br />
            Код руководителя — <span className="font-bold text-slate-300">{getAccessCodes().manager}</span>
          </p>
        </div>

        {/* Демо-режим — отдельная кнопка, не смешивается со входом */}
        <button
          onClick={enterDemo}
          className="w-full mt-4 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 font-bold py-4 px-6 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
        >
          <GraduationCap className="w-5 h-5" />
          Демо-режим (обучение)
        </button>

        <div className="mt-8 text-center text-xs text-slate-500">
          Демо-режим — учебный. Реальные коды входа ведут в рабочие панели.
        </div>

        {/* Номер сборки — чтобы сразу понимать, какая версия перед глазами */}
        <div className="mt-3 text-center text-[11px] text-slate-600">
          Сборка: <span className="font-bold text-slate-400">{__APP_BUILD__}</span>
        </div>
      </div>
    </div>
  );
};

// ============ ПАНЕЛЬ РАБОТНИКА (мастер) ============
const WorkerView: React.FC<{ isDemo: boolean }> = ({ isDemo }) => {
  const { currentUser, logout, presence, setUserPresence } = useApp();
  const [showProfile, setShowProfile] = useState(false);
  const isOnline = (presence[currentUser.id] ?? 'online') === 'online';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 antialiased selection:bg-[#168BEA] selection:text-white">
      {isDemo && (
        <div className="bg-amber-400 text-amber-950 text-center text-xs font-bold px-4 py-1.5">
          Учебный демо-режим — данные не сохраняются
        </div>
      )}

      <header className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-50 flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#168BEA] to-[#2CCB70] flex items-center justify-center text-white shadow-md shadow-blue-500/25">
          <Wrench className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm tracking-tight text-slate-900">FSM PRO</div>
          <p className="text-[11px] text-slate-400 truncate">Мастер · {currentUser.fullName}</p>
        </div>

        {/* Переключатель онлайн/офлайн — видно руководителю */}
        <button
          onClick={() => setUserPresence(currentUser.id, isOnline ? 'offline' : 'online')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
            isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {isOnline ? 'Онлайн' : 'Офлайн'}
        </button>

        {/* Мой профиль — кружок-аватар в шапке */}
        <button
          onClick={() => setShowProfile(true)}
          className="shrink-0 rounded-full ring-2 ring-offset-1 ring-[#168BEA]/40 active:scale-90 transition-transform"
          title="Мой профиль"
        >
          <Avatar user={currentUser} size={34} />
        </button>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <MobileFrame />
      </main>

      {isDemo && <DemoGuide />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
};

// ============ ПАНЕЛЬ РУКОВОДИТЕЛЯ ============
const ManagerView: React.FC = () => {
  const { toastMessage, currentUser, logout } = useApp();

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col font-sans text-slate-800 antialiased">
      <header className="bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-3 sticky top-0 z-50 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#168BEA] to-[#2CCB70] flex items-center justify-center text-white shadow-md shadow-blue-500/25">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-black text-base tracking-tight text-[#263238]">FSM PRO</div>
          <div className="text-[11px] text-[#7D8790]">Панель руководителя · {currentUser.fullName}</div>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Выйти
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <AdminDashboard />
      </main>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2.5 text-xs backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

// ============ ОБУЧАЮЩИЙ ЭКРАН (только в демо-режиме) ============
const TrainingModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { logout } = useApp();
  const steps = [
    'Открой вкладку «Все задачи» — свободные задачи подсвечены зелёным',
    'Нажми «Взяться за задачу», затем «Начать работу»',
    'Отметь чек-лист и добавь фото (камера или галерея)',
    'Отправь результат на проверку руководителю',
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-amber-600" />
          <div className="text-xs uppercase tracking-wider text-amber-600 font-black">Учебный режим</div>
        </div>
        <div className="p-5 space-y-4">
          <h2 className="text-lg font-black text-slate-900">Как работать с приложением</h2>
          <ol className="space-y-3 text-sm text-slate-700">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#168BEA] text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-2xl bg-[#168BEA] text-white font-bold text-sm"
            >
              Понятно, начать
            </button>
            <button
              onClick={logout}
              className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ КОРНЕВОЙ КОМПОНЕНТ ============
const AppContent: React.FC = () => {
  const { authMode, toastMessage } = useApp();
  const [showTraining, setShowTraining] = useState(true);

  // Показывать обучающий экран заново при каждом входе в демо-режим
  useEffect(() => {
    if (authMode === 'demo') setShowTraining(true);
  }, [authMode]);

  // Экран входа — когда сессии нет
  if (authMode === null) {
    return <LoginScreen />;
  }

  // Панель руководителя — только для роли manager
  if (authMode === 'manager') {
    return <ManagerView />;
  }

  // Панель работника (обычный вход ИЛИ демо-режим)
  return (
    <>
      <WorkerView isDemo={authMode === 'demo'} />
      {authMode === 'demo' && showTraining && (
        <TrainingModal onClose={() => setShowTraining(false)} />
      )}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2.5 text-xs backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
