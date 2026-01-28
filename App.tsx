import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { opaService } from './services/opaService';
import { Ticket, Attendant, AppConfig } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
  const [config, setConfig] = useState<AppConfig>({ apiUrl: '', apiToken: '' });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loading, setLoading] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch Config from Database on Load
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setConfig({
            apiUrl: data.api_url || '',
            apiToken: data.api_token || ''
          });
        }
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      } finally {
        setConfigLoaded(true);
      }
    };
    fetchConfig();
  }, []);

  // Data fetching logic
  const refreshData = useCallback(async () => {
    // Wait for config to be loaded
    if (!configLoaded) return;
    
    // Only show loading on initial fetch or settings change, not polling
    if (tickets.length === 0) setLoading(true);
    
    try {
      const data = await opaService.fetchData(config);
      setTickets(data.tickets);
      setAttendants(data.attendants);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  }, [config, tickets.length, configLoaded]);

  // Initial fetch and polling interval
  useEffect(() => {
    if (configLoaded) {
      refreshData();
      const intervalId = setInterval(refreshData, 30000); // Update every 30 seconds
      return () => clearInterval(intervalId);
    }
  }, [refreshData, configLoaded]);

  const handleSaveConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    // Refresh logic will pick up the change due to dependency array
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30">
      
      {/* Mobile Overlay Background */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none z-0"></div>

      <Sidebar currentView={currentView} onChangeView={setCurrentView} />

      <main className="md:pl-64 transition-all duration-300 relative z-10">
        <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white capitalize">
            {currentView === 'dashboard' ? 'Monitoramento' : 'Painel Administrativo'}
          </h1>
          <div className="flex items-center gap-3">
             {loading && <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-pulse"></span>}
             <span className="text-xs text-slate-500 font-mono hidden sm:block">
               Atualizado: {lastUpdate.toLocaleTimeString()}
             </span>
          </div>
        </header>

        <div className="p-6 max-w-[1920px] mx-auto">
          {!configLoaded ? (
             <div className="flex items-center justify-center h-[60vh]">
               <p className="text-slate-500">Conectando ao sistema...</p>
             </div>
          ) : loading && tickets.length === 0 ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="flex flex-col items-center gap-4">
                 <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
                 <p className="text-slate-500 animate-pulse">Carregando dados...</p>
              </div>
            </div>
          ) : (
            <>
              {currentView === 'dashboard' && (
                <Dashboard tickets={tickets} attendants={attendants} />
              )}
              {currentView === 'settings' && (
                <Settings config={config} onSave={handleSaveConfig} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;