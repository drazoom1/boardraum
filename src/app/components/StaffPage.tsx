import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;

const STAFF_GRADES = [
  { level: 1, name: '노랑 당근', color: '#FACC15', baseEquity: 1.0 },
  { level: 2, name: '초록 당근', color: '#22C55E', baseEquity: 2.0 },
  { level: 3, name: '파랑 당근', color: '#3B82F6', baseEquity: 3.0 },
  { level: 4, name: '빨강 당근', color: '#EF4444', baseEquity: 4.0 },
  { level: 5, name: '보라 당근', color: '#A855F7', baseEquity: 4.5 },
  { level: 6, name: '검은 당근', color: '#1F2937', baseEquity: 5.0 },
];

type StaffTab = 'status' | 'revenue' | 'meeting' | 'activity';

interface StaffMember {
  userId: string;
  nickname: string;
  level?: number;
  joinedAt?: string;
}

interface RevenueEntry {
  id: string;
  amount: number;
  category: string;
  note?: string;
  recordedAt: string;
  paid: boolean;
}

interface Agenda {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  votes: Record<string, 'yes' | 'no'>;
}

interface ActivityLog {
  action: string;
  detail?: string;
  recordedAt: string;
}

interface StaffPageProps {
  accessToken: string;
  userId: string;
  onExit: () => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 30) return (iso ?? '').slice(0, 10);
  if (d >= 1) return `${d}일 전`;
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h}시간 전`;
  const m = Math.floor(diff / 60000);
  return m >= 1 ? `${m}분 전` : '방금';
}

const TABS: { key: StaffTab; label: string }[] = [
  { key: 'status', label: '현황' },
  { key: 'revenue', label: '수익' },
  { key: 'meeting', label: '회의' },
  { key: 'activity', label: '활동' },
];

export default function StaffPage({ accessToken, userId, onExit }: StaffPageProps) {
  const [tab, setTab] = useState<StaffTab>('status');
  const [checking, setChecking] = useState(true);
  const [member, setMember] = useState<StaffMember | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // 동의서 모달
  const [showAgreement, setShowAgreement] = useState(false);
  const [agreementScrolled, setAgreementScrolled] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [submittingAgreement, setSubmittingAgreement] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [revLoaded, setRevLoaded] = useState(false);

  // 의제 제출 (회의 탭)
  const [agendaFormId, setAgendaFormId] = useState<string | null>(null);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDesc, setAgendaDesc] = useState('');
  const [submittingAgenda, setSubmittingAgenda] = useState(false);

  // 회의 생성 (관리자)
  const [isAdmin, setIsAdmin] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // 회의 완료 (관리자)
  const [closeFormId, setCloseFormId] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState('');
  const [minutesPdfFile, setMinutesPdfFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [closingMeeting, setClosingMeeting] = useState(false);

  const [actLogs, setActLogs] = useState<ActivityLog[]>([]);
  const [actLoading, setActLoading] = useState(false);
  const [actLoaded, setActLoaded] = useState(false);

  // 이달 점수 + 성과 지분
  const [monthlyScore, setMonthlyScore] = useState(0);
  const [perfEquity, setPerfEquity] = useState(0);

  // 회의
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const [attendingId, setAttendingId] = useState<string | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

  const loadMonthlyScores = (memberId: string) => {
    const month = new Date().toISOString().slice(0, 7);
    fetch(`${API}/staff/monthly-scores?month=${month}`, { headers })
      .then(r => r.json())
      .then(d => {
        const scores: Record<string, number> = d.scores ?? {};
        const myScore = scores[memberId] ?? 0;
        const total = Object.values(scores).reduce((s: number, p: any) => s + p, 0);
        setMonthlyScore(myScore);
        setPerfEquity(total > 0 ? 19 * myScore / total : 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`${API}/staff/me`, { headers })
      .then(r => r.json())
      .then(async d => {
        if (!d.member) { onExit(); return; }
        setMember(d.member);
        setIsAdmin(!!d.member.isAdmin);
        loadMonthlyScores(d.member.userId);
        // 동의서 확인
        const ag = await fetch(`${API}/staff/agreement-status`, { headers }).then(r => r.json()).catch(() => ({ agreed: false }));
        if (!ag.agreed) setShowAgreement(true);
      })
      .catch(() => onExit())
      .finally(() => setChecking(false));
  }, []);

  // 현황 탭으로 돌아올 때마다 점수 갱신
  useEffect(() => {
    if (tab === 'status' && member) loadMonthlyScores(member.userId);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'revenue' || revLoaded) return;
    setRevLoading(true);
    fetch(`${API}/staff/revenue/public`, { headers })
      .then(r => r.json())
      .then(d => { setRevenues(d.list ?? []); setRevLoaded(true); })
      .catch(() => toast.error('수익 내역 불러오기 실패'))
      .finally(() => setRevLoading(false));
  }, [tab]);

  // 동의서 모달 스크롤 끝 감지
  useEffect(() => {
    if (!showAgreement || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAgreementScrolled(true); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [showAgreement]);

  const handleAgree = async () => {
    setSubmittingAgreement(true);
    try {
      const r = await fetch(`${API}/staff/agreement`, { method: 'POST', headers });
      if (!r.ok) throw new Error('저장 실패');
      setShowAgreement(false);
    } catch (e: any) { toast.error(e.message); }
    setSubmittingAgreement(false);
  };

  const handleResetAgreement = async () => {
    if (!member) return;
    try {
      const r = await fetch(`${API}/staff/agreement/${member.userId}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error('초기화 실패');
      setAgreementScrolled(false);
      setAgreementChecked(false);
      setShowAgreement(true);
      toast.success('동의서가 초기화됐습니다.');
    } catch (e: any) { toast.error(e.message); }
  };

  const loadMeetings = () => {
    fetch(`${API}/staff/meetings`, { headers })
      .then(r => r.json())
      .then(d => { setMeetings(d.meetings ?? []); setMeetingsLoaded(true); })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab !== 'meeting') return;
    loadMeetings();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'activity' || actLoaded || !member) return;
    setActLoading(true);
    fetch(`${API}/staff/activity/${member.userId}`, { headers })
      .then(r => r.json())
      .then(d => { setActLogs(d.logs ?? []); setActLoaded(true); })
      .catch(() => toast.error('활동 내역 불러오기 실패'))
      .finally(() => setActLoading(false));
    if (!meetingsLoaded) loadMeetings();
  }, [tab, member]);

  const handleAttend = async (meetingId: string) => {
    setAttendingId(meetingId);
    try {
      const r = await fetch(`${API}/staff/meeting/${meetingId}/attend`, {
        method: 'POST', headers,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '참석 처리 실패');
      setMeetings(prev => prev.map(m => m.id === meetingId ? d.meeting : m));
      toast.success('참석 완료! +10점 적립됐습니다.');
      // 월간 점수 갱신
      setMonthlyScore(s => s + 10);
    } catch (e: any) { toast.error(e.message); }
    setAttendingId(null);
  };

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) { toast.error('회의 제목을 입력해주세요'); return; }
    setCreatingMeeting(true);
    try {
      const r = await fetch(`${API}/staff/meeting`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: newMeetingTitle.trim(), date: newMeetingDate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '생성 실패');
      setMeetings(d.meetings ?? []);
      setNewMeetingTitle('');
      setNewMeetingDate('');
      toast.success('회의가 생성됐습니다.');
    } catch (e: any) { toast.error(e.message); }
    setCreatingMeeting(false);
  };

  const handleCloseMeeting = async (meetingId: string) => {
    setClosingMeeting(true);
    try {
      let minutesPdfUrl: string | null = null;
      if (minutesPdfFile) {
        setUploadingPdf(true);
        const fd = new FormData();
        fd.append('file', minutesPdfFile);
        const uploadRes = await fetch(`${API}/staff/upload-pdf`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: fd,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error ?? 'PDF 업로드 실패');
        minutesPdfUrl = uploadData.url;
        setUploadingPdf(false);
      }
      const r = await fetch(`${API}/staff/meeting/${meetingId}/close`, {
        method: 'POST', headers,
        body: JSON.stringify({ minutes: minutesText.trim(), minutesPdfUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '완료 처리 실패');
      setMeetings(prev => prev.map(m => m.id === meetingId ? d.meeting : m));
      setCloseFormId(null);
      setMinutesText('');
      setMinutesPdfFile(null);
      toast.success('회의가 완료 처리됐습니다.');
    } catch (e: any) { toast.error(e.message); setUploadingPdf(false); }
    setClosingMeeting(false);
  };

  const handleSubmitAgenda = async (meetingId: string) => {
    if (!agendaTitle.trim()) { toast.error('안건 제목을 입력해주세요'); return; }
    setSubmittingAgenda(true);
    try {
      const r = await fetch(`${API}/staff/meeting/${meetingId}/agenda`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: agendaTitle.trim(), description: agendaDesc.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '제출 실패');
      setMeetings(prev => prev.map(m => m.id === meetingId ? d.meeting : m));
      setAgendaFormId(null);
      setAgendaTitle('');
      setAgendaDesc('');
      toast.success('안건이 제출됐습니다.');
    } catch (e: any) { toast.error(e.message); }
    setSubmittingAgenda(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!member) return null;

  const grade = STAFF_GRADES.find(g => g.level === (member.level ?? 1)) ?? STAFF_GRADES[0];

  // ── 동의서 모달 ──
  if (showAgreement) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        {/* 헤더 */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <button onClick={onExit} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">운영진 동의서</p>
            <p className="text-[11px] text-gray-400">끝까지 스크롤 후 동의해주세요</p>
          </div>
        </div>

        {/* 스크롤 영역: iframe + 동의 폼 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <iframe
            src="/staff-agreement.pdf"
            className="w-full border-0 block"
            style={{ height: '72vh' }}
            title="운영진 동의서"
          />
          {/* 센티넬: 여기까지 스크롤하면 체크박스 활성화 */}
          <div ref={sentinelRef} className="h-px" />

          {/* 동의 폼 */}
          <div className="px-5 py-5 bg-gray-50 border-t border-gray-100">
            {!agreementScrolled && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                <span className="text-base">⬇</span>
                <p className="text-xs text-amber-700 font-medium">위로 스크롤하여 PDF 전체 내용을 확인해주세요</p>
              </div>
            )}
            <label className={`flex items-start gap-3 cursor-pointer mb-4 ${!agreementScrolled ? 'opacity-40 pointer-events-none' : ''}`}>
              <div
                onClick={() => agreementScrolled && setAgreementChecked(v => !v)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                  agreementChecked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                }`}>
                {agreementChecked && <span className="text-white text-[10px] font-black">✓</span>}
              </div>
              <span className="text-sm text-gray-700 leading-snug">동의서 내용을 모두 읽었으며 이에 동의합니다</span>
            </label>
            <button
              onClick={handleAgree}
              disabled={!agreementChecked || submittingAgreement}
              className="w-full py-3.5 bg-gray-900 text-white text-sm font-bold rounded-2xl disabled:opacity-40 active:scale-95 transition-all">
              {submittingAgreement ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '동의합니다'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 운영진 가이드 PDF 모달 — 풀스크린 */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
          <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            <button onClick={() => setShowGuideModal(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-gray-900 flex-1 text-sm">운영진 가이드</span>
          </div>
          <iframe
            src="/staff-agreement.pdf"
            className="flex-1 w-full border-0"
            title="운영진 가이드"
          />
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onExit}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-gray-900 flex-1">운영진 페이지</span>
          <button onClick={() => setShowGuideModal(true)}
            className="text-xs text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
            📋 운영진 가이드
          </button>
        </div>
        <div className="max-w-lg mx-auto px-4 flex border-t border-gray-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">

        {/* ── 현황 ── */}
        {tab === 'status' && (
          <>
            {/* 프로필 카드 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white"
                    style={{ backgroundColor: grade.color }}>
                    {(member.nickname ?? '?')[0]}
                  </div>
                  <img src={`/staff-grade-${member.level ?? 1}.webp`} alt={grade.name}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-md object-cover border-2 border-white"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-base font-bold text-gray-900">{member.nickname}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: grade.color }}>
                      Lv.{member.level ?? 1} {grade.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">합류일 · {(member.joinedAt ?? '').slice(0, 10)}</p>
                  {isAdmin && (
                    <button onClick={handleResetAgreement}
                      className="mt-1.5 text-[11px] text-gray-400 hover:text-red-500 underline underline-offset-2 transition-colors">
                      동의서 초기화
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 이달 활동 점수 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">이달 활동 점수</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-gray-900">{monthlyScore}</span>
                <span className="text-lg font-bold text-gray-400">점</span>
              </div>
              <div className="mt-2 flex gap-1.5 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${monthlyScore >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {monthlyScore >= 50 ? '✓ 의무 달성' : '⚠ 50점 미달'}
                </span>
              </div>
            </div>

            {/* 지분 현황 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">내 지분</h3>
              <div className="space-y-0">
                <div className="flex justify-between items-baseline py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600">기본 지분</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-gray-900">{grade.baseEquity}</span>
                    <span className="text-sm font-bold text-gray-400">%</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline py-2">
                  <span className="text-sm text-gray-600">성과 지분 <span className="text-[10px] text-gray-400">(이달 활동점수 기반)</span></span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black" style={{ color: perfEquity > 0 ? '#3B82F6' : '#d1d5db' }}>
                      {perfEquity.toFixed(1)}
                    </span>
                    <span className="text-sm font-bold text-gray-400">%</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline py-2 border-t border-gray-100 mt-1">
                  <span className="text-sm font-bold text-gray-700">이달 총 지분</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-gray-900">{(grade.baseEquity + perfEquity).toFixed(1)}</span>
                    <span className="text-sm font-bold text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 등급 로드맵 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">등급 로드맵</h3>
              <div className="space-y-2">
                {STAFF_GRADES.map(g => {
                  const isCurrent = g.level === (member.level ?? 1);
                  return (
                    <div key={g.level}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                        isCurrent ? 'ring-2 ring-offset-1' : 'opacity-40'
                      }`}
                      style={isCurrent ? { backgroundColor: g.color + '18', outline: `1.5px solid ${g.color}` } : {}}>
                      <img src={`/staff-grade-${g.level}.webp`} alt={g.name}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-800">Lv.{g.level} {g.name}</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: isCurrent ? g.color : '#9ca3af' }}>
                        {g.baseEquity}%
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: g.color }}>현재</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── 수익 ── */}
        {tab === 'revenue' && (
          revLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : revenues.length === 0 ? (
            <div className="py-20 text-center text-gray-300 text-sm">공개된 수익 내역이 없습니다.</div>
          ) : (
            <>
              {/* 요약 */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">총 배분 요약</h3>
                <div className="flex gap-3">
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 mb-1">총 수익</p>
                    <p className="text-sm font-bold text-gray-900">
                      {revenues.reduce((s, e) => s + e.amount, 0).toLocaleString()}원
                    </p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 mb-1">내 총 배분</p>
                    <p className="text-sm font-bold text-gray-900">
                      {revenues
                        .reduce((s, e) => s + Math.round(e.amount * 0.9 * grade.baseEquity / 100), 0)
                        .toLocaleString()}원
                    </p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 mb-1">지급완료</p>
                    <p className="text-sm font-bold text-green-600">
                      {revenues
                        .filter(e => e.paid)
                        .reduce((s, e) => s + Math.round(e.amount * 0.9 * grade.baseEquity / 100), 0)
                        .toLocaleString()}원
                    </p>
                  </div>
                </div>
              </div>

              {revenues.map(entry => {
                const net = Math.round(entry.amount * 0.9);
                const myShare = Math.round(net * grade.baseEquity / 100);
                return (
                  <div key={entry.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {entry.category}
                      </span>
                      {entry.paid
                        ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">지급완료</span>
                        : <span className="text-[10px] bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full font-semibold">미지급</span>}
                    </div>
                    <p className="text-xl font-black text-gray-900 mb-0.5">{entry.amount.toLocaleString()}원</p>
                    {entry.note && <p className="text-xs text-gray-400">{entry.note}</p>}
                    <p className="text-[10px] text-gray-300 mt-0.5">{(entry.recordedAt ?? '').slice(0, 10)}</p>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-xs text-gray-500">내 배분 ({grade.baseEquity}% · VAT 차감 후)</span>
                      <span className="text-sm font-bold text-gray-800">{myShare.toLocaleString()}원</span>
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}

        {/* ── 회의 ── */}
        {tab === 'meeting' && (
          <>
          {/* 관리자 전용: 회의 생성 */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">회의 생성</h3>
              <div className="space-y-2">
                <input
                  value={newMeetingTitle}
                  onChange={e => setNewMeetingTitle(e.target.value)}
                  placeholder="회의 제목 *"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                />
                <input
                  type="date"
                  value={newMeetingDate}
                  onChange={e => setNewMeetingDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-gray-400"
                />
                <button
                  onClick={handleCreateMeeting}
                  disabled={creatingMeeting || !newMeetingTitle.trim()}
                  className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-700 disabled:opacity-50">
                  {creatingMeeting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '회의 생성'}
                </button>
              </div>
            </div>
          )}

          {meetings.length === 0 ? (
            <div className="py-20 text-center text-gray-300 text-sm">등록된 회의가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {meetings.map(m => {
                const isOpen = m.status === 'open';
                const attended = (m.attendees ?? []).includes(userId);
                const isFormOpen = agendaFormId === m.id;
                const agendas: any[] = m.agendas ?? [];
                return (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {/* 회의 헤더 */}
                    <div className="p-5 pb-4">
                      <div className="flex items-start gap-2 mb-1">
                        <h3 className="text-sm font-bold text-gray-900 flex-1 leading-snug">{m.title}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                          isOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>{isOpen ? '진행중' : '종료'}</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        {m.date ?? ''}{m.date ? ' · ' : ''}참석 {(m.attendees ?? []).length}명
                      </p>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 flex-wrap">
                        {isOpen && (
                          attended ? (
                            <span className="text-[11px] font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-xl">✓ 참석완료</span>
                          ) : (
                            <button
                              onClick={() => handleAttend(m.id)}
                              disabled={attendingId === m.id}
                              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                              {attendingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '참석 +10pt'}
                            </button>
                          )
                        )}
                        {isOpen && (
                          <button
                            onClick={() => {
                              if (isFormOpen) { setAgendaFormId(null); setAgendaTitle(''); setAgendaDesc(''); }
                              else { setAgendaFormId(m.id); setCloseFormId(null); }
                            }}
                            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-xl hover:bg-gray-700">
                            {isFormOpen ? '취소' : '📋 의제 제출'}
                          </button>
                        )}
                        {isOpen && isAdmin && (
                          <button
                            onClick={() => {
                              if (closeFormId === m.id) { setCloseFormId(null); setMinutesText(''); }
                              else { setCloseFormId(m.id); setAgendaFormId(null); }
                            }}
                            className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100">
                            {closeFormId === m.id ? '취소' : '회의완료'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 회의완료 + 회의록 폼 */}
                    {closeFormId === m.id && (
                      <div className="px-5 pb-5 border-t border-gray-100 pt-4 bg-red-50">
                        <p className="text-xs font-bold text-red-700 mb-3">회의 완료 처리</p>
                        <textarea
                          value={minutesText}
                          onChange={e => setMinutesText(e.target.value)}
                          placeholder="회의록 내용 (결정사항, 논의내용 등)"
                          rows={4}
                          className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm mb-2 bg-white focus:outline-none focus:border-red-400 resize-none"
                        />
                        {/* PDF 첨부 */}
                        <label className="flex items-center gap-2 cursor-pointer mb-3">
                          <div className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm ${minutesPdfFile ? 'border-red-400 bg-white' : 'border-red-200 bg-white'}`}>
                            <span className="text-lg">📎</span>
                            <span className={minutesPdfFile ? 'text-gray-800 truncate' : 'text-gray-400'}>
                              {minutesPdfFile ? minutesPdfFile.name : 'PDF 파일 첨부 (선택)'}
                            </span>
                            {minutesPdfFile && (
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); setMinutesPdfFile(null); }}
                                className="ml-auto text-gray-400 hover:text-red-500 text-xs shrink-0">✕</button>
                            )}
                          </div>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={e => setMinutesPdfFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                        <button
                          onClick={() => handleCloseMeeting(m.id)}
                          disabled={closingMeeting || uploadingPdf}
                          className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                          {uploadingPdf
                            ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />PDF 업로드 중...</span>
                            : closingMeeting
                            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                            : '회의 완료 확정'}
                        </button>
                      </div>
                    )}

                    {/* 의제 제출 인라인 폼 */}
                    {isFormOpen && (
                      <div className="px-5 pb-5 border-t border-gray-100 pt-4 bg-gray-50">
                        <p className="text-xs font-bold text-gray-700 mb-3">안건 제출</p>
                        <input
                          value={agendaTitle}
                          onChange={e => setAgendaTitle(e.target.value)}
                          placeholder="안건 제목 *"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 bg-white focus:outline-none focus:border-gray-400"
                        />
                        <textarea
                          value={agendaDesc}
                          onChange={e => setAgendaDesc(e.target.value)}
                          placeholder="상세 내용 (선택)"
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 bg-white focus:outline-none focus:border-gray-400 resize-none"
                        />
                        <button
                          onClick={() => handleSubmitAgenda(m.id)}
                          disabled={submittingAgenda}
                          className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                          {submittingAgenda ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '제출'}
                        </button>
                      </div>
                    )}

                    {/* 회의록 (종료된 회의) */}
                    {!isOpen && (m.minutes || m.minutesPdfUrl) && (
                      <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                        <p className="text-[11px] font-semibold text-gray-500 mb-2">📝 회의록</p>
                        {m.minutes && (
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-2">{m.minutes}</p>
                        )}
                        {m.minutesPdfUrl && (
                          <a
                            href={m.minutesPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100">
                            📎 회의록 PDF 다운로드
                          </a>
                        )}
                        {m.closedAt && <p className="text-[10px] text-gray-300 mt-2">{m.closedAt.slice(0, 10)} 완료</p>}
                      </div>
                    )}

                    {/* 제출된 안건 목록 */}
                    {agendas.length > 0 && (
                      <div className="border-t border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-400 px-5 pt-3 pb-1">제출된 안건 {agendas.length}건</p>
                        <div className="divide-y divide-gray-50">
                          {agendas.map((a: any, i: number) => (
                            <div key={a.id ?? i} className="px-5 py-3">
                              <p className="text-sm font-semibold text-gray-800 leading-snug">{a.title}</p>
                              {a.description && (
                                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{a.description}</p>
                              )}
                              <p className="text-[10px] text-gray-300 mt-1">{(a.submittedAt ?? '').slice(0, 10)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </>
        )}

        {/* ── 활동 ── */}
        {tab === 'activity' && (
          <>
            {/* 진행중 항목 — 참석 가능한 회의 */}
            {meetings.filter(m => m.status === 'open' && !(m.attendees ?? []).includes(userId)).length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-blue-700 mb-2">🔔 지금 참석 가능한 회의</p>
                <div className="space-y-2">
                  {meetings
                    .filter(m => m.status === 'open' && !(m.attendees ?? []).includes(userId))
                    .map(m => (
                      <div key={m.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{m.title}</p>
                          <p className="text-xs text-gray-400">{m.date ?? ''} · 참석 {(m.attendees ?? []).length}명 · +10점</p>
                        </div>
                        <button
                          onClick={() => handleAttend(m.id)}
                          disabled={attendingId === m.id}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                          {attendingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '참석'}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 활동 가이드 — 접기/펼치기 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setGuideOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left">
                <span className="text-sm font-bold text-gray-800">활동 가이드</span>
                <span className="text-gray-400 text-xs">{guideOpen ? '▲ 접기' : '▼ 펼치기'}</span>
              </button>
              {guideOpen && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  {/* 의무 달성 기준 */}
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mt-4 mb-4">
                    <p className="text-xs font-bold text-amber-700 mb-2">📋 월간 의무 달성 기준</p>
                    <div className="space-y-1">
                      {[
                        { label: '태그 매기기 + 제목 작성', target: '20건 이상' },
                        { label: '보드위키 등록', target: '5건 이상' },
                        { label: '회의 참석', target: '1회 이상' },
                        { label: '월 합계 점수', target: '50점 이상' },
                      ].map(item => (
                        <div key={item.label} className="flex justify-between text-xs">
                          <span className="text-amber-700">{item.label}</span>
                          <span className="font-semibold text-amber-800">{item.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* 항목별 설명 — 진행중 항목 우선 */}
                  <div className="space-y-3">
                    {[
                      { label: '태그 매기기',    points: 2,  unit: '건', wip: false, desc: '게시물에 게임 태그가 없을 경우 직접 게임을 검색해 태그를 추가합니다.' },
                      { label: '보드위키 등록',  points: 5,  unit: '건', wip: false, desc: '보드위키에 게임 정보를 직접 등록합니다.' },
                      { label: '회의 참석',      points: 10, unit: '회', wip: false, desc: '관리자가 생성한 회의에 참석 버튼을 누르면 자동 적립됩니다.' },
                      { label: '신규 회원 유입', points: 20, unit: '명', wip: false, desc: '자신의 추천인 코드로 신규 회원이 가입하면 자동 적립됩니다.' },
                      { label: '이벤트 기획',    points: 30, unit: '건', wip: false, desc: '의제를 제안하고 과반수 동의를 얻어 이벤트·숙제가 실제로 진행될 때 적립됩니다.' },
                      { label: '제목 작성',      points: 3,  unit: '건', wip: true,  desc: '준비중' },
                      { label: '신고 처리',      points: 10, unit: '건', wip: true,  desc: '준비중' },
                      { label: '분쟁 중재',      points: 15, unit: '건', wip: true,  desc: '준비중' },
                    ].map(item => (
                      <div key={item.label} className={`flex gap-3 ${item.wip ? 'opacity-40' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                            {item.wip && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">준비중</span>}
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-black text-blue-600">+{item.points}점</span>
                          <p className="text-[10px] text-gray-400">/{item.unit}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 활동 로그 */}
            {actLoading ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
              </div>
            ) : actLogs.length === 0 ? (
              <div className="py-12 text-center text-gray-300 text-sm">활동 내역이 없습니다.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
                {actLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{log.action}</p>
                      {log.detail && <p className="text-xs text-gray-400 mt-0.5">{log.detail}</p>}
                    </div>
                    <span className="text-[10px] text-gray-300 whitespace-nowrap mt-0.5">
                      {timeAgo(log.recordedAt ?? '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
