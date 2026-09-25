import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../shared/Avatar';
import { compressImage, pickPhoto } from '../../utils/image';
import { X, Camera, Save, Info } from 'lucide-react';

/**
 * ProfileModal — профиль мастера (минималистичный).
 * Карточку создаёт администратор (имя, телефон, код), а аватарку,
 * «о себе» и возраст мастер оформляет сам. Руководитель видит, но не правит.
 */
export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, updateMyProfile } = useApp();
  const [about, setAbout] = useState(currentUser.about || '');
  const [age, setAge] = useState(currentUser.age || '');
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [isSaving, setIsSaving] = useState(false);

  const handlePickAvatar = async () => {
    try {
      const file = await pickPhoto(false);
      if (!file) return;
      const { dataUrl } = await compressImage(file, 320, 0.85);
      setAvatar(dataUrl);
    } catch {
      // ignore
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    updateMyProfile({
      about: about.trim(),
      age: age.trim(),
      avatar,
    });
    setTimeout(onClose, 400);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Шапка */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="text-base font-black text-slate-900">Мой профиль</div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Аватар */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <Avatar user={{ ...currentUser, avatar }} size={96} className="shadow-lg" />
              <button
                onClick={handlePickAvatar}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#168BEA] text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform border-2 border-white"
                title="Сменить фото"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm font-bold text-slate-900 mt-3">{currentUser.fullName}</div>
            <div className="text-xs text-slate-400">{currentUser.phone}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {currentUser.specializations.join(' · ')}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Имя, телефон и специализации задаёт руководитель
            </div>
          </div>

          {/* Возраст */}
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Возраст</label>
            <input
              type="text"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Например: 34"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#168BEA]"
            />
          </div>

          {/* О себе */}
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">О себе</label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Пара слов: опыт, что умею, как работать со мной..."
              className="w-full h-24 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm resize-none outline-none focus:ring-2 focus:ring-[#168BEA]"
            />
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Руководитель видит ваш профиль, но эти поля редактируете только вы.</span>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#2CCB70] text-white font-bold py-3.5 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-green-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};
