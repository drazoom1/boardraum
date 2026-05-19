import { useState } from 'react';
import { toast } from 'sonner';
import { X, ChevronRight, Loader2 } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

const API = (path: string) =>
  `https://${projectId}.supabase.co/functions/v1/make-server-influencer${path}`;

interface Question {
  id: string;
  text: string;
  type: 'short_text' | 'long_text' | 'radio' | 'checkbox' | 'date';
  required: boolean;
  options: string[];
}

interface InfluencerForm {
  id: string;
  title: string;
  description: string;
  minRankIndex: number;
  applyDeadline: string;
  periodStart: string;
  periodEnd: string;
  questions: Question[];
  status: 'open' | 'closed';
}

interface Props {
  form: InfluencerForm;
  myApplication: any | null; // null = 미신청
  accessToken?: string;
  onApplied?: () => void;
  onGuestAction?: () => void;
}

export function InfluencerBanner({ form, myApplication, accessToken, onApplied, onGuestAction }: Props) {
  const [showModal, setShowModal] = useState(false);

  const isClosed = form.status !== 'open';
  const isPastDeadline = form.applyDeadline
    ? Date.now() > new Date(form.applyDeadline + 'T23:59:59').getTime()
    : false;
  const canApply = !isClosed && !isPastDeadline && !myApplication;

  const handleClick = () => {
    if (!accessToken) { onGuestAction?.(); return; }
    if (canApply) setShowModal(true);
  };

  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-4 mb-3">
        <div
          onClick={handleClick}
          className={`relative rounded-2xl overflow-hidden border shadow-sm transition-all ${canApply ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : 'cursor-default'} bg-gradient-to-r from-yellow-400 to-orange-400 border-yellow-300`}
        >
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">⭐</span>
              <div className="min-w-0">
                <p className="text-sm font-black text-white truncate">{form.title}</p>
                <p className="text-xs text-yellow-100 mt-0.5">
                  {myApplication
                    ? myApplication.status === 'approved' ? '✅ 인플루언서로 선정됐습니다!' : '📋 신청 완료 · 심사 중'
                    : isClosed || isPastDeadline
                      ? '📪 신청이 마감됐습니다'
                      : form.applyDeadline
                        ? `📅 신청 기한 ${form.applyDeadline}`
                        : '신청하러 가기'}
                </p>
              </div>
            </div>
            {canApply && <ChevronRight className="w-5 h-5 text-white shrink-0" />}
          </div>
        </div>
      </div>

      {showModal && (
        <ApplyModal
          form={form}
          accessToken={accessToken!}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onApplied?.(); }}
        />
      )}
    </>
  );
}

// ── 신청 모달 ──────────────────────────────────────────────────────

function ApplyModal({ form, accessToken, onClose, onSuccess }: {
  form: InfluencerForm;
  accessToken: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (qId: string, value: string | string[]) =>
    setAnswers(prev => ({ ...prev, [qId]: value }));

  const toggleCheckbox = (qId: string, option: string) => {
    const current = (answers[qId] as string[]) ?? [];
    const next = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option];
    setAnswer(qId, next);
  };

  const handleSubmit = async () => {
    // 필수 질문 체크
    const missing = form.questions.filter(q => {
      if (!q.required) return false;
      const ans = answers[q.id];
      if (!ans) return true;
      if (Array.isArray(ans)) return ans.length === 0;
      return ans.trim() === '';
    });
    if (missing.length > 0) {
      toast.error(`필수 질문에 답해주세요: ${missing[0].text}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = form.questions.map(q => ({
        questionId: q.id,
        question: q.text,
        answer: answers[q.id] ?? (q.type === 'checkbox' ? [] : ''),
      }));
      const res = await fetch(API('/influencer/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ answers: payload }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '신청 실패'); return; }
      toast.success('인플루언서 신청이 완료됐습니다! 🎉');
      onSuccess();
    } catch { toast.error('네트워크 오류'); }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[min(100vw-2rem,520px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-black text-gray-900">⭐ {form.title}</h2>
            {form.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{form.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 질문 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {form.questions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">질문이 없습니다</p>
          )}
          {form.questions.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-bold text-gray-800">
                {idx + 1}. {q.text}
                {q.required && <span className="text-red-400 ml-1 text-xs">*필수</span>}
              </p>

              {q.type === 'short_text' && (
                <input
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="답변을 입력하세요"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400"
                />
              )}

              {q.type === 'long_text' && (
                <textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  rows={4}
                  placeholder="답변을 입력하세요"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 resize-none"
                />
              )}

              {q.type === 'date' && (
                <input
                  type="date"
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400"
                />
              )}

              {q.type === 'radio' && (
                <div className="space-y-1.5">
                  {q.options.filter(o => o.trim()).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswer(q.id, opt)}
                        className="accent-yellow-400"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'checkbox' && (
                <div className="space-y-1.5">
                  {q.options.filter(o => o.trim()).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={((answers[q.id] as string[]) ?? []).includes(opt)}
                        onChange={() => toggleCheckbox(q.id, opt)}
                        className="accent-yellow-400"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 제출 버튼 */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-black rounded-xl hover:from-yellow-500 hover:to-orange-500 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '⭐ 인플루언서 신청하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
