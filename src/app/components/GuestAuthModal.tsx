import { useState } from 'react';
import { X } from 'lucide-react';
import { Auth } from './Auth';

interface GuestAuthModalProps {
  onClose: () => void;
  onAuthSuccess: (token: string) => void;
  initialSignup?: boolean;
  referralCode?: string;
}

export function GuestAuthModal({ onClose, onAuthSuccess, initialSignup = false, referralCode = '' }: GuestAuthModalProps) {
  const [mode, setMode] = useState<null | 'signup' | 'login'>(initialSignup ? 'signup' : null);

  if (mode) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-md sm:rounded-2xl max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-base">로그인 / 회원가입</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <Auth initialSignup={mode === 'signup'} referralCode={referralCode} onAuthSuccess={(token) => { onAuthSuccess(token); onClose(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl px-6 pt-6 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* 모바일 드래그 핸들 */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex justify-end mb-1">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 메인 안내 영역 */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">🎲</div>
          <p className="text-xl font-bold text-gray-900 leading-snug">
            회원이 되시면 이용하실 수 있어요!
          </p>
          <p className="text-base text-gray-500 mt-2 leading-relaxed">
            좋아요, 댓글, 게시물 작성 등<br />모든 기능을 이용해 보세요.
          </p>

          {/* 🃏 보너스 카드 안내 배너 (amber 톤) */}
          <div className="mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 leading-relaxed">
              🃏 커뮤니티에 적극 참여하면
            </p>
            <p className="text-base font-bold text-amber-900 mt-0.5">
              보너스 카드 획득 기회가 열려요!
            </p>
          </div>
        </div>

        {/* CTA 버튼 */}
        <button
          onClick={() => setMode('signup')}
          className="w-full py-4 rounded-2xl text-white font-bold text-lg transition-all active:scale-95 mb-3"
          style={{ backgroundColor: '#111' }}
        >
          15초만에 간단히 가입하기 →
        </button>
        <button
          onClick={() => setMode('login')}
          className="w-full py-2.5 rounded-xl text-base text-gray-400 hover:text-gray-700 transition-colors"
        >
          이미 계정이 있어요 — 로그인
        </button>
      </div>
    </div>
  );
}