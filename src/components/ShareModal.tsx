import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Smartphone, Cloud, UploadCloud, Globe, ShieldCheck } from 'lucide-react';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrateLocal: () => Promise<number>;
  totalCloudRecords: number;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  onMigrateLocal,
  totalCloudRecords,
}) => {
  const [copied, setCopied] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopy = () => {
    playIndustrialClick();
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleMigrate = async () => {
    playIndustrialClick();
    setIsMigrating(true);
    try {
      const added = await onMigrateLocal();
      playSuccessChime();
      setMigrationResult(
        added > 0
          ? `${added} registos locais migrados para a nuvem com sucesso!`
          : 'Todos os registos deste telemóvel já se encontram na nuvem.'
      );
    } catch {
      setMigrationResult('Erro ao contactar a nuvem. Verifique a ligação à internet.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Abrir no Telemóvel
            </h3>
          </div>
          <button
            onClick={() => {
              playIndustrialClick();
              onClose();
            }}
            className="rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="my-4 flex flex-col items-center text-center">
          {/* QR Code Container */}
          <div className="rounded-2xl border-4 border-slate-700 bg-white p-3 shadow-lg">
            <QRCodeSVG
              value={currentUrl}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>

          <p className="mt-3 text-xs font-semibold text-slate-200">
            Aponte a câmara do telemóvel para abrir
          </p>
          <p className="mt-1 text-[11px] text-slate-400 max-w-[280px]">
            Qualquer pessoa com este link acede à mesma base de dados na nuvem em tempo real (dados móveis 4G/5G ou Wi-Fi).
          </p>

          {/* Copy Link Button */}
          <button
            onClick={handleCopy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-xs font-bold text-slate-200 hover:border-amber-500 hover:bg-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-amber-400" />
                <span>Copiar Link de Acesso</span>
              </>
            )}
          </button>
        </div>

        {/* Migration Section: Upload local data to cloud */}
        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Cloud className="h-4 w-4 text-emerald-400" />
              <span>Base na Nuvem: <strong>{totalCloudRecords} registos</strong></span>
            </div>
          </div>

          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/50 transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{isMigrating ? 'A sincronizar...' : 'Sincronizar Dados Deste Aparelho'}</span>
          </button>

          {migrationResult && (
            <p className="mt-2 text-center text-[11px] font-medium text-emerald-300">
              {migrationResult}
            </p>
          )}

          <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            <span>Sem permissões de TI · HTTPS Seguro na Google Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
};
