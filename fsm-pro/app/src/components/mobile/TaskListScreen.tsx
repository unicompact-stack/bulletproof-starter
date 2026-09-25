import React from 'react';
import { useApp } from '../../context/AppContext';
import { MapPin, Phone, Clock, AlertTriangle, Hand, User } from 'lucide-react';
import { Task } from '../../types';

interface Props {
  onSelectTask: (taskId: string) => void;
  mode: 'all' | 'mine';
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  assigned: 'Назначена',
  in_progress: 'В работе',
  under_review: 'На проверке',
  completed: 'Завершена',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700',
  assigned: 'bg-violet-100 text-violet-700',
  in_progress: 'bg-sky-100 text-sky-700',
  under_review: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

// Карточка задачи (общая для всех групп).
// Свободные задачи — лёгкая зелёная подсветка + метка «Новая» (сразу видно).
const TaskCard: React.FC<{ task: Task; onSelect: (id: string) => void; showAction: boolean }> = ({ task, onSelect, showAction }) => {
  const { currentUser, takeTask } = useApp();
  const isMine = task.assignedUserId === currentUser.id;
  const isFree = !task.assignedUserId;

  return (
    <div
      className={`w-full bg-white rounded-2xl p-4 text-left border transition-colors shadow-sm ${
        isFree
          ? 'border-emerald-300 bg-emerald-50/60'   // свободная (новая) — зелёная
          : 'border-slate-100'                       // занята другим — обычная
      }`}
    >
      <button onClick={() => onSelect(task.id)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-xs font-bold text-slate-400">{task.number}</div>
          {isFree ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2CCB70] text-white">
              Новая
            </span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
          )}
        </div>

        <div className="text-sm font-bold text-slate-900 mb-2">{task.title}</div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">{task.address.full}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>{task.customer.phone}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{task.customer.name}</span>
        </div>

        {task.isOverdue && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Просрочена</span>
          </div>
        )}

        {task.needsRework && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Вернули на доработку — доработай и отправь снова</span>
          </div>
        )}
      </button>

      {showAction && (
        <div className="mt-3 pt-3 border-t border-emerald-200/60">
          {isFree ? (
            <button
              onClick={() => takeTask(task.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#2CCB70] text-white text-xs font-bold active:scale-[0.98] transition-transform shadow-sm shadow-green-500/20"
            >
              <Hand className="w-3.5 h-3.5" />
              Взяться за задачу
            </button>
          ) : (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${isMine ? 'text-[#168BEA]' : 'text-slate-500'}`}>
              <User className="w-3.5 h-3.5" />
              {isMine ? 'Выполняете вы' : `Выполняет: ${task.assignedUser?.fullName || '—'}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TaskListScreen: React.FC<Props> = ({ onSelectTask, mode }) => {
  const { tasks, currentUser } = useApp();

  // «Мои задачи» — только закреплённые за текущим работником
  if (mode === 'mine') {
    const myTasks = tasks.filter((t) => t.assignedUserId === currentUser.id);

    return (
      <div className="h-full overflow-y-auto bg-[#F4F7FA]">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-lg font-black text-slate-900">Мои задачи</h1>
          <p className="text-xs text-slate-500 mt-1">{myTasks.length} задач закреплено за вами</p>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {myTasks.length === 0 && (
            <div className="text-center py-10 px-4 bg-white rounded-2xl border border-slate-100">
              <div className="text-3xl mb-2">👋</div>
              <div className="text-sm font-bold text-slate-900">
                {tasks.some((t) => t.assignedUserId === currentUser.id)
                  ? 'Пока нет закреплённых задач'
                  : 'Вы новый работник'}
              </div>
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                Перейдите во вкладку «Все задачи» и возьмите свободную —
                она подсвечена зелёным.
              </div>
            </div>
          )}

          {myTasks.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={onSelectTask} showAction={false} />
          ))}
        </div>
      </div>
    );
  }

  // «Все задачи» — витрина: ТОЛЬКО свободные и чужие (своих здесь нет — они во вкладке «Мои»)
  const others = tasks.filter((t) => t.assignedUserId !== currentUser.id && t.status !== 'completed');
  const free = others.filter((t) => !t.assignedUserId);
  const taken = others.filter((t) => t.assignedUserId);

  return (
    <div className="h-full overflow-y-auto bg-[#F4F7FA]">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-black text-slate-900">Все задачи</h1>
        <p className="text-xs text-slate-500 mt-1">
          {free.length} свободных (зелёные) · {taken.length} у других мастеров
        </p>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Свободные задачи — можно взять */}
        {free.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#2CCB70]" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Свободные — можно взять</span>
            </div>
            <div className="space-y-3">
              {free.map((task) => (
                <TaskCard key={task.id} task={task} onSelect={onSelectTask} showAction />
              ))}
            </div>
          </div>
        )}

        {/* Чужие задачи — просто видно, кто чем занят */}
        {taken.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">У других мастеров</span>
            </div>
            <div className="space-y-3">
              {taken.map((task) => (
                <TaskCard key={task.id} task={task} onSelect={onSelectTask} showAction />
              ))}
            </div>
          </div>
        )}

        {others.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">Свободных и чужих задач нет</div>
        )}
      </div>
    </div>
  );
};
