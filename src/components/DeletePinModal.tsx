import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, X, Delete, Check, Lock, AlertCircle, Clock, Calendar, Wrench } from 'lucide-react';
import { StoppageRecord } from '../types/manutrack';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface DeletePinModalProps {
  isOpen: boolean;
  record: StoppageRecord | null;
  onClose: () => void;
  onConfirmDelete: (recordId: string, pin: string) => Promise<void>;
}

export const DeletePinModal: React.FC<DeletePinModalProps> = ({
  isOpen,
  record,
  onClose,
  onConfirmDelete,
}) => {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg(null);
      setIsSubmitting(false);
      // Auto-focus input after render
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Introduza o PIN de autorização.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onConfirmDelete(record.id, pin.trim());
      // Successful deletion handled in parent
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'PIN incorreto. Tente novamente.');
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Autorização de Eliminação</h3>
              <p className="text-[11px] text-slate-400">Credencial de segurança obrigatória</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
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

          {/* Warning Note */}
          <div className="flex items-start gap-2 text-[11px] text-rose-300/90 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>Esta ação é definitiva e removerá este registo da base de dados e de todos os relatórios.</span>
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
              disabled={isSubmitting}
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
              <p className="text-center text-xs font-semibold text-rose-400 animate-shake">
                {errorMsg}
              </p>
            )}

            {/* Industrial Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  disabled={isSubmitting}
                  className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-bold text-white hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all shadow-sm"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                disabled={isSubmitting || pin.length === 0}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/60 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white active:scale-95 transition-all"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                disabled={isSubmitting}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-bold text-white hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all shadow-sm"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={isSubmitting || pin.length === 0}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white active:scale-95 transition-all"
                title="Apagar último dígito"
              >
                <Delete className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400 pt-1">
              PIN inicial predefinido: <strong className="text-slate-300 font-mono">2026</strong> (ou palavra-passe de admin)
            </p>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || pin.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-500 bg-rose-600 py-3 text-center text-xs font-black uppercase tracking-wider text-white hover:bg-rose-500 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-rose-950/40"
              >
                {isSubmitting ? (
                  <span>A eliminar...</span>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Eliminar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
