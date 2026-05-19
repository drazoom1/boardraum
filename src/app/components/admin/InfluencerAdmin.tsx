import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X, GripVertical, RefreshCw, Loader2, Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { ALL_RANKS } from '../chessRank';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-influencer`;

// ── 타입 ──────────────────────────────────────────────────────────

type AnswerType = 'short_text' | 'long_text' | 'radio' | 'checkbox' | 'date';

interface Question {
  id: string;
  text: string;
  type: AnswerType;
  required: boolean;
  options: string[];
}

interface Mission {
  id: string;
  title: string;
  description: string;
  deadline: string;
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
  missions: Mission[];
  status: 'draft' | 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
}

// ── 상수 ──────────────────────────────────────────────────────────

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  short_text: '단답형',
  long_text:  '장문형',
  radio:      '객관식 (단일 선택)',
  checkbox:   '체크박스 (복수 선택)',
  date:       '날짜',
};
const ANSWER_TYPE_ICONS: Record<AnswerType, string> = {
  short_text: '✏️', long_text: '📝', radio: '🔘', checkbox: '☑️', date: '📅',
};
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:  { label: '임시저장', color: 'bg-gray-100 text-gray-600' },
  open:   { label: '신청 중', color: 'bg-green-100 text-green-700' },
  closed: { label: '마감', color: 'bg-red-100 text-red-600' },
};
const APP_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '선정됨', color: 'bg-green-100 text-green-700' },
  revoked:  { label: '박탈', color: 'bg-red-100 text-red-600' },
};

function uid() { return Math.random().toString(36).slice(2, 9); }
function emptyQuestion(): Question { return { id: uid(), text: '', type: 'short_text', required: false, options: [] }; }
function emptyMission(): Mission { return { id: uid(), title: '', description: '', deadline: '' }; }

// ══════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════

export function InfluencerAdmin({ accessToken }: { accessToken: string }) {
  const [activeForm, setActiveForm] = useState<InfluencerForm | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'main' | 'create' | 'edit'>('main');
  const [actionLoading, setActionLoading] = useState(false);

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  // admin용 전체 로드 (draft 포함)
  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const [formRes, appRes] = await Promise.all([
        fetch(`${API}/influencer/admin/form`, { headers: authHeader() }),
        fetch(`${API}/influencer/admin/applications`, { headers: authHeader() }),
      ]);
      const formData = await formRes.json().catch(() => ({}));
      const appData = await appRes.json().catch(() => ({}));

      setActiveForm(formData.form ?? null);
      setApplications(appData.applications ?? []);
    } catch (e: any) {
      toast.error(`불러오기 실패: ${e?.message ?? e}`);
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { loadAdmin(); }, [loadAdmin]);

  const handleSave = async (formData: Omit<InfluencerForm, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    try {
      const res = await fetch(`${API}/influencer/admin/save`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '저장 실패'); return; }
      toast.success('신청서가 저장됐습니다');
      setActiveForm(d.form);
      setView('main');
    } catch { toast.error('네트워크 오류'); }
  };

  const handleOpen = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/influencer/admin/open`, { method: 'POST', headers: authHeader() });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '오픈 실패'); return; }
      toast.success('신청이 오픈됐습니다! 피드에 배너가 표시됩니다 🎉');
      await loadAdmin();
    } catch { toast.error('네트워크 오류'); }
    setActionLoading(false);
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/influencer/admin/close`, { method: 'POST', headers: authHeader() });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '마감 실패'); return; }
      toast.success('신청이 마감됐습니다');
      await loadAdmin();
    } catch { toast.error('네트워크 오류'); }
    setActionLoading(false);
  };

  const handleApprove = async (userId: string, nickname: string) => {
    try {
      const res = await fetch(`${API}/influencer/admin/approve`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '선정 실패'); return; }
      toast.success(`${nickname}님이 인플루언서로 선정됐습니다 ⭐`);
      await loadAdmin();
    } catch { toast.error('네트워크 오류'); }
  };

  const handleRevoke = async (userId: string, nickname: string) => {
    try {
      const res = await fetch(`${API}/influencer/admin/revoke`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '박탈 실패'); return; }
      toast.success(`${nickname}님의 인플루언서 자격이 박탈됐습니다`);
      await loadAdmin();
    } catch { toast.error('네트워크 오류'); }
  };

  if (view === 'create' || view === 'edit') {
    return (
      <CreateFormView
        initial={view === 'edit' && activeForm ? activeForm : undefined}
        onSave={handleSave}
        onCancel={() => setView('main')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 bg-gradient-to-r from-yellow-50 to-orange-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-800">⭐ 인플루언서 관리</h2>
            <p className="text-xs text-gray-400 mt-0.5">신청서 생성, 오픈, 심사, 선정</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAdmin} disabled={loading} className="p-1.5 text-gray-400 hover:text-gray-600">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {!activeForm && (
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                새 신청서 만들기
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
          </div>
        ) : !activeForm ? (
          <div className="px-5 py-16 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-bold text-gray-400">저장된 신청서가 없습니다</p>
            <p className="text-xs text-gray-300">위 버튼을 눌러 신청서를 만들어보세요</p>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {/* 신청서 요약 */}
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-4 py-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-black text-gray-900">{activeForm.title}</p>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_LABEL[activeForm.status]?.color}`}>
                  {STATUS_LABEL[activeForm.status]?.label}
                </span>
              </div>
              {activeForm.description && (
                <p className="text-xs text-gray-500">{activeForm.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>신청 자격: <strong>{ALL_RANKS[activeForm.minRankIndex]?.label ?? '-'} 이상</strong></span>
                {activeForm.applyDeadline && <span>신청 기한: <strong>{activeForm.applyDeadline}</strong></span>}
                {activeForm.periodStart && <span>활동: <strong>{activeForm.periodStart} ~ {activeForm.periodEnd || '-'}</strong></span>}
                <span>질문 {activeForm.questions?.length ?? 0}개 · 미션 {activeForm.missions?.length ?? 0}개</span>
              </div>
            </div>

            {/* 상태 제어 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={() => setView('edit')}
                className="flex-1 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                수정
              </button>
              {activeForm.status === 'draft' && (
                <button
                  onClick={handleOpen}
                  disabled={actionLoading}
                  className="flex-1 py-2 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '📢 신청 오픈'}
                </button>
              )}
              {activeForm.status === 'open' && (
                <button
                  onClick={handleClose}
                  disabled={actionLoading}
                  className="flex-1 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '📪 신청 마감'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 신청자 목록 */}
      {activeForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-bold text-gray-700">신청자 목록</h3>
              <span className="text-xs text-gray-400">{applications.length}명</span>
            </div>
          </div>

          {applications.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              아직 신청자가 없습니다
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {applications.map(app => (
                <ApplicationRow
                  key={app.userId}
                  application={app}
                  form={activeForm}
                  onApprove={() => handleApprove(app.userId, app.nickname)}
                  onRevoke={() => handleRevoke(app.userId, app.nickname)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 신청자 행 ──────────────────────────────────────────────────────

function ApplicationRow({ application: app, form, onApprove, onRevoke }: {
  application: any; form: InfluencerForm;
  onApprove: () => void; onRevoke: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const statusInfo = APP_STATUS_LABEL[app.status] ?? APP_STATUS_LABEL.pending;

  const runApprove = async () => { setActionLoading(true); await onApprove(); setActionLoading(false); };
  const runRevoke  = async () => { setActionLoading(true); await onRevoke();  setActionLoading(false); };

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {app.isInfluencer && <span className="text-yellow-400 text-sm shrink-0">⭐</span>}
          <span className="text-sm font-semibold text-gray-800 truncate">{app.nickname}</span>
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {new Date(app.appliedAt).toLocaleDateString('ko-KR')}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {actionLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : app.isInfluencer || app.status === 'approved' ? (
            <button onClick={runRevoke} className="px-2.5 py-1 text-xs font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              박탈
            </button>
          ) : (
            <button onClick={runApprove} className="px-2.5 py-1 text-xs font-bold text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> 선정
            </button>
          )}
        </div>
      </div>

      {/* 답변 펼치기 */}
      {open && app.answers?.length > 0 && (
        <div className="mt-3 space-y-2 pl-2 border-l-2 border-yellow-200">
          {app.answers.map((a: any, i: number) => (
            <div key={i}>
              <p className="text-xs font-bold text-gray-500">{a.question}</p>
              <p className="text-sm text-gray-700 mt-0.5">
                {Array.isArray(a.answer) ? a.answer.join(', ') || '-' : a.answer || '-'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 신청서 생성/수정 폼
// ══════════════════════════════════════════════════════════════════

function CreateFormView({ initial, onSave, onCancel }: {
  initial?: InfluencerForm;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle]             = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [minRankIndex, setMinRankIndex] = useState(initial?.minRankIndex ?? 12);
  const [applyDeadline, setApplyDeadline] = useState(initial?.applyDeadline ?? '');
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd]     = useState(initial?.periodEnd ?? '');
  const [questions, setQuestions]     = useState<Question[]>(initial?.questions ?? [emptyQuestion()]);
  const [missions, setMissions]       = useState<Mission[]>(initial?.missions ?? [emptyMission()]);
  const [saving, setSaving]           = useState(false);

  // ── 질문 조작 ──
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  const moveQuestion = (idx: number, dir: -1 | 1) =>
    setQuestions(prev => { const n = [...prev]; [n[idx], n[idx+dir]] = [n[idx+dir], n[idx]]; return n; });
  const removeQuestion = (id: string) => setQuestions(prev => prev.filter(q => q.id !== id));
  const addOption = (qId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: [...q.options, ''] } : q));
  const updateOption = (qId: string, oi: number, val: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: q.options.map((o, i) => i === oi ? val : o) } : q));
  const removeOption = (qId: string, oi: number) =>
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q));

  // ── 미션 조작 ──
  const updateMission = (id: string, patch: Partial<Mission>) =>
    setMissions(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const moveMission = (idx: number, dir: -1 | 1) =>
    setMissions(prev => { const n = [...prev]; [n[idx], n[idx+dir]] = [n[idx+dir], n[idx]]; return n; });
  const removeMission = (id: string) => setMissions(prev => prev.filter(m => m.id !== id));

  const handleSave = async () => {
    if (!title.trim()) { toast.error('신청서 제목을 입력해주세요'); return; }
    setSaving(true);
    await onSave({ title, description, minRankIndex, applyDeadline, periodStart, periodEnd, questions, missions });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 bg-gradient-to-r from-yellow-50 to-orange-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">⭐ {initial ? '신청서 수정' : '새 인플루언서 신청서'}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* ① 기본 정보 */}
          <Section title="기본 정보">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">신청서 제목 *</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 보드라움 인플루언서 1기 모집"
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">안내 문구</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="신청 자격, 혜택, 주의사항 등"
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 resize-none" />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-gray-600">신청 가능 최소 등급</span>
              <div className="flex items-center gap-2">
                <select value={minRankIndex} onChange={e => setMinRankIndex(Number(e.target.value))}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 bg-white">
                  {ALL_RANKS.map((rank, idx) => (
                    <option key={idx} value={idx}>{rank.label}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 shrink-0">이상</span>
              </div>
              <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                선택된 등급: <span className="font-bold">{ALL_RANKS[minRankIndex]?.label}</span> 이상부터 신청 가능
              </p>
            </div>
          </Section>

          {/* ② 신청 기한 */}
          <Section title="신청 기한">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">신청 마감일</span>
              <input type="date" value={applyDeadline} onChange={e => setApplyDeadline(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400" />
            </label>
          </Section>

          {/* ③ 활동 기간 */}
          <Section title="활동 기간">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-gray-600">시작일</span>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">종료일</span>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400" />
              </label>
            </div>
          </Section>

          {/* ④ 설문 질문 */}
          <Section title="설문 질문">
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionItem key={q.id} question={q} index={idx} total={questions.length}
                  onChange={patch => updateQuestion(q.id, patch)}
                  onMove={dir => moveQuestion(idx, dir)}
                  onRemove={() => removeQuestion(q.id)}
                  onAddOption={() => addOption(q.id)}
                  onUpdateOption={(oi, val) => updateOption(q.id, oi, val)}
                  onRemoveOption={oi => removeOption(q.id, oi)}
                />
              ))}
            </div>
            <button onClick={() => setQuestions(prev => [...prev, emptyQuestion()])}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 hover:border-yellow-300 text-gray-400 hover:text-yellow-500 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> 질문 추가
            </button>
          </Section>

          {/* ⑤ 미션 */}
          <Section title="미션">
            <div className="space-y-3">
              {missions.map((m, idx) => (
                <MissionItem key={m.id} mission={m} index={idx} total={missions.length}
                  onChange={patch => updateMission(m.id, patch)}
                  onMove={dir => moveMission(idx, dir)}
                  onRemove={() => removeMission(m.id)}
                />
              ))}
            </div>
            <button onClick={() => setMissions(prev => [...prev, emptyMission()])}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 hover:border-yellow-300 text-gray-400 hover:text-yellow-500 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> 미션 추가
            </button>
          </Section>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 섹션 래퍼 ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-black text-gray-700 uppercase tracking-wide">{title}</p>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      {children}
    </div>
  );
}

// ── 질문 아이템 ────────────────────────────────────────────────────

function QuestionItem({ question, index, total, onChange, onMove, onRemove, onAddOption, onUpdateOption, onRemoveOption }: {
  question: Question; index: number; total: number;
  onChange: (p: Partial<Question>) => void; onMove: (d: -1|1) => void; onRemove: () => void;
  onAddOption: () => void; onUpdateOption: (oi: number, v: string) => void; onRemoveOption: (oi: number) => void;
}) {
  const needsOptions = question.type === 'radio' || question.type === 'checkbox';
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}</span>
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
        <input value={question.text} onChange={e => onChange({ text: e.target.value })}
          placeholder={`질문 ${index + 1}`}
          className="flex-1 px-2 py-1 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-yellow-400" />
        <select value={question.type}
          onChange={e => { const t = e.target.value as AnswerType; onChange({ type: t, options: (t==='radio'||t==='checkbox') ? [''] : [] }); }}
          className="shrink-0 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400">
          {(Object.entries(ANSWER_TYPE_LABELS) as [AnswerType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{ANSWER_TYPE_ICONS[v]} {l}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 shrink-0 cursor-pointer">
          <input type="checkbox" checked={question.required} onChange={e => onChange({ required: e.target.checked })} className="accent-yellow-400" />
          <span className="text-xs text-gray-500">필수</span>
        </label>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index===0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => onMove(1)} disabled={index===total-1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={onRemove} disabled={total===1} className="p-1 text-red-300 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {needsOptions && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200 pt-2">
          {question.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="text-gray-300 text-xs w-4 shrink-0">{question.type==='radio' ? '○' : '□'}</span>
              <input value={opt} onChange={e => onUpdateOption(oi, e.target.value)} placeholder={`선택지 ${oi+1}`}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400" />
              <button onClick={() => onRemoveOption(oi)} className="text-red-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={onAddOption} className="text-xs text-yellow-500 hover:text-yellow-600 font-bold flex items-center gap-1 mt-1">
            <Plus className="w-3 h-3" /> 선택지 추가
          </button>
        </div>
      )}
    </div>
  );
}

// ── 미션 아이템 ────────────────────────────────────────────────────

function MissionItem({ mission, index, total, onChange, onMove, onRemove }: {
  mission: Mission; index: number; total: number;
  onChange: (p: Partial<Mission>) => void; onMove: (d: -1|1) => void; onRemove: () => void;
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}</span>
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
        <input value={mission.title} onChange={e => onChange({ title: e.target.value })} placeholder={`미션 ${index+1} 제목`}
          className="flex-1 px-2 py-1 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-yellow-400" />
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index===0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => onMove(1)} disabled={index===total-1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={onRemove} disabled={total===1} className="p-1 text-red-300 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <textarea value={mission.description} onChange={e => onChange({ description: e.target.value })} rows={2}
        placeholder="미션 내용 및 달성 기준"
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400 resize-none" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">마감일</span>
        <input type="date" value={mission.deadline} onChange={e => onChange({ deadline: e.target.value })}
          className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400" />
      </div>
    </div>
  );
}
