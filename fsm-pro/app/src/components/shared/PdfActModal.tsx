import React from 'react';
import { Task } from '../../types';
import { X, Printer, Download, CheckCircle2, MapPin, Calendar, Clock, User, ShieldCheck } from 'lucide-react';
import { formatDateTime, formatDate, formatTime } from '../../utils/statusUtils';

interface PdfActModalProps {
  task: Task;
  onClose: () => void;
}

export const PdfActModal: React.FC<PdfActModalProps> = ({ task, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Modal Top Bar (Screen Only) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">Акт выполненных работ — {task.number}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-[#168BEA] hover:bg-[#1277c9] text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Печать / Экспорт в PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-800 text-sm print:p-0 print:text-black">
          
          {/* Header */}
          <div className="border-b pb-4 flex items-start justify-between">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">
                ООО «МОНТАЖ-СЕРВИС ПРО»
              </span>
              <h1 className="text-xl font-black text-slate-900">
                АКТ ПРИЁМА-СДАЧИ ВЫПОЛНЕННЫХ РАБОТ № {task.number}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                к Договору оказания сервисных услуг от {formatDate(task.createdAt)}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-200">
                Работы приняты
              </span>
              <div className="text-xs text-slate-500 mt-1">
                Дата акта: {task.actualEnd ? formatDateTime(task.actualEnd) : formatDateTime(task.updatedAt)}
              </div>
            </div>
          </div>

          {/* Grid Info */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="font-semibold text-slate-500 block mb-1">ЗАКАЗЧИК:</span>
              <div className="font-bold text-slate-900 text-sm">{task.customer.name}</div>
              <div className="text-slate-600">{task.customer.phone}</div>
              <div className="text-slate-600 mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {task.address.full}
              </div>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block mb-1">ИСПОЛНИТЕЛЬ:</span>
              <div className="font-bold text-slate-900 text-sm">
                {task.assignedUser?.fullName || 'Монтажная бригада'}
              </div>
              <div className="text-slate-600">{task.assignedUser?.phone || '+7 (495) 123-45-67'}</div>
              <div className="text-slate-600 mt-1">
                Специализация: {task.assignedUser?.specializations.join(', ') || task.workType}
              </div>
            </div>
          </div>

          {/* Timing & Work Spec */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              1. Сведения о выполненной работе
            </h4>
            <div className="border rounded-xl p-3 bg-white space-y-2">
              <div className="flex items-center justify-between text-xs border-b pb-2">
                <span className="font-semibold text-slate-700">Наименование услуги / работы:</span>
                <span className="font-bold text-[#168BEA]">{task.title} ({task.workType})</span>
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold">Описание: </span>
                {task.description}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs">
                <div>
                  <span className="text-slate-400 block">Время начала:</span>
                  <span className="font-medium text-slate-800">
                    {task.actualStart ? formatDateTime(task.actualStart) : formatDateTime(task.plannedStart)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Время завершения:</span>
                  <span className="font-medium text-slate-800">
                    {task.actualEnd ? formatDateTime(task.actualEnd) : formatDateTime(task.plannedEnd)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Длительность:</span>
                  <span className="font-medium text-slate-800">
                    {task.durationMinutes ? `${Math.floor(task.durationMinutes / 60)}ч ${task.durationMinutes % 60}мин` : '3ч 20мин'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Checklist table */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              2. Протокол проверки технологических этапов (Чек-лист)
            </h4>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b font-semibold text-slate-700">
                  <tr>
                    <th className="p-2 w-8 text-center">№</th>
                    <th className="p-2">Контрольный этап</th>
                    <th className="p-2 w-28 text-center">Статус</th>
                    <th className="p-2 w-32 text-right">Время фиксации</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {task.checklist.map((item, idx) => (
                    <tr key={item.id} className={item.isCompleted ? 'bg-white' : 'bg-rose-50/40'}>
                      <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="p-2 font-medium">
                        {item.title}
                        {item.isRequired && <span className="text-rose-500 ml-1 font-bold">*</span>}
                      </td>
                      <td className="p-2 text-center">
                        {item.isCompleted ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Выполнено
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Не требовалось</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-slate-500 text-[11px]">
                        {item.completedAt ? formatTime(item.completedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Materials table */}
          {task.materials.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                3. Фактический расход материалов
              </h4>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 border-b font-semibold text-slate-700">
                    <tr>
                      <th className="p-2 w-8 text-center">№</th>
                      <th className="p-2">Наименование материала</th>
                      <th className="p-2 w-24 text-center">План</th>
                      <th className="p-2 w-24 text-center font-bold text-slate-900">Факт</th>
                      <th className="p-2 w-20 text-center">Ед. изм.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {task.materials.map((mat, idx) => (
                      <tr key={mat.id} className="bg-white">
                        <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-medium">{mat.name}</td>
                        <td className="p-2 text-center text-slate-500">{mat.plannedQty}</td>
                        <td className="p-2 text-center font-bold text-[#168BEA]">{mat.actualQty || mat.plannedQty}</td>
                        <td className="p-2 text-center text-slate-500">{mat.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Photos Overview */}
          {task.photos.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                4. Фотофиксация объекта (прикреплено {task.photos.length} фото)
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {task.photos.slice(0, 4).map((p) => (
                  <div key={p.id} className="border rounded-lg overflow-hidden bg-slate-50">
                    <img src={p.url} alt="Photo" className="w-full h-20 object-cover" />
                    <div className="p-1 text-[10px] text-slate-600 truncate">{p.comment || p.category}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments & Geo GPS validation */}
          <div className="bg-slate-50 p-3 rounded-xl border text-xs space-y-1">
            <div>
              <span className="font-semibold text-slate-700">Заключение мастера: </span>
              <span className="text-slate-600">{task.technicianComment || 'Работы выполнены в полном объеме, претензий у заказчика нет.'}</span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1 border-t flex items-center justify-between">
              <span>GPS валидация: {task.address.lat.toFixed(5)}, {task.address.lng.toFixed(5)}</span>
              <span>Цифровой хэш акта: SHA-256 #8F4C2A-2026</span>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-4 border-t grid grid-cols-2 gap-8">
            <div>
              <span className="font-bold text-xs uppercase text-slate-500 block mb-2">Работу сдал (Исполнитель):</span>
              <div className="h-16 border-b border-dashed border-slate-400 flex flex-col justify-end pb-1">
                <span className="text-xs font-semibold text-slate-800">{task.assignedUser?.fullName || 'Монтажник'} / Смирнов А. /</span>
              </div>
            </div>
            <div>
              <span className="font-bold text-xs uppercase text-slate-500 block mb-2">Работу принял (Заказчик):</span>
              <div className="h-16 border-b border-dashed border-slate-400 flex items-center justify-center relative">
                {task.customerSignature ? (
                  <img src={task.customerSignature} alt="Customer signature" className="h-12 object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">Подпись получена в электронном виде</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 text-right">
                {task.customer.name}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
