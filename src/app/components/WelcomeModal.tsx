import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface PopupButton {
  label: string;
  url: string;
  style: 'primary' | 'outline' | 'kakao';
}

interface PopupConfig {
  title: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
  buttons?: PopupButton[];
}

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken?: string | null;
}

export function WelcomeModal({ isOpen, onClose, accessToken }: WelcomeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/popup-config`,
          accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}
        );
        if (res.ok) {
          const d = await res.json();
          setConfig(d.config || null);
        }
      } catch {
        // 서버 실패 시 localStorage fallback
        const saved = localStorage.getItem('adminPopupConfig');
        if (saved) setConfig(JSON.parse(saved));
      } finally {
        setReady(true);
      }
    };
    fetchConfig();
  }, [isOpen, accessToken]);

  const handleClose = () => {
    if (dontShowAgain) {
      // 한국 시간(KST, UTC+9) 기준 오늘 자정 00:00 계산
      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000); // 현재 KST
      // KST 내일 00:00:00 = UTC로는 전날 15:00:00
      const midnightKST = new Date(Date.UTC(
        nowKST.getUTCFullYear(),
        nowKST.getUTCMonth(),
        nowKST.getUTCDate() + 1, // 내일
        -9, 0, 0, 0              // UTC -9h = KST 00:00
      ));
      localStorage.setItem('welcomeModal_hideUntil', midnightKST.toISOString());
      localStorage.setItem('welcomeModal_lastSeen', config?.updatedAt || 'none');
    }
    onClose();
  };

  if (!isOpen || !ready) return null;

  const title = config?.title || '보드라움에 오신 것을 환영합니다.';
  const rawContent = config?.content || '보드게임 컬렉션을 체계적으로 관리하고 다양한 정보를 공유하는 서비스입니다.';
  const buttons = (config?.buttons || []).filter(b => b.label && b.url);

  const btnClass = (style: string) => {
    if (style === 'kakao') return 'bg-yellow-400 hover:bg-yellow-500 text-gray-900';
    if (style === 'outline') return 'border border-blue-600 text-blue-600 hover:bg-blue-50';
    return 'bg-blue-600 hover:bg-blue-700 text-white';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="h-1 bg-blue-600 shrink-0" />
        <div className="px-7 pt-8 pb-6 overflow-y-auto flex-1">
          {/* 아이콘 + 제목 - 가운데 정렬 */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Info className="w-7 h-7 text-white" strokeWidth={3} />
            </div>
            <p className="text-lg font-bold text-blue-700 leading-snug">{title}</p>
          </div>
          {/* 본문 - 왼쪽 정렬 */}
          <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap">
            {rawContent}
          </div>
          {buttons.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
              {buttons.map((btn, i) => (
                <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer"
                  onClick={handleClose}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium text-center transition-colors ${btnClass(btn.style)}`}>
                  {btn.label}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="h-1 bg-blue-600 shrink-0" />
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
            <span className="text-sm text-gray-600">하루간 보지 않기</span>
          </label>
          <button onClick={handleClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}