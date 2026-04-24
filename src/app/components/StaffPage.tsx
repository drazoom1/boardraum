import { useState, useEffect } from 'react';
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

type StaffTab = 'status' | 'revenue' | 'agenda' | 'activity';

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
  { key: 'agenda', label: '의제' },
  { key: 'activity', label: '활동' },
];

export default function StaffPage({ accessToken, userId, onExit }: StaffPageProps) {
  const [tab, setTab] = useState<StaffTab>('status');
  const [checking, setChecking] = useState(true);
  const [member, setMember] = useState<StaffMember | null>(null);

  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [revLoaded, setRevLoaded] = useState(false);

  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaLoaded, setAgendaLoaded] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`${API}/staff/me`, { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.member) { onExit(); return; }
        setMember(d.member);
        // 월간 점수 로드
        const month = new Date().toISOString().slice(0, 7);
        fetch(`${API}/staff/monthly-scores?month=${month}`, { headers })
          .then(r2 => r2.json())
          .then(d2 => {
            const scores: Record<string, number> = d2.scores ?? {};
            const myScore = scores[d.member.userId] ?? 0;
            const total = Object.values(scores).reduce((s: number, p: any) => s + p, 0);
            setMonthlyScore(myScore);
            setPerfEquity(total > 0 ? 19 * myScore / total : 0);
          })
          .catch(() => {});
      })
      .catch(() => onExit())
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (tab !== 'revenue' || revLoaded) return;
    setRevLoading(true);
    fetch(`${API}/staff/revenue/public`, { headers })
      .then(r => r.json())
      .then(d => { setRevenues(d.list ?? []); setRevLoaded(true); })
      .catch(() => toast.error('수익 내역 불러오기 실패'))
      .finally(() => setRevLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'agenda' || agendaLoaded) return;
    setAgendaLoading(true);
    fetch(`${API}/staff/agenda`, { headers })
      .then(r => r.json())
      .then(d => { setAgendas(d.agendas ?? []); setAgendaLoaded(true); })
      .catch(() => toast.error('의제 불러오기 실패'))
      .finally(() => setAgendaLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'activity' || actLoaded || !member) return;
    setActLoading(true);
    fetch(`${API}/staff/activity/${member.userId}`, { headers })
      .then(r => r.json())
      .then(d => { setActLogs(d.logs ?? []); setActLoaded(true); })
      .catch(() => toast.error('활동 내역 불러오기 실패'))
      .finally(() => setActLoading(false));
    if (!meetingsLoaded) {
      fetch(`${API}/staff/meetings`, { headers })
        .then(r => r.json())
        .then(d => { setMeetings(d.meetings ?? []); setMeetingsLoaded(true); })
        .catch(() => {});
    }
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

  const handleVote = async (agendaId: string, vote: 'yes' | 'no') => {
    setVotingId(agendaId);
    try {
      const r = await fetch(`${API}/staff/agenda/${agendaId}/vote`, {
        method: 'POST', headers, body: JSON.stringify({ vote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '투표 실패');
      setAgendas(prev => prev.map(a => a.id === agendaId ? d.agenda : a));
      toast.success('투표 완료');
    } catch (e: any) { toast.error(e.message); }
    setVotingId(null);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onExit}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-gray-900 flex-1">운영진 페이지</span>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: grade.color }} />
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
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white shrink-0"
                  style={{ backgroundColor: grade.color }}>
                  {(member.nickname ?? '?')[0]}
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
                        isCurrent ? 'bg-opacity-10' : 'opacity-40'
                      }`}
                      style={isCurrent ? { backgroundColor: g.color + '18', outline: `1.5px solid ${g.color}` } : {}}>
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
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

        {/* ── 의제 ── */}
        {tab === 'agenda' && (
          agendaLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : agendas.length === 0 ? (
            <div className="py-20 text-center text-gray-300 text-sm">등록된 의제가 없습니다.</div>
          ) : (
            <>
              {agendas.filter(a => a.status === 'open').length > 0 && (
                <p className="text-xs font-semibold text-gray-400 px-1">투표 진행 중</p>
              )}
              {agendas.map(agenda => {
                const myVote = agenda.votes?.[userId];
                const votes = Object.values(agenda.votes ?? {});
                const yesCount = votes.filter(v => v === 'yes').length;
                const noCount = votes.filter(v => v === 'no').length;
                const total = yesCount + noCount;
                const isOpen = agenda.status === 'open';
                const yesPct = total > 0 ? Math.round(yesCount / total * 100) : 0;

                return (
                  <div key={agenda.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-sm font-bold text-gray-900 flex-1 leading-snug">{agenda.title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        isOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}>{isOpen ? '투표 중' : '종료'}</span>
                    </div>
                    {agenda.description && (
                      <p className="text-xs text-gray-500 mb-3 leading-relaxed">{agenda.description}</p>
                    )}

                    {/* 투표 현황 바 */}
                    {total > 0 && (
                      <div className="mb-3">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full transition-all"
                            style={{ width: `${yesPct}%` }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-green-600 font-semibold">찬성 {yesCount}</span>
                          <span className="text-[10px] text-gray-400">{total}명 참여</span>
                          <span className="text-[10px] text-red-500 font-semibold">반대 {noCount}</span>
                        </div>
                      </div>
                    )}

                    {isOpen && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVote(agenda.id, 'yes')}
                          disabled={votingId === agenda.id}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            myVote === 'yes'
                              ? 'bg-green-500 text-white shadow-sm'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}>
                          {votingId === agenda.id
                            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                            : `👍 찬성${myVote === 'yes' ? ' ✓' : ''}`}
                        </button>
                        <button
                          onClick={() => handleVote(agenda.id, 'no')}
                          disabled={votingId === agenda.id}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            myVote === 'no'
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'
                          }`}>
                          {votingId === agenda.id
                            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                            : `👎 반대${myVote === 'no' ? ' ✓' : ''}`}
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] text-gray-300">{(agenda.createdAt ?? '').slice(0, 10)}</span>
                      {myVote && (
                        <span className="text-[10px] text-gray-400">
                          내 투표권 {grade.baseEquity}% · {myVote === 'yes' ? '찬성' : '반대'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}

        {/* ── 활동 ── */}
        {tab === 'activity' && (
          <>
            {/* 활동 가이드 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">활동 가이드</h3>

              {/* 의무 달성 기준 */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
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

              {/* 항목별 설명 */}
              <div className="space-y-3">
                {[
                  {
                    label: '태그 매기기', points: 2, unit: '건', wip: false,
                    desc: '게시물에 게임 태그가 없을 경우 직접 게임을 검색해 태그를 추가합니다.',
                  },
                  {
                    label: '제목 작성', points: 3, unit: '건', wip: true,
                    desc: '준비중',
                  },
                  {
                    label: '보드위키 등록', points: 5, unit: '건', wip: false,
                    desc: '보드위키에 게임 정보를 직접 등록합니다.',
                  },
                  {
                    label: '신고 처리', points: 10, unit: '건', wip: true,
                    desc: '준비중',
                  },
                  {
                    label: '분쟁 중재', points: 15, unit: '건', wip: true,
                    desc: '준비중',
                  },
                  {
                    label: '신규 회원 유입', points: 20, unit: '명', wip: false,
                    desc: '자신의 추천인 코드로 신규 회원이 가입하면 자동 적립됩니다.',
                  },
                  {
                    label: '이벤트 기획', points: 30, unit: '건', wip: false,
                    desc: '운영진 페이지에서 의제를 제안하고, 과반수 동의를 얻어 이벤트·숙제가 실제로 진행될 때 적립됩니다.',
                  },
                  {
                    label: '회의 참석', points: 10, unit: '회', wip: false,
                    desc: '관리자가 생성한 회의에 참석 버튼을 누르면 자동 적립됩니다.',
                  },
                ].map(item => (
                  <div key={item.label} className={`flex gap-3 ${item.wip ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                        {item.wip && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">준비중</span>
                        )}
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

            {/* 회의 목록 */}
            {meetings.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">회의 참석 (+10점)</h3>
                <div className="space-y-2">
                  {meetings.map(m => {
                    const attended = (m.attendees ?? []).includes(userId);
                    const isOpen = m.status === 'open';
                    return (
                      <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{m.title}</p>
                          <p className="text-xs text-gray-400">{m.date ?? ''} · 참석 {(m.attendees ?? []).length}명</p>
                        </div>
                        {attended ? (
                          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-lg">✓ 참석완료</span>
                        ) : isOpen ? (
                          <button
                            onClick={() => handleAttend(m.id)}
                            disabled={attendingId === m.id}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                            {attendingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '참석'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-300">종료</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
