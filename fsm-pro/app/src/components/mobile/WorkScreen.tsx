import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { compressImage, pickPhoto } from '../../utils/image';
import {
  ArrowLeft, Camera, MessageSquare, Send, CheckCircle2, X, Plus, Trash2, ListChecks,
  AlertTriangle, Image as ImageIcon, Zap,
} from 'lucide-react';

interface Props {
  task: Task;
  onBack: () => void;
  onDone: () => void;
}

// Типовые ситуации — вместо набора текста. Один тап = готовый комментарий.
const QUICK_REASONS = [
  'Всё сделано, фото прилагаю',
  'Требуются материалы',
  'Нет доступа на объект',
  'Клиент перенёс время',
  'Обнаружен дефект, нужна помощь',
  'Работа частично выполнена',
];

export const WorkScreen: React.FC<Props> = ({ task, onBack, onDone }) => {
  const {
    addPhoto, deletePhoto, updateTaskStatus, showToast, authMode,
    toggleChecklistItem, addChecklistItem, removeChecklistItem,
  } = useApp();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [newItem, setNewItem] = useState('');
  const isDemo = authMode === 'demo';

  // Добавление фото: камера или галерея + сжатие
  const handleAddPhoto = async (fromCamera: boolean) => {
    try {
      const file = await pickPhoto(fromCamera);
      if (!file) return;
      setIsProcessingPhoto(true);
      const prepared = await compressImage(file);
      addPhoto(task.id, {
        taskId: task.id,
        url: prepared.dataUrl,
        category: 'result',
        comment: '',
        fileSizeKb: prepared.sizeKb,
      });
      showToast('Фото добавлено (сжато до ' + prepared.sizeKb + ' КБ)');
    } catch (e) {
      showToast('Не удалось загрузить фото. Попробуйте другое изображение.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    updateTaskStatus(task.id, 'under_review', comment || 'Работа выполнена, отправлено на проверку');
    showToast('Отправлено на проверку');
    setIsSubmitting(false);
    onDone();
  };

  // Чипс добавляет типовой текст (не заменяет уже написанное)
  const applyQuickReason = (text: string) => {
    setComment((prev) => (prev.trim() ? prev.trim() + '. ' + text : text));
  };

  const doneCount = task.checklist.filter((c) => c.isCompleted).length;

  return (
    <div className="h-full overflow-y-auto bg-[#F4F7FA]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <div className="text-xs text-amber-600 font-bold">ВЫПОЛНЕНИЕ</div>
          <div className="text-sm font-bold text-slate-900">{task.number}</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isDemo && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-amber-600 font-bold mb-1">Учебный режим</div>
            <div className="text-sm text-amber-800">Выполни работу и отправь на проверку</div>
          </div>
        )}

        {/* ===== БАННЕР «НА ДОРАБОТКЕ» ===== */}
        {task.needsRework && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-black text-red-700">Диспетчер вернул отчёт на доработку</span>
            </div>
            <div className="text-sm text-red-800 leading-relaxed">
              {task.reworkComment || 'Доработайте отчёт и отправьте повторно'}
            </div>
          </div>
        )}

        {/* ===== ЧЕК-ЛИСТ (крупные пункты под палец) ===== */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[#168BEA]" />
              <span className="text-xs font-bold text-slate-500">Чек-лист работ</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doneCount === task.checklist.length && task.checklist.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {doneCount}/{task.checklist.length}
            </span>
          </div>

          {task.checklist.length === 0 && (
            <div className="text-xs text-slate-400 py-2">Чек-лист пуст — добавьте пункты ниже.</div>
          )}

          <div className="space-y-2">
            {task.checklist.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleChecklistItem(task.id, item.id)}
                className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 text-left active:scale-[0.98] transition-all ${
                  item.isCompleted
                    ? 'bg-emerald-50 border-[#2CCB70]'
                    : 'bg-slate-50 border-slate-200 hover:border-[#168BEA]'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                    item.isCompleted ? 'bg-[#2CCB70] border-[#2CCB70]' : 'border-slate-300 bg-white'
                  }`}
                >
                  {item.isCompleted && <CheckCircle2 className="w-5 h-5 text-white" />}
                </span>
                <span className={`flex-1 text-[15px] font-medium leading-snug ${item.isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {item.title}
                  {item.isRequired && <span className="ml-1.5 text-[10px] text-amber-500 font-bold">обяз.</span>}
                </span>
              </button>
            ))}
          </div>

          {/* Добавить свой пункт (необязательно) */}
          <div className="mt-3 flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim()) {
                  addChecklistItem(task.id, newItem);
                  setNewItem('');
                }
              }}
              placeholder="Добавить свой пункт (необязательно)..."
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#168BEA]"
            />
            <button
              onClick={() => {
                if (newItem.trim()) {
                  addChecklistItem(task.id, newItem);
                  setNewItem('');
                }
              }}
              className="px-3 py-2.5 rounded-xl bg-[#168BEA] text-white font-bold flex items-center gap-1 active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ===== ФОТО ===== */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Фото ({task.photos.length})</span>
          </div>

          {task.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {task.photos.map((photo) => (
                <div key={photo.id} className="relative shrink-0">
                  <img src={photo.url} alt="" className="w-24 h-24 object-cover rounded-xl" />
                  <div className="absolute top-1 left-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                  <button
                    onClick={() => deletePhoto(task.id, photo.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isProcessingPhoto ? (
            <div className="w-full border-2 border-dashed border-[#168BEA] bg-blue-50/50 rounded-2xl p-5 text-center">
              <div className="text-sm font-bold text-[#168BEA]">Обрабатываю фото...</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddPhoto(true)}
                className="border-2 border-dashed border-[#168BEA] bg-[#168BEA]/5 rounded-2xl p-4 text-center active:scale-[0.98] transition-transform hover:border-[#168BEA]"
              >
                <Camera className="w-7 h-7 text-[#168BEA] mx-auto mb-1.5" />
                <div className="text-sm font-bold text-[#168BEA]">Сделать фото</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Камера телефона</div>
              </button>
              <button
                onClick={() => handleAddPhoto(false)}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center active:scale-[0.98] transition-transform hover:border-[#2CCB70]"
              >
                <ImageIcon className="w-7 h-7 text-[#2CCB70] mx-auto mb-1.5" />
                <div className="text-sm font-bold text-slate-700">Из галереи</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Выбрать готовое</div>
              </button>
            </div>
          )}
        </div>

        {/* ===== КОММЕНТАРИЙ: КНОПКИ ВМЕСТО ТЕКСТА ===== */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-[#168BEA]" />
            <span className="text-xs font-bold text-slate-500">Быстрый комментарий — просто нажми</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => applyQuickReason(r)}
                className="px-3 py-2 rounded-xl bg-[#168BEA]/10 text-[#168BEA] text-xs font-bold active:scale-95 transition-transform hover:bg-[#168BEA]/20"
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500">Или допиши своими словами (необязательно)</span>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий..."
            className="w-full h-20 text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none border border-slate-100 rounded-xl p-2.5"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-[#2CCB70] text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-green-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Send className="w-5 h-5" />
          {isSubmitting ? 'Отправка...' : 'Отправить на проверку'}
        </button>
      </div>
    </div>
  );
};
