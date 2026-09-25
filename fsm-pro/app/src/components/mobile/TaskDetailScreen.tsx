import React, { useState } from 'react';
import { Task } from '../../types';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, MapPin, Phone, User, FileText, MessageSquare, Camera, ListChecks, CheckCircle2, PlayCircle, Clock, Navigation, AlertTriangle } from 'lucide-react';

interface Props {
  task: Task;
  onBack: () => void;
  onStartWork: () => void;
}

const fmtDateTime = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return (
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' в ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
};

export const TaskDetailScreen: React.FC<Props> = ({ task, onBack, onStartWork }) => {
  const { updateTaskStatus, showToast, recordArrival, currentUser, takeTask } = useApp();
  const [isFixingLocation, setIsFixingLocation] = useState(false);

  const isMine = task.assignedUserId === currentUser.id;
  const isFree = !task.assignedUserId;
  const isOthers = !isMine && !isFree; // выполняет другой мастер — только просмотр

  // «Начать работу» — фиксируем дату и время старта (статус «В работе»).
  const handleStartWork = () => {
    if (!isMine) return;
    if (task.status !== 'in_progress') {
      updateTaskStatus(task.id, 'in_progress', 'Мастер приступил к работе');
      showToast('Зафиксировано время начала работы');
    }
    onStartWork();
  };

  // Взять свободную задачу себе
  const handleTakeTask = () => {
    takeTask(task.id);
    showToast('Задача ваша — нажмите «Начать работу»');
  };

  // «Я на объекте» — одной кнопкой фиксируем GPS и время прибытия
  const handleArrival = async () => {
    setIsFixingLocation(true);
    await recordArrival(task.id);
    setIsFixingLocation(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F4F7FA]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <div className="text-xs text-slate-400">{task.number}</div>
          <div className="text-sm font-bold text-slate-900">{task.title}</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Баннер «на доработке» — мастер сразу видит, что вернул диспетчер */}
        {task.needsRework && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-black text-red-700">Вернуто на доработку</span>
            </div>
            <div className="text-sm text-red-800 leading-relaxed">
              {task.reworkComment || 'Доработайте отчёт и отправьте повторно'}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Адрес</span>
          </div>
          <div className="text-sm text-slate-900">{task.address.full}</div>

          {/* Кнопка «Я на объекте»: GPS + время одной кнопкой — только для своей задачи */}
          {isMine && !task.arrivalAt ? (
            <button
              onClick={handleArrival}
              disabled={isFixingLocation}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#168BEA]/10 text-[#168BEA] text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <Navigation className="w-4 h-4" />
              {isFixingLocation ? 'Определяю местоположение...' : 'Я на объекте — зафиксировать'}
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
              <Navigation className="w-4 h-4 shrink-0" />
              Прибытие зафиксировано: {fmtDateTime(task.arrivalAt)} · GPS приложен к задаче
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Клиент</span>
          </div>
          <div className="text-sm text-slate-900">{task.customer.name}</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Телефон</span>
          </div>
          <a href={`tel:${task.customer.phone}`} className="text-sm text-[#168BEA] font-bold">
            {task.customer.phone}
          </a>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Описание</span>
          </div>
          <div className="text-sm text-slate-700">{task.description}</div>
        </div>

        {task.dispatcherComment && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-500">Комментарий диспетчера</span>
            </div>
            <div className="text-sm text-slate-700">{task.dispatcherComment}</div>
          </div>
        )}

        {task.photos.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-4 h-4 text-[#168BEA]" />
              <span className="text-xs font-bold text-slate-500">Фото ({task.photos.length})</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {task.photos.map(photo => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt=""
                  className="w-20 h-20 object-cover rounded-xl shrink-0"
                />
              ))}
            </div>
          </div>
        )}

        {task.checklist.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-4 h-4 text-[#168BEA]" />
              <span className="text-xs font-bold text-slate-500">
                Чек-лист ({task.checklist.filter(c => c.isCompleted).length}/{task.checklist.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {task.checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  {item.isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-[#2CCB70] shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                  )}
                  <span className={item.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}>
                    {item.title}
                  </span>
                  {item.isRequired && <span className="text-[10px] text-amber-500 font-bold">обяз.</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Фиксация времени начала работы */}
        {task.actualStart && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700">Начало работы зафиксировано</span>
            </div>
            <div className="text-sm font-bold text-emerald-800">{fmtDateTime(task.actualStart)}</div>
          </div>
        )}

        {/* ===== КНОПКИ ДЕЙСТВИЙ — по статусу и принадлежности ===== */}
        {isOthers && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
            <div className="text-sm font-bold text-slate-500">
              Задача другого мастера — только просмотр
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Выполняет: {task.assignedUser?.fullName || '—'}
            </div>
          </div>
        )}

        {isFree && (
          <button
            onClick={handleTakeTask}
            className="w-full bg-[#2CCB70] text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-green-500/25 flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" />
            Взяться за задачу
          </button>
        )}

        {isMine && (task.status === 'new' || task.status === 'assigned') && (
          <button
            onClick={handleStartWork}
            className="w-full bg-[#168BEA] text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" />
            Начать работу
          </button>
        )}

        {isMine && task.status === 'in_progress' && (
          <button
            onClick={handleStartWork}
            className="w-full bg-[#168BEA] text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" />
            Продолжить работу
          </button>
        )}

        {isMine && task.status === 'under_review' && (
          <div className="w-full bg-slate-100 border border-slate-200 text-slate-400 font-bold py-4 rounded-2xl text-center text-sm select-none">
            Отправлено на проверку — ждём руководителя
          </div>
        )}

        {(isMine || isOthers) && task.status === 'completed' && (
          <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-4 rounded-2xl text-center text-sm select-none">
            Задача завершена и принята руководителем
          </div>
        )}
      </div>
    </div>
  );
};
