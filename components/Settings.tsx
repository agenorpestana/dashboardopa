import React, { useState, useEffect } from 'react';
import { Save, Server, Key, Info, Lock } from 'lucide-react';
import { AppConfig } from '../types';
import { LoginModal } from './LoginModal';

interface SettingsProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void; // Used to update local state in App
}

export const Settings: React.FC<SettingsProps> = ({ config, onSave }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  
  // Credentials used to authorize the save request
  const [authCreds, setAuthCreds] = useState({ username: '', password: '' });

  const [url, setUrl] = useState(config.apiUrl);
  const [token, setToken] = useState(config.apiToken);
  const [apiLogin, setApiLogin] = useState(config.apiLogin || '');
  const [apiPassword, setApiPassword] = useState(config.apiPassword || '');
  const [mongoUrl, setMongoUrl] = useState(config.mongo_url || '');
  const [mongoEnabled, setMongoEnabled] = useState(!!config.mongo_enabled);
  const [localFilesPath, setLocalFilesPath] = useState(config.local_files_path || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Update local state if props change (loading from DB)
  useEffect(() => {
    setUrl(config.apiUrl);
    setToken(config.apiToken);
    if (config.apiLogin) setApiLogin(config.apiLogin);
    if (config.apiPassword) setApiPassword(config.apiPassword);
    setMongoUrl(config.mongo_url || '');
    setMongoEnabled(!!config.mongo_enabled);
    setLocalFilesPath(config.local_files_path || '');
  }, [config]);

  const handleLoginSuccess = (user: string, pass: string) => {
    setAuthCreds({ username: user, password: pass });
    setIsAuthenticated(true);
    setShowLogin(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authCreds.username,
          password: authCreds.password,
          api_url: url,
          api_token: token,
          api_login: apiLogin,
          api_password: apiPassword,
          mongo_url: mongoUrl,
          mongo_enabled: mongoEnabled,
          local_files_path: localFilesPath
        })
      });

      if (res.ok) {
        setMessage('Configurações salvas e aplicadas!');
        onSave({ 
          apiUrl: url, 
          apiToken: token, 
          apiLogin, 
          apiPassword,
          mongo_url: mongoUrl,
          mongo_enabled: mongoEnabled,
          local_files_path: localFilesPath
        });
      } else {
        setMessage('Erro ao salvar. Verifique suas credenciais.');
      }
    } catch (error) {
      setMessage('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="bg-slate-800 p-6 rounded-full">
           <Lock className="w-12 h-12 text-slate-500" />
        </div>
        <h2 className="text-2xl font-bold text-white">Acesso Bloqueado</h2>
        <p className="text-slate-400 max-w-md">
          As configurações são protegidas. É necessário fazer login para visualizar ou alterar os dados de conexão.
        </p>
        <button 
          onClick={() => setShowLogin(true)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-lg font-medium"
        >
          Fazer Login
        </button>
        
        <LoginModal 
          isOpen={showLogin} 
          onClose={() => {}} // Can't close without logging in or switching view via sidebar
          onLoginSuccess={handleLoginSuccess} 
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Configurações de Conexão</h2>
          <p className="text-slate-400">Configure a conexão com a API do Opa Suite para alimentar o dashboard.</p>
        </div>
        <div className="text-right text-sm">
           <p className="text-emerald-400 font-medium">Logado como: {authCreds.username}</p>
           <button onClick={() => setIsAuthenticated(false)} className="text-slate-500 hover:text-white underline mt-1">Sair</button>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl">
        <div className="space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-500" />
              URL do Provedor (API)
            </label>
            <div className="relative">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.opasuite.com.br"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
            </div>
            <p className="text-xs text-slate-500 mt-2">A URL base da sua instância ou da API oficial.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              Token de Autenticação
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Ex: eyJ0eXAiOiJKV1QiLCJhbGci..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
             <p className="text-xs text-slate-500 mt-2">Token Bearer gerado no painel administrativo do Opa Suite.</p>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-lg font-medium text-white mb-4">Acesso de Proxy de Mídia (Opcional)</h3>
            <p className="text-sm text-slate-400 mb-4">Para conseguir carregar anexos diretamente no dashboard sem abrir outra aba, insira um usuário e senha com permissões no Opa Suite que será utilizado pelo servidor para gerar uma sessão e baixar os arquivos.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Login (E-mail ou Usuário)</label>
                <input
                  type="text"
                  value={apiLogin}
                  onChange={(e) => setApiLogin(e.target.value)}
                  placeholder="admin@provedor.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
                <input
                  type="password"
                  value={apiPassword}
                  onChange={(e) => setApiPassword(e.target.value)}
                  placeholder="******"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-lg font-medium text-white mb-4">Integração do Banco Opa Suite & Arquivos Locais (Download Direto)</h3>
            <p className="text-sm text-slate-400 mb-4">
              Caso seus arquivos de áudio (.mp3) estejam em uma instalação local (On-Premise) ou necessitem de consulta ao banco MongoDB para mapear o arquivo correspondente, configure os acessos abaixo. Isso permite reproduzir arquivos diretamente pelo painel sem redirecionamento para login.
            </p>
            
            <div className="flex items-center gap-3 mb-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
              <input
                type="checkbox"
                id="mongoEnabled"
                checked={mongoEnabled}
                onChange={(e) => setMongoEnabled(e.target.checked)}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-slate-700 bg-slate-900 rounded"
              />
              <label htmlFor="mongoEnabled" className="text-sm font-medium text-slate-300 select-none cursor-pointer">
                Ativar busca de anexo via conexão MongoDB do Opa Suite
              </label>
            </div>

            {mongoEnabled && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">String de Conexão MongoDB</label>
                  <input
                    type="text"
                    value={mongoUrl}
                    onChange={(e) => setMongoUrl(e.target.value)}
                    placeholder="mongodb://usuario:senha@localhost:27017/opasuite"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Conexão do MongoDB de onde o Opa Suite armazena a coleção "arquivos". Por exemplo: <code>mongodb://localhost:27017/opasuite</code></p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Caminho da Pasta "arquivos" no Servidor (Opcional)</label>
                  <input
                    type="text"
                    value={localFilesPath}
                    onChange={(e) => setLocalFilesPath(e.target.value)}
                    placeholder="Ex: /opt/opasuite"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Insira a pasta raiz do Opa Suite no servidor onde a subpasta "arquivos" reside. Se o dashboard rodar no mesmo host (ex: <code>/opt/opasuite</code> ou <code>/var/www/opasuite</code>), o áudio será lido instantaneamente do disco.</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-sky-900/20 border border-sky-900/50 rounded-lg p-4 flex gap-3">
             <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
             <div className="text-sm text-sky-200/80">
                <p className="font-semibold text-sky-400 mb-1">Como obter as credenciais:</p>
                <ol className="list-decimal pl-4 space-y-1">
                    <li>Acesse seu painel Opa Suite.</li>
                    <li>Vá em Configurações &gt; Integrações &gt; API.</li>
                    <li>Gere um novo token e copie os dados.</li>
                </ol>
             </div>
          </div>

        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className={`text-sm font-medium ${message.includes('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>
             {message}
          </p>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-sky-900/50 disabled:opacity-50 disabled:scale-100"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  );
};