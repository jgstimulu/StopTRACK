import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, X, Check, Lock, AlertCircle, Pencil } from 'lucide-react';
import { StoppageRecord } from '../types/manutrack';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface AuthorizeEditPinModalProps {
  isOpen: boolean;
  record: StoppageRecord | null;
  onClose: () => void;
  onConfirmPin: (pin: string) => void;
}

export const AuthorizeEditPinModal: React.FC<AuthorizeEditPinModalProps> = ({
  isOpen,
  record,
  onClose,
  onConfirmPin,
}) => {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen || !record) return null;

  const handleDigitPress = (digit: string) => {
    playIndustrialClick();
    if (pin.length < 8) {
      const next = pin + digit;
      setPin(next);
      setErrorMsg(null);
    }
  };

  const handleBackspace = () => {
    playIndustrialClick();
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    playIndustrialClick();
    setPin('');
    setErrorMsg(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Introduza o PIN de autorização.');
      playIndustrialClick();
      return;
    }
    if (pin.trim().length < 4) {
      setErrorMsg('O PIN deve ter pelo menos 4 dígitos.');
      playIndustrialClick();
      return;
    }

    playSuccessChime();
    onConfirmPin(pin.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Autorização para Editar Paragem</h3>
              <p className="text-[11px] text-slate-400">Credencial de segurança obrigatória</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Record Overview Card */}
        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-10 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/20 text-xs font-mono font-black text-amber-300">
                  {record.machineId}
                </span>
                <div>
                  <span className="text-xs font-bold text-white block leading-tight">
                    {record.machineName || `Máquina ${record.machineId}`}
                  </span>
                  <span className="text-[10px] text-slate-400">{record.stoppageType}</span>
                </div>
              </div>

              <span className="text-xs font-mono font-black text-rose-400 tabular-nums">
                {record.durationFormatted}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
              <span>{record.date}</span>
              <span className="font-mono">{record.startTime} às {record.endTime}</span>
            </div>
          </div>

          {/* Security Notice */}
          <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/50 p-2.5 rounded-lg">
            <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Apenas operadores autorizados ou administradores podem alterar ou corrigir o registo desta paragem após o fecho.
            </span>
          </div>

          {/* PIN Input Section */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-center text-xs font-bold uppercase tracking-wider text-slate-300">
              Introduza o PIN de Autorização
            </label>

            {/* Hidden native input for physical keyboard entry */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErrorMsg(null);
              }}
              className="sr-only"
              autoComplete="off"
            />

            {/* Visual Masked PIN Indicator */}
            <div
              onClick={() => inputRef.current?.focus()}
              className={`flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 bg-slate-800/90 transition-all ${
                errorMsg
                  ? 'border-rose-500 bg-rose-950/30'
                  : 'border-slate-700 hover:border-amber-500/80 focus-within:border-amber-500'
              }`}
            >
              {[0, 1, 2, 3].map((idx) => {
                const hasChar = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all ${
                      hasChar
                        ? 'border-amber-400 bg-amber-400 scale-110 shadow-sm shadow-amber-500/50'
                        : 'border-slate-600 bg-slate-900'
                    }`}
                  />
                );
              })}
              {pin.length > 4 && (
                <span className="text-xs font-mono font-bold text-amber-300 ml-1">
                  +{pin.length - 4}
                </span>
              )}
            </div>

            {errorMsg && (
              <p className="text-center text-xs font-semibold text-rose-400 animate-shake flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{errorMsg}</span>
              </p>
            )}

            {/* Industrial Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-bold text-white hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all shadow-sm"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                disabled={pin.length === 0}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/60 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white active:scale-95 transition-all disabled:opacity-40"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-bold text-white hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all shadow-sm"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={pin.length === 0}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/60 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white active:scale-95 transition-all disabled:opacity-40"
                title="Apagar último dígito"
              >
                Apagar
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400 pt-1">
              Introduza o seu PIN de operador autorizado ou credencial de admin.
            </p>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={pin.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-500 bg-amber-500 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-amber-500/20"
              >
                <Pencil className="h-4 w-4" />
                <span>Desbloquear Edição</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
