import React, { useState } from 'react';
import { Lock, KeyRound, Mail, AlertCircle, ArrowLeft, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface AdminLoginGateProps {
  adminEmail: string;
  onLogin: (email: string, pass: string) => Promise<void>;
  onCancel: () => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({
  adminEmail,
  onLogin,
  onCancel,
}) => {
  const [email, setEmail] = useState(adminEmail || 'jricardosbd@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Por favor, introduza a palavra-passe.');
      return;
    }

    setIsLoading(true);
    try {
      await onLogin(email.trim(), password.trim());
      playSuccessChime();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais incorretas.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-md">
        {/* Lock Graphic */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 mb-3 shadow-inner">
            <Lock className="h-8 w-8" />
          </div>

          <h2 className="text-base font-bold uppercase tracking-wider text-white">
            Acesso Restrito ao Administrador
          </h2>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Apenas o administrador do sistema tem autorização para gerir operadores, tipos de avaria e importar ficheiros.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/80 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-1">
              <Mail className="h-3.5 w-3.5 text-amber-400" />
              <span>Email de Administrador</span>
            </label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@gmail.com ou admin"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-1">
              <KeyRound className="h-3.5 w-3.5 text-amber-400" />
              <span>Palavra-Passe</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Palavra-passe de administrador..."
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-3 pr-10 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:brightness-105 active:scale-[0.98] transition-all shadow-md shadow-amber-500/20"
          >
            {isLoading ? 'A autenticar...' : 'Entrar no Backend'}
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onCancel();
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-750 transition-colors"
          >
            Voltar ao Início
          </button>
        </form>
      </div>
    </div>
  );
};
