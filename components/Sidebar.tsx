import React from 'react';
import { LayoutDashboard, Settings, Activity, ChevronLeft } from 'lucide-react';

interface SidebarProps {
  currentView: 'dashboard' | 'settings';
  onChangeView: (view: 'dashboard' | 'settings') => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isOpen, onToggle }) => {
  return (
    <div 
      className={`fixed left-0 top-0 h-screen bg-slate-900 border-r border-slate-800 flex flex-col z-50 transition-transform duration-300 w-64 shadow-2xl ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        <div className="flex items-center">
          <Activity className="w-8 h-8 text-sky-500" />
          <span className="ml-3 text-xl font-bold text-white tracking-tight">Opa<span className="text-sky-500">Suite</span></span>
        </div>
        
        {/* Botão para fechar a sidebar (setinha para esquerda) */}
        <button 
          onClick={onToggle}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Recolher menu"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
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
          <span className="ml-3 font-medium">Dashboard</span>
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
          <span className="ml-3 font-medium">Configurações</span>
        </button>
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Versão 1.1.0</p>
          <p className="text-xs text-slate-500 mt-1">Conectado</p>
        </div>
      </div>
    </div>
  );
};