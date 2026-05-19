import { useState } from 'react';
import { toast } from 'sonner';
import { X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
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
  myApplication: any | null;
  accessToken?: string;
  onApplied?: () => void;
  onGuestAction?: () => void;
}

export function InfluencerBanner({ form, myApplication, accessToken, onApplied, onGuestAction }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const isPastDeadline = form.applyDeadline
    ? Date.now() > new Date(form.applyDeadline + 'T23:59:59').getTime()
    : false;
  const canApply = !isPastDeadline && !myApplication;

  const handleApplyClick = () => {
    if (!accessToken) { onGuestAction?.(); return; }
    setShowModal(true);
  };

  const deadlineLabel = form.applyDeadline
    ? `${form.applyDeadline.replace(/-/g, '.')} 마감`
    : '상시 모집';

  const statusLabel = myApplication
    ? myApplication.status === 'approved' ? '✅ 선정됨' : '📋 심사 중'
    : isPastDeadline ? '마감됨' : deadlineLabel;

  return (
    <>
      <div
        className="rounded-2xl mb-3 overflow-hidden shadow-sm bg-white"
        style={{ border: '2px solid #f59e0b' }}
      >
        <div className="px-5 py-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between" style={{ marginBottom: collapsed ? 0 : 12 }}>
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none select-none">⭐</span>
              <span className="text-gray-900 font-bold text-sm">{form.title}</span>
            </div>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>{statusLabel}</span>
              <button
                onClick={() => setCollapsed(c => !c)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 펼쳐진 내용 */}
          <div style={{ overflow: 'hidden', maxHeight: collapsed ? 0 : '400px', transition: 'max-height 0.3s ease' }}>
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 space-y-2">
              {form.description && (
                <p className="text-xs text-gray-600 leading-relaxed">{form.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
                {form.applyDeadline && (
                  <span>📅 신청 기한 <strong className="text-gray-600">{form.applyDeadline.replace(/-/g, '.')}</strong></span>
                )}
                {form.periodStart && (
                  <span>📌 활동 기간 <strong className="text-gray-600">{form.periodStart.replace(/-/g, '.')} ~ {form.periodEnd ? form.periodEnd.replace(/-/g, '.') : ''}</strong></span>
                )}
              </div>
            </div>

            <div className="mt-3">
              {myApplication ? (
                <div className="w-full py-2.5 text-center text-sm font-bold rounded-xl bg-gray-100 text-gray-500">
                  {myApplication.status === 'approved' ? '✅ 인플루언서로 선정됐습니다!' : '📋 신청 완료 · 심사 중입니다'}
                </div>
              ) : isPastDeadline ? (
                <div className="w-full py-2.5 text-center text-sm font-bold rounded-xl bg-gray-100 text-gray-400">
                  신청 기간이 종료됐습니다
                </div>
              ) : (
                <button
                  onClick={handleApplyClick}
                  className="w-full py-2.5 text-sm font-black text-white rounded-xl transition-all shadow-sm hover:opacity-90 active:scale-[0.99]"
                  style={{ background: 'linear-gradient(to right, #f59e0b, #f97316)' }}
                >
                  ⭐ 인플루언서 신청하기
                </button>
              )}
            </div>
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

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 text-white font-black rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90"
            style={{ background: 'linear-gradient(to right, #f59e0b, #f97316)' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '⭐ 인플루언서 신청하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
