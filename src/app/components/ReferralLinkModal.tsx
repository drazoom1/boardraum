import React, { useState } from 'react';
import { X, Copy, CheckCheck, Link } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface ReferralLinkModalProps {
  accessToken: string;
  onClose: () => void;
}

export function ReferralLinkModal({ accessToken, onClose }: ReferralLinkModalProps) {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/referral/my-code`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!data.code) throw new Error('코드 생성 실패');
        setLink(`https://boardraum.site?ref=${data.code}`);
      } catch {
        toast.error('링크 생성에 실패했어요');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopy = async () => {
    if (copied || !link) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      setCopied(true);
      toast.success('링크가 복사됐어요! 🃏', { description: '친구에게 공유해서 보너스카드를 받아보세요', duration: 3000 });
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error('복사 실패. 링크를 직접 선택해 복사해 주세요.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="relative px-6 pt-8 pb-6 text-center border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <h3 className="text-xl font-bold text-gray-900">내 추천 링크</h3>
          <p className="text-sm text-gray-500 mt-2">
            친구가 가입하면 <span className="font-bold" style={{ color: '#00BCD4' }}>보너스카드 3장</span> 지급
          </p>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* 링크 표시 */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <Link className="w-5 h-5 shrink-0" style={{ color: '#00BCD4' }} />
            {loading ? (
              <span className="text-sm text-gray-400 animate-pulse">링크 생성 중...</span>
            ) : (
              <span className="text-sm text-gray-700 truncate flex-1 select-all font-mono">{link}</span>
            )}
          </div>

          {/* 복사 버튼 */}
          <button
            onClick={handleCopy}
            disabled={loading || !link}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            style={{
              background: copied ? '#22c55e' : '#00BCD4',
            }}
          >
            {copied
              ? <><CheckCheck className="w-5 h-5" /> 복사 완료!</>
              : <><Copy className="w-5 h-5" /> 링크 복사하기</>
            }
          </button>

          {/* 공유 안내 */}
          <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                추천인 링크를 공유하여 친구를 초대하면 <span style={{ color: '#00BCD4' }}>보너스카드가 3장</span> 지급됩니다.
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                추천인 링크를 블로그나 인스타그램과 같은 여러 사이트에 공유해보세요.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-2.5">
              <p className="text-xs font-semibold" style={{ color: '#00BCD4' }}>추천 공유처</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">💬</span>
                  <p className="text-xs text-gray-600">카카오톡 · 문자</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📸</span>
                  <p className="text-xs text-gray-600">인스타그램</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📝</span>
                  <p className="text-xs text-gray-600">블로그</p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 border border-gray-200 rounded-2xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
