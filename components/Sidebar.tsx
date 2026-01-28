import React from 'react';
import { LayoutDashboard, Settings, Activity } from 'lucide-react';

interface SidebarProps {
  currentView: 'dashboard' | 'settings';
  onChangeView: (view: 'dashboard' | 'settings') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  return (
    <div className="w-20 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300">
      <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b border-slate-800">
        <Activity className="w-8 h-8 text-sky-500" />
        <span className="ml-3 text-xl font-bold text-white hidden md:block tracking-tight">Opa<span className="text-sky-500">Suite</span></span>
      </div>

      <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
        <button
          onClick={() => onChangeView('dashboard')}
          className={`flex items-center p-3 rounded-lg transition-colors group ${
            currentView === 'dashboard' 
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/20' 
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="ml-3 font-medium hidden md:block">Dashboard</span>
        </button>

        <button
          onClick={() => onChangeView('settings')}
          className={`flex items-center p-3 rounded-lg transition-colors group ${
            currentView === 'settings' 
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/20' 
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings className="w-6 h-6" />
          <span className="ml-3 font-medium hidden md:block">Configurações</span>
        </button>
      </nav>

      <div className="p-4 border-t border-slate-800 hidden md:block">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Versão 1.0.0</p>
          <p className="text-xs text-slate-500 mt-1">Conectado</p>
        </div>
      </div>
    </div>
  );
};
