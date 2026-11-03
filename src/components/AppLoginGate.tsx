import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { fetchLoginOperators, LoginOperator } from '../services/api';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface AppLoginGateProps {
  onOperatorLogin: (operatorId: string, pin: string) => Promise<void>;
  onAdminLogin: (email: string, password: string) => Promise<void>;
}

type LoginMode = 'operator' | 'admin';

export const AppLoginGate: React.FC<AppLoginGateProps> = ({
  onOperatorLogin,
  onAdminLogin,
}) => {
  const [mode, setMode] = useState<LoginMode>('operator');
  const [operators, setOperators] = useState<LoginOperator[]>([]);
  const [isLoadingOperators, setIsLoadingOperators] = useState(true);
  const [operatorsError, setOperatorsError] = useState<string | null>(null);

  const [operatorId, setOperatorId] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOperators = async () => {
    setIsLoadingOperators(true);
    setOperatorsError(null);
    try {
      const list = await fetchLoginOperators();
      setOperators(list.filter((operator) => operator.canStart || operator.canClose));
    } catch (err) {
      setOperatorsError(
        err instanceof Error ? err.message : 'Não foi possível carregar a lista de operadores.'
      );
    } finally {
      setIsLoadingOperators(false);
    }
  };

  useEffect(() => {
    void loadOperators();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'operator') {
      if (!operatorId) {
        setError('Selecione o operador que vai iniciar sessão.');
        return;
      }
      if (!pin.trim()) {
        setError('Introduza o PIN individual do operador.');
        return;
      }
    } else if (!email.trim() || !password.trim()) {
      setError('Introduza o email e a palavra-passe de administrador.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'operator') {
        await onOperatorLogin(operatorId, pin.trim());
      } else {
        await onAdminLogin(email.trim(), password.trim());
      }
      playSuccessChime();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar sessão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-400 shadow-inner">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-base font-bold uppercase tracking-wider text-white">Acesso ao StopTRACK</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            A sessão é obrigatória para consultar paragens, histórico e indicadores.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setMode('operator');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              mode === 'operator'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Operador
          </button>
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setMode('admin');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              mode === 'admin'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Administrador
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/80 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {mode === 'operator' ? (
            <>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  <User className="h-3.5 w-3.5 text-amber-400" />
                  <span>Operador</span>
                </label>
                {operatorsError ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-300">
                    <p>{operatorsError}</p>
                    <button
                      type="button"
                      onClick={() => void loadOperators()}
                      className="mt-2 inline-flex items-center gap-1.5 font-bold text-rose-200 hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Tentar novamente
                    </button>
                  </div>
                ) : (
                  <select
                    value={operatorId}
                    onChange={(event) => {
                      setOperatorId(event.target.value);
                      setPin('');
                      setError(null);
                    }}
                    disabled={isLoadingOperators || isSubmitting}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {isLoadingOperators ? 'A carregar operadores...' : 'Selecione o operador...'}
                    </option>
                    {operators.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.name} — {operator.role}
                      </option>
                    ))}
                  </select>
                )}
                {!isLoadingOperators && !operatorsError && operators.length === 0 && (
                  <p className="mt-1.5 text-[10px] text-amber-300">
                    Nenhum operador ativo com permissões. Inicie sessão como administrador para configurar.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                  <span>PIN Individual</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => {
                    setPin(event.target.value);
                    setError(null);
                  }}
                  placeholder="Introduza o PIN..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-mono tracking-widest text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  <Mail className="h-3.5 w-3.5 text-amber-400" />
                  <span>Email de Administrador</span>
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  placeholder="admin@empresa.pt"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                  <span>Palavra-Passe</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                    placeholder="Palavra-passe de administrador..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-3 pr-10 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    title={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (mode === 'operator' && isLoadingOperators)}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
          >
            {isSubmitting ? 'A autenticar...' : 'Entrar no StopTRACK'}
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-500">
          A sessão expira automaticamente ao fim de 8 horas.
        </p>
      </div>
    </div>
  );
};
