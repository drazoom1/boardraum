import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface SpamWarningModalProps {
  onClose: () => void;
}

export function SpamWarningModal({ onClose }: SpamWarningModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-xs w-full overflow-hidden"
        style={{ animation: 'spamModalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 상단 경고 배너 */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 pt-7 pb-5 relative">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-9 h-9 text-white" />
            </div>
          </div>
          <h2 className="text-white font-extrabold text-lg text-center leading-tight">
            커뮤니티 경고
          </h2>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 text-center">
          <p className="text-gray-800 font-semibold text-base leading-relaxed mb-2">
            ⚠️ 연속 작성이 감지되었습니다
          </p>
          <p className="text-gray-500 text-sm leading-relaxed">
            무지성 글·도배는 다른 회원들에게<br />
            불쾌감을 줄 수 있습니다.
          </p>
          <div className="mt-4 px-4 py-3 bg-orange-50 rounded-2xl border border-orange-100">
            <p className="text-orange-700 text-xs font-semibold leading-relaxed">
              3초 이내 연속 작성 시 도배로 기록되며,<br />
              반복 시 커뮤니티 이용이 제한될 수 있습니다.
            </p>
          </div>
        </div>

        {/* 확인 버튼 */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            확인했습니다
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spamModalIn {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
