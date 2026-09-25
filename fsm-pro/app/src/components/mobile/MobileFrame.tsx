import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TaskListScreen } from './TaskListScreen';
import { HelpScreen } from './HelpScreen';
import { ChatScreen } from './ChatScreen';
import { TaskDetailScreen } from './TaskDetailScreen';
import { WorkScreen } from './WorkScreen';
import { ClipboardList, HelpCircle, MessageSquare, LayoutGrid } from 'lucide-react';

type MobileScreen = 'list' | 'detail' | 'work';
type MainTab = 'all' | 'mine' | 'chat' | 'help';

export const MobileFrame: React.FC = () => {
  const { activeTaskId, setActiveTaskId, activeTask, notificationsCount } = useApp();
  const [currentScreen, setCurrentScreen] = useState<MobileScreen>('list');
  const [mainTab, setMainTab] = useState<MainTab>('all');

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId);
    setCurrentScreen('detail');
  };

  const tabs: { key: MainTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'all', label: 'Все задачи', icon: <LayoutGrid className="w-5 h-5" /> },
    { key: 'mine', label: 'Мои', icon: <ClipboardList className="w-5 h-5" /> },
    { key: 'chat', label: 'Чат', icon: <MessageSquare className="w-5 h-5" />, badge: notificationsCount },
    { key: 'help', label: 'Помощь', icon: <HelpCircle className="w-5 h-5" /> },
  ];

  return (
    <div className="w-full h-full min-h-[calc(100vh-80px)]">
      <div className="w-full h-full bg-[#F4F7FA] overflow-hidden flex flex-col relative select-none">
        <div className="flex-1 overflow-hidden relative">
          {mainTab === 'help' && <HelpScreen />}
          {mainTab === 'chat' && <ChatScreen />}

          {(mainTab === 'all' || mainTab === 'mine') && currentScreen === 'list' && (
            <TaskListScreen
              onSelectTask={handleSelectTask}
              mode={mainTab === 'mine' ? 'mine' : 'all'}
            />
          )}

          {(mainTab === 'all' || mainTab === 'mine') && currentScreen === 'detail' && activeTask && (
            <TaskDetailScreen
              task={activeTask}
              onBack={() => setCurrentScreen('list')}
              onStartWork={() => setCurrentScreen('work')}
            />
          )}

          {(mainTab === 'all' || mainTab === 'mine') && currentScreen === 'work' && activeTask && (
            <WorkScreen
              task={activeTask}
              onBack={() => setCurrentScreen('detail')}
              onDone={() => setCurrentScreen('list')}
            />
          )}
        </div>

        <nav className="shrink-0 bg-white border-t border-slate-200 px-2 py-2 flex items-center justify-around gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setMainTab(tab.key);
                setCurrentScreen('list');
              }}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl transition-all active:scale-95 ${
                mainTab === tab.key ? 'text-[#168BEA]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-bold">{tab.label}</span>
              {tab.badge && tab.badge > 0 && (
                <span className="absolute top-0 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};
