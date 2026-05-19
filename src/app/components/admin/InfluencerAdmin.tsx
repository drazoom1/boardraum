import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X, GripVertical } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

type AnswerType = 'short_text' | 'long_text' | 'radio' | 'checkbox' | 'date';

interface Question {
  id: string;
  text: string;
  type: AnswerType;
  required: boolean;
  options: string[]; // radio / checkbox 전용
}

interface Mission {
  id: string;
  title: string;
  description: string;
  deadline: string; // ISO date string
}

interface ApplicationForm {
  id: string;
  title: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  questions: Question[];
  missions: Mission[];
  createdAt: number;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  short_text: '단답형',
  long_text:  '장문형',
  radio:      '객관식 (단일 선택)',
  checkbox:   '체크박스 (복수 선택)',
  date:       '날짜',
};

const ANSWER_TYPE_ICONS: Record<AnswerType, string> = {
  short_text: '✏️',
  long_text:  '📝',
  radio:      '🔘',
  checkbox:   '☑️',
  date:       '📅',
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyQuestion(): Question {
  return { id: uid(), text: '', type: 'short_text', required: false, options: [] };
}

function emptyMission(): Mission {
  return { id: uid(), title: '', description: '', deadline: '' };
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════════════════

export function InfluencerAdmin() {
  const [forms, setForms] = useState<ApplicationForm[]>([]);
  const [creating, setCreating] = useState(false);

  const handleSave = (form: ApplicationForm) => {
    setForms(prev => [form, ...prev]);
    setCreating(false);
  };

  if (creating) {
    return (
      <CreateFormView
        onSave={handleSave}
        onCancel={() => setCreating(false)}
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
            <p className="text-xs text-gray-400 mt-0.5">신청서 생성, 심사, 미션 관리</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            새 신청서 만들기
          </button>
        </div>

        {/* 신청서 목록 */}
        {forms.length === 0 ? (
          <div className="px-5 py-16 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-bold text-gray-400">아직 만들어진 신청서가 없습니다</p>
            <p className="text-xs text-gray-300">위 버튼을 눌러 첫 인플루언서 신청서를 만들어보세요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {forms.map(form => (
              <FormCard key={form.id} form={form} onDelete={id => setForms(prev => prev.filter(f => f.id !== id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 신청서 카드 (목록용)
// ══════════════════════════════════════════════════════════════════════════════

function FormCard({ form, onDelete }: { form: ApplicationForm; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen(v => !v)} className="flex-1 text-left">
          <p className="text-sm font-bold text-gray-800">{form.title || '(제목 없음)'}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(form.createdAt).toLocaleString('ko-KR')} · 질문 {form.questions.length}개 · 미션 {form.missions.length}개
          </p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-gray-600">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(form.id)} className="text-red-400 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3 pl-1">
          <div className="text-xs text-gray-500">
            활동 기간: {form.periodStart || '-'} ~ {form.periodEnd || '-'}
          </div>
          {form.questions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-500">질문 목록</p>
              {form.questions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-300">{i + 1}.</span>
                  <span>{ANSWER_TYPE_ICONS[q.type]}</span>
                  <span>{q.text || '(질문 없음)'}</span>
                  {q.required && <span className="text-red-400 text-[10px]">필수</span>}
                </div>
              ))}
            </div>
          )}
          {form.missions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-500">미션 목록</p>
              {form.missions.map((m, i) => (
                <div key={m.id} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="text-gray-300 shrink-0">{i + 1}.</span>
                  <div>
                    <span className="font-medium">{m.title || '(제목 없음)'}</span>
                    {m.deadline && <span className="text-gray-400 ml-1.5">~ {m.deadline}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 신청서 생성 폼
// ══════════════════════════════════════════════════════════════════════════════

function CreateFormView({ onSave, onCancel }: {
  onSave: (form: ApplicationForm) => void;
  onCancel: () => void;
}) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd]     = useState('');
  const [questions, setQuestions]     = useState<Question[]>([emptyQuestion()]);
  const [missions, setMissions]       = useState<Mission[]>([emptyMission()]);

  // ── 질문 조작 ──────────────────────────────────────────────────────────────

  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeQuestion = (id: string) =>
    setQuestions(prev => prev.filter(q => q.id !== id));

  const addOption = (qId: string) =>
    setQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, options: [...q.options, ''] } : q
    ));

  const updateOption = (qId: string, oi: number, val: string) =>
    setQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, options: q.options.map((o, i) => i === oi ? val : o) } : q
    ));

  const removeOption = (qId: string, oi: number) =>
    setQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q
    ));

  // ── 미션 조작 ──────────────────────────────────────────────────────────────

  const updateMission = (id: string, patch: Partial<Mission>) =>
    setMissions(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));

  const moveMission = (idx: number, dir: -1 | 1) => {
    setMissions(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeMission = (id: string) =>
    setMissions(prev => prev.filter(m => m.id !== id));

  // ── 저장 ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    onSave({
      id: uid(),
      title,
      description,
      periodStart,
      periodEnd,
      questions,
      missions,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 bg-gradient-to-r from-yellow-50 to-orange-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-800">⭐ 새 인플루언서 신청서</h2>
            <p className="text-xs text-gray-400 mt-0.5">설문 질문과 미션을 설정하세요</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">

          {/* ① 기본 정보 */}
          <Section title="기본 정보">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">신청서 제목 *</span>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="예: 보드라움 인플루언서 1기 모집"
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">신청서 안내 문구</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="신청 자격, 혜택, 주의사항 등을 입력하세요"
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 resize-none"
              />
            </label>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-700">
              신청 자격: <span className="font-bold">보린이 등급 이상</span> (자동 적용)
            </div>
          </Section>

          {/* ② 활동 기간 */}
          <Section title="활동 기간">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-gray-600">시작일</span>
                <input
                  type="date"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">종료일</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400"
                />
              </label>
            </div>
          </Section>

          {/* ③ 설문 질문 */}
          <Section title="설문 질문">
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionItem
                  key={q.id}
                  question={q}
                  index={idx}
                  total={questions.length}
                  onChange={patch => updateQuestion(q.id, patch)}
                  onMove={dir => moveQuestion(idx, dir)}
                  onRemove={() => removeQuestion(q.id)}
                  onAddOption={() => addOption(q.id)}
                  onUpdateOption={(oi, val) => updateOption(q.id, oi, val)}
                  onRemoveOption={oi => removeOption(q.id, oi)}
                />
              ))}
            </div>
            <button
              onClick={() => setQuestions(prev => [...prev, emptyQuestion()])}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 hover:border-yellow-300 text-gray-400 hover:text-yellow-500 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              질문 추가
            </button>
          </Section>

          {/* ④ 미션 */}
          <Section title="미션">
            <div className="space-y-3">
              {missions.map((m, idx) => (
                <MissionItem
                  key={m.id}
                  mission={m}
                  index={idx}
                  total={missions.length}
                  onChange={patch => updateMission(m.id, patch)}
                  onMove={dir => moveMission(idx, dir)}
                  onRemove={() => removeMission(m.id)}
                />
              ))}
            </div>
            <button
              onClick={() => setMissions(prev => [...prev, emptyMission()])}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 hover:border-yellow-300 text-gray-400 hover:text-yellow-500 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              미션 추가
            </button>
          </Section>

        </div>

        {/* 저장 버튼 */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            신청서 저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 섹션 래퍼 ─────────────────────────────────────────────────────────────────

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

// ── 질문 아이템 ───────────────────────────────────────────────────────────────

function QuestionItem({ question, index, total, onChange, onMove, onRemove, onAddOption, onUpdateOption, onRemoveOption }: {
  question: Question; index: number; total: number;
  onChange: (patch: Partial<Question>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddOption: () => void;
  onUpdateOption: (oi: number, val: string) => void;
  onRemoveOption: (oi: number) => void;
}) {
  const needsOptions = question.type === 'radio' || question.type === 'checkbox';

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2">
        {/* 순서 */}
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}</span>
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />

        {/* 질문 텍스트 */}
        <input
          value={question.text}
          onChange={e => onChange({ text: e.target.value })}
          placeholder={`질문 ${index + 1}을 입력하세요`}
          className="flex-1 px-2 py-1 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-yellow-400"
        />

        {/* 답변 유형 */}
        <select
          value={question.type}
          onChange={e => {
            const type = e.target.value as AnswerType;
            onChange({ type, options: (type === 'radio' || type === 'checkbox') ? [''] : [] });
          }}
          className="shrink-0 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400"
        >
          {(Object.entries(ANSWER_TYPE_LABELS) as [AnswerType, string][]).map(([val, label]) => (
            <option key={val} value={val}>{ANSWER_TYPE_ICONS[val]} {label}</option>
          ))}
        </select>

        {/* 필수 여부 */}
        <label className="flex items-center gap-1 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={question.required}
            onChange={e => onChange({ required: e.target.checked })}
            className="accent-yellow-400"
          />
          <span className="text-xs text-gray-500">필수</span>
        </label>

        {/* 순서 이동 / 삭제 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} disabled={total === 1} className="p-1 text-red-300 hover:text-red-500 disabled:opacity-30">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 선택지 (객관식 / 체크박스) */}
      {needsOptions && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200 pt-2">
          {question.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="text-gray-300 text-xs w-4 shrink-0">
                {question.type === 'radio' ? '○' : '□'}
              </span>
              <input
                value={opt}
                onChange={e => onUpdateOption(oi, e.target.value)}
                placeholder={`선택지 ${oi + 1}`}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400"
              />
              <button onClick={() => onRemoveOption(oi)} className="text-red-300 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={onAddOption}
            className="text-xs text-yellow-500 hover:text-yellow-600 font-bold flex items-center gap-1 mt-1"
          >
            <Plus className="w-3 h-3" /> 선택지 추가
          </button>
        </div>
      )}
    </div>
  );
}

// ── 미션 아이템 ───────────────────────────────────────────────────────────────

function MissionItem({ mission, index, total, onChange, onMove, onRemove }: {
  mission: Mission; index: number; total: number;
  onChange: (patch: Partial<Mission>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}</span>
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
        <input
          value={mission.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder={`미션 ${index + 1} 제목`}
          className="flex-1 px-2 py-1 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-yellow-400"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} disabled={total === 1} className="p-1 text-red-300 hover:text-red-500 disabled:opacity-30">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <textarea
        value={mission.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={2}
        placeholder="미션 내용 및 달성 기준을 입력하세요"
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400 resize-none"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">마감일</span>
        <input
          type="date"
          value={mission.deadline}
          onChange={e => onChange({ deadline: e.target.value })}
          className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-yellow-400"
        />
      </div>
    </div>
  );
}
