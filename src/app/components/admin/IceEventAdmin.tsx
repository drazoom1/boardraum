import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { RefreshCw, Loader2, ChevronDown, ChevronUp, Trash2, Trophy, Users, Zap, Eye } from 'lucide-react';
import { RouletteWheel } from '../RouletteModal';

const ICE_API = `https://${projectId}.supabase.co/functions/v1/make-server-bb453c8e`;

// ── 단계 레이블 ──
const STAGE_LABELS: Record<string, string> = {
  '100': '100% — 얼음 그대로',
  '90':  '90%',
  '70':  '70%',
  '50':  '50%',
  '30':  '30%',
  '40':  '40%',
  '10':  '10%',
  '0':   '0% — 완전히 깨진 상태',
};
const STAGES = ['100', '90', '70', '50', '30', '10', '0'] as const;

// ── Base64 변환 ──
function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── 진행률 색상 ──
function iceColor(pct: number) {
  if (pct > 70) return 'from-cyan-400 to-blue-500';
  if (pct > 40) return 'from-cyan-300 to-teal-400';
  if (pct > 10) return 'from-yellow-300 to-orange-400';
  return 'from-red-400 to-rose-500';
}

// ══════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════
export function IceEventAdmin({ accessToken }: { accessToken: string }) {
  const [event, setEvent] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  const cleanupImages = async () => {
    try {
      await fetch(`${ICE_API}/ice/admin/cleanup-images`, { method: 'POST', headers: authHeader() });
    } catch {}
  };

  const load = useCallback(async (isRetry = false) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/overview`, { headers: authHeader() });
      let d: any = {};
      try { d = await res.json(); } catch {}
      if (res.ok) {
        setEvent(d.event ?? null);
        setParticipants(d.participants ?? []);
        setTotalCards(d.totalCards ?? 0);
        setHistory(d.history ?? []);
      } else if (res.status === 546 && !isRetry) {
        // KV 이미지 용량 초과 → 자동 정리 후 재시도
        toast.loading('데이터 정리 중...', { id: 'cleanup' });
        await cleanupImages();
        toast.dismiss('cleanup');
        setLoading(false);
        return load(true);
      } else {
        setLoadFailed(true);
        toast.error(d?.error || `데이터 불러오기 실패 (HTTP ${res.status})`, { duration: 8000 });
      }
    } catch (e: any) {
      setLoadFailed(true);
      toast.error(`네트워크 오류: ${e?.message ?? e}`);
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🧊 얼음깨기 이벤트</h2>
          <p className="text-sm text-gray-400 mt-0.5">보너스카드로 얼음을 깨고 숨은 상품을 찾아요</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : (
        <>
          {/* [1] 이벤트 없을 때 — 개최 폼 (로드 실패 시는 에러 표시) */}
          {!event && !loadFailed && <CreateForm accessToken={accessToken} onCreated={load} />}
          {!event && loadFailed && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <p className="text-red-600 font-semibold mb-3">데이터를 불러오지 못했습니다</p>
              <button onClick={() => load()} className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold">다시 시도</button>
            </div>
          )}

          {/* [2] 진행 중 */}
          {event?.status === 'active' && (
            <MonitorSection event={event} participants={participants} totalCards={totalCards} accessToken={accessToken} onRefresh={load} />
          )}

          {/* [3] 종료 / 추첨 대기 */}
          {event?.status === 'ended' && (
            <DrawSection event={event} participants={participants} totalCards={totalCards} accessToken={accessToken} onRefresh={load} />
          )}

          {/* [3b] 추첨 완료 */}
          {event?.status === 'drawn' && (
            <DrawnSection event={event} participants={participants} totalCards={totalCards} accessToken={accessToken} onRefresh={load} />
          )}

          {/* [4] 과거 이력 — 항상 표시 */}
          <HistorySection history={history} openId={openHistory} onToggle={setOpenHistory} />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// [1] 이벤트 개최 폼
// ══════════════════════════════════════════════════════════════════
function CreateForm({ accessToken, onCreated }: { accessToken: string; onCreated: () => void }) {
  const [title, setTitle]           = useState('');
  const [desc, setDesc]             = useState('');
  const [prize, setPrize]           = useState('');
  const [prizeImg, setPrizeImg]     = useState('');
  const [iceTotal, setIceTotal]     = useState(300);
  const [damage, setDamage]         = useState(3);
  const [iceImages, setIceImages]   = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);

  const handlePrizeImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPrizeImg(await fileToBase64(f));
  };

  const handleStageImg = async (stage: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await fileToBase64(f);
    setIceImages(prev => ({ ...prev, [stage]: b64 }));
  };

  const hitCount = iceTotal > 0 && damage > 0 ? Math.ceil(iceTotal / damage) : 0;

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('이벤트 제목을 입력해주세요'); return; }
    if (iceTotal <= 0 || damage <= 0) { toast.error('얼음 강도와 카드 수치는 0 초과여야 합니다'); return; }
    setSaving(true);
    try {
      const payload = JSON.stringify({ title, description: desc, prizeGameName: prize, prizeGameImage: prizeImg, iceTotal, iceDamagePerCard: damage, iceImages });
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-bb453c8e/ice/admin/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: payload,
      });
      let d: any = {};
      try { d = await res.json(); } catch {}
      if (!res.ok) {
        const msg = d?.error || d?.message || d?.msg || `이벤트 생성 실패 (HTTP ${res.status})`;
        toast.error(msg, { duration: 8000 });
        return;
      }
      toast.success('이벤트가 시작됐어요! 🧊');
      onCreated();
    } catch (e: any) { toast.error(`네트워크 오류: ${e?.message ?? e}`); }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 bg-gradient-to-r from-cyan-50 to-blue-50">
        <h3 className="text-sm font-bold text-gray-700">🧊 새 얼음깨기 이벤트 개최</h3>
        <p className="text-xs text-gray-400 mt-0.5">현재 진행 중인 이벤트가 없습니다</p>
      </div>
      <div className="px-5 py-5 space-y-5">

        {/* 기본 정보 */}
        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="text-xs font-bold text-gray-600">이벤트 제목 *</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 5월 얼음깨기 이벤트"
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-600">이벤트 설명</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="이벤트 안내 문구..."
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400 resize-none" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-600">상품 보드게임 이름</span>
            <input value={prize} onChange={e => setPrize(e.target.value)} placeholder="예: 카탄"
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400" />
          </label>
        </div>

        {/* 숫자 설정 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-cyan-50 rounded-xl p-4">
            <p className="text-xs font-bold text-cyan-700 mb-1">얼음 강도 (iceTotal)</p>
            <input type="number" min={1} value={iceTotal} onChange={e => setIceTotal(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-bold text-cyan-700 bg-white border-2 border-cyan-200 rounded-lg text-center focus:outline-none focus:border-cyan-400" />
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-700 mb-1">카드 1회당 데미지</p>
            <input type="number" min={1} value={damage} onChange={e => setDamage(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-bold text-blue-700 bg-white border-2 border-blue-200 rounded-lg text-center focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        {hitCount > 0 && (
          <div className="text-center py-2 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500">
              총 <span className="font-bold text-cyan-600">{hitCount.toLocaleString()}회</span> 카드 사용으로 얼음이 다 깨집니다
              <span className="text-xs text-gray-400 ml-1">({iceTotal} ÷ {damage})</span>
            </p>
          </div>
        )}

        {/* 상품 이미지 */}
        <div>
          <p className="text-xs font-bold text-gray-600 mb-2">얼음 안에 담긴 보드게임 이미지</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-xl cursor-pointer transition-colors">
              <span>📷 이미지 선택</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePrizeImg} />
            </label>
            {prizeImg && (
              <img src={prizeImg} alt="상품" className="w-14 h-14 object-cover rounded-xl border border-gray-200 shadow-sm" />
            )}
          </div>
        </div>

        {/* 단계별 얼음 이미지 */}
        <div>
          <p className="text-xs font-bold text-gray-600 mb-3">단계별 얼음 이미지 7장</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STAGES.map(stage => (
              <StageImageUploader
                key={stage}
                stage={stage}
                label={STAGE_LABELS[stage] ?? `${stage}%`}
                value={iceImages[stage] ?? ''}
                onChange={b64 => setIceImages(prev => ({ ...prev, [stage]: b64 }))}
                onFileChange={e => handleStageImg(stage, e)}
              />
            ))}
          </div>
        </div>

        {/* 시작 버튼 */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 text-white text-sm font-bold rounded-xl hover:bg-cyan-600 transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {saving ? '생성 중...' : '이벤트 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 단계 이미지 업로더 ──
function StageImageUploader({ stage, label, value, onChange, onFileChange }: {
  stage: string; label: string; value: string;
  onChange: (b64: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-full aspect-square rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${value ? 'border-cyan-300 bg-cyan-50' : 'border-gray-200 bg-gray-50'}`}>
        {value
          ? <img src={value} alt={label} className="w-full h-full object-cover" />
          : <span className="text-2xl opacity-30">🧊</span>
        }
      </div>
      <p className="text-[10px] text-center text-gray-500 font-medium leading-tight">{label}</p>
      <label className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-[11px] font-semibold text-gray-600 rounded-lg cursor-pointer transition-colors">
        {value ? '변경' : '업로드'}
        <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </label>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// [2] 진행 중 모니터링
// ══════════════════════════════════════════════════════════════════
function MonitorSection({ event, participants, totalCards, accessToken, onRefresh }: {
  event: any; participants: any[]; totalCards: number; accessToken: string; onRefresh: () => void;
}) {
  const [ending, setEnding]   = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pct = event.iceCurrentPercentage ?? Math.round((event.iceCurrent / event.iceTotal) * 100);

  const handleEnd = async () => {
    setEnding(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-bb453c8e/ice/admin/end`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '종료 실패'); return; }
      toast.success('이벤트를 종료했습니다');
      setConfirm(false);
      onRefresh();
    } catch { toast.error('네트워크 오류'); }
    setEnding(false);
  };

  return (
    <div className="space-y-4">
      {/* 이벤트 정보 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-sm font-bold text-gray-800">{event.title}</h3>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">시작: {new Date(event.createdAt).toLocaleString('ko-KR')}</p>
          </div>
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="px-3 py-1.5 text-xs font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              강제 종료
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-medium">정말요?</span>
              <button onClick={handleEnd} disabled={ending}
                className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '확인'}
              </button>
              <button onClick={() => setConfirm(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">취소</button>
            </div>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* 프로그레스 바 */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-bold text-gray-700">현재 얼음 상태</span>
              <span className="font-bold text-cyan-600">{pct}% ({event.iceCurrent.toLocaleString()} / {event.iceTotal.toLocaleString()})</span>
            </div>
            <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${iceColor(pct)} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>깨짐 0%</span>
              <span>카드 1회당 -{event.iceDamagePerCard}</span>
              <span>완전 얼음 100%</span>
            </div>
          </div>

          {/* 현재 단계 이미지 + 상품 이미지 */}
          <div className="flex gap-4">
            {event.currentStageImage && (
              <div className="text-center">
                <img src={event.currentStageImage} alt="현재 얼음" className="w-24 h-24 object-cover rounded-xl border border-cyan-200 shadow-sm" />
                <p className="text-[10px] text-gray-400 mt-1">현재 단계</p>
              </div>
            )}
            {event.prizeGameImage && (
              <div className="text-center">
                <img src={event.prizeGameImage} alt="상품" className="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow-sm" />
                <p className="text-[10px] text-gray-400 mt-1">{event.prizeGameName || '상품'}</p>
              </div>
            )}
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '참여자', value: participants.length, icon: <Users className="w-4 h-4" /> },
              { label: '총 카드 사용', value: totalCards.toLocaleString(), icon: <span className="text-base">🃏</span> },
              { label: '남은 카드 횟수', value: event.iceDamagePerCard > 0 ? Math.ceil(event.iceCurrent / event.iceDamagePerCard).toLocaleString() : '-', icon: <Zap className="w-4 h-4" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="flex justify-center text-cyan-500 mb-1">{icon}</div>
                <p className="text-lg font-bold text-gray-800">{value}</p>
                <p className="text-[10px] text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 참여자 목록 */}
      <ParticipantsTable participants={participants} totalCards={totalCards} />
    </div>
  );
}

// RouletteWheel은 RouletteModal.tsx에서 import

// ══════════════════════════════════════════════════════════════════
// [3] 종료 후 추첨 대기
// ══════════════════════════════════════════════════════════════════
function DrawSection({ event, participants, totalCards, accessToken, onRefresh }: {
  event: any; participants: any[]; totalCards: number; accessToken: string; onRefresh: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [winner, setWinner] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const handleDraw = async () => {
    if (participants.length === 0) return;
    setPhase('spinning');
    setWinner(null);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/draw`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '추첨 실패'); setPhase('idle'); return; }
      setWinner({ nickname: d.winnerNickname, id: d.winnerId });
    } catch { toast.error('네트워크 오류'); setPhase('idle'); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/publish-roulette`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '공개 실패'); return; }
      toast.success('추첨 결과가 공개됐습니다! 모든 유저가 룰렛을 볼 수 있어요 🎉');
      setPublished(true);
      onRefresh();
    } catch { toast.error('네트워크 오류'); }
    setPublishing(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <h3 className="text-sm font-bold text-gray-800">{event.title} — 종료됨</h3>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">종료: {event.endedAt ? new Date(event.endedAt).toLocaleString('ko-KR') : '-'}</p>
        </div>
        <div className="px-5 py-5 space-y-5">

          {phase !== 'idle' && winner && (
            <RouletteWheel
              participants={participants}
              totalCards={totalCards}
              winnerNickname={winner.nickname}
              onDone={() => { setPhase('done'); onRefresh(); }}
            />
          )}

          {phase === 'spinning' && !winner && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <p className="text-sm text-cyan-600 font-bold">추첨 서버 연결 중...</p>
            </div>
          )}

          {phase === 'done' && winner && (
            <div className="space-y-3">
              <div className="text-center py-6 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200">
                <div className="text-4xl mb-2">🏆</div>
                <p className="text-xs text-gray-500 mb-1">당첨자</p>
                <p className="text-2xl font-black text-gray-900">{winner.nickname}</p>
                {event.prizeGameName && (
                  <p className="text-sm text-orange-600 font-semibold mt-1">상품: {event.prizeGameName}</p>
                )}
              </div>
              {published ? (
                <div className="flex items-center justify-center gap-2 py-3 bg-green-50 rounded-xl border border-green-200">
                  <Eye className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-bold text-green-700">모든 유저에게 공개됨</span>
                </div>
              ) : (
                <button onClick={handlePublish} disabled={publishing}
                  className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  추첨 결과 공개하기
                </button>
              )}
            </div>
          )}

          {phase === 'idle' && (
            <>
              <button onClick={handleDraw} disabled={participants.length === 0}
                className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-base font-black rounded-2xl hover:from-cyan-600 hover:to-blue-600 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                🎲 룰렛 추첨 실행
              </button>
              {participants.length === 0 && <p className="text-center text-xs text-gray-400">참여자가 없습니다</p>}
            </>
          )}
        </div>
      </div>
      <ParticipantsTable participants={participants} totalCards={totalCards} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// [3b] 추첨 완료
// ══════════════════════════════════════════════════════════════════
function DrawnSection({ event, participants, totalCards, accessToken, onRefresh }: {
  event: any; participants: any[]; totalCards: number; accessToken: string; onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [fixingNickname, setFixingNickname] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/clear-current`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '초기화 실패'); return; }
      toast.success('이벤트가 종료됐습니다. 새 이벤트를 시작할 수 있습니다.');
      onRefresh();
    } catch { toast.error('네트워크 오류'); }
    setClearing(false);
    setConfirm(false);
  };

  const handleFixNickname = async () => {
    setFixingNickname(true);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/fix-winner-nickname`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '재조회 실패'); return; }
      toast.success(`당첨자 닉네임이 "${d.winnerNickname}"으로 업데이트됐습니다`);
      onRefresh();
    } catch { toast.error('네트워크 오류'); }
    setFixingNickname(false);
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`${ICE_API}/ice/admin/publish-roulette`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '공개 실패'); return; }
      toast.success('추첨 결과가 공개됐습니다! 모든 유저가 룰렛을 볼 수 있어요 🎉');
      onRefresh();
    } catch { toast.error('네트워크 오류'); }
    setPublishing(false);
  };

  const rouletteParticipants = event.rouletteParticipants ?? participants;
  const rouletteTotalCards = event.rouletteTotalCards ?? totalCards;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-yellow-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-yellow-100 bg-gradient-to-r from-yellow-50 to-orange-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">🏆 추첨 완료 — {event.title}</h3>
          {!confirm ? (
            <button
              onClick={() => setConfirm(true)}
              className="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              이벤트 종료
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-medium">기록 보관 후 초기화할까요?</span>
              <button onClick={handleClear} disabled={clearing}
                className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '확인'}
              </button>
              <button onClick={() => setConfirm(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">취소</button>
            </div>
          )}
        </div>
        <div className="px-5 py-5 space-y-4">
          {/* 룰렛 재생 */}
          {showRoulette && rouletteParticipants.length > 0 ? (
            <div className="space-y-3">
              <RouletteWheel
                participants={rouletteParticipants}
                totalCards={rouletteTotalCards}
                winnerNickname={event.winnerNickname}
              />
              <button onClick={() => setShowRoulette(false)} className="w-full py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:bg-gray-50">
                닫기
              </button>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="text-4xl">🎉</div>
              <p className="text-xs text-gray-400">당첨자</p>
              <p className="text-3xl font-black text-gray-900">{event.winnerNickname}</p>
              <button onClick={handleFixNickname} disabled={fixingNickname}
                className="text-xs text-gray-400 underline hover:text-blue-500 disabled:opacity-50">
                {fixingNickname ? '재조회 중...' : '닉네임 잘못됐나요? 재조회'}
              </button>
              {event.prizeGameName && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-full">
                  <span className="text-sm font-bold text-orange-700">🎁 {event.prizeGameName}</span>
                </div>
              )}
              {rouletteParticipants.length > 0 && (
                <button onClick={() => setShowRoulette(true)} className="w-full py-2.5 border border-cyan-200 text-cyan-600 rounded-xl text-sm font-bold hover:bg-cyan-50 flex items-center justify-center gap-2">
                  🎲 룰렛 장면 다시 보기
                </button>
              )}
            </div>
          )}

          {/* 공개 상태 */}
          {event.roulettePublished ? (
            <div className="flex items-center justify-center gap-2 py-3 bg-green-50 rounded-xl border border-green-200">
              <Eye className="w-4 h-4 text-green-600" />
              <span className="text-sm font-bold text-green-700">모든 유저에게 공개됨</span>
            </div>
          ) : (
            <button onClick={handlePublish} disabled={publishing}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              추첨 결과 공개하기
            </button>
          )}
        </div>
      </div>
      <ParticipantsTable participants={participants} totalCards={totalCards} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// [4] 과거 이력
// ══════════════════════════════════════════════════════════════════
function HistorySection({ history, openId, onToggle }: {
  history: any[]; openId: string | null; onToggle: (id: string | null) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">📋 마감된 이벤트 목록</h3>
        <span className="text-xs text-gray-400">{history.length}건</span>
      </div>

      {history.length === 0 ? (
        <div className="px-5 py-10 text-center text-gray-400 text-sm">
          아직 마감된 이벤트가 없습니다
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {history.map(h => {
            const isOpen = openId === h.eventId;
            const parts: any[] = h.participants ?? [];
            const tc = h.totalCards ?? parts.reduce((s: number, p: any) => s + (p.cardCount ?? 0), 0);
            const startDate = h.createdAt ? new Date(h.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-';
            const endDate   = (h.drawnAt || h.endedAt) ? new Date(h.drawnAt || h.endedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-';

            return (
              <div key={h.eventId}>
                {/* 카드 헤더 */}
                <button
                  onClick={() => onToggle(isOpen ? null : h.eventId)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                          h.status === 'drawn' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {h.status === 'drawn' ? '추첨완료' : '종료'}
                        </span>
                        <p className="text-sm font-semibold text-gray-800 truncate">{h.title}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{startDate} → {endDate}</span>
                        <span>참여 {parts.length}명</span>
                        <span>카드 {tc.toLocaleString()}회</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {h.winnerNickname && (
                        <span className="text-xs font-bold text-yellow-600">🏆 {h.winnerNickname}</span>
                      )}
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-300" />
                        : <ChevronDown className="w-4 h-4 text-gray-300" />}
                    </div>
                  </div>

                  {/* 상품 정보 */}
                  {h.prizeGameName && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 rounded-lg">
                      <span className="text-xs">🎁</span>
                      <span className="text-xs font-medium text-orange-600">{h.prizeGameName}</span>
                    </div>
                  )}
                </button>

                {/* 펼쳤을 때 상세 */}
                {isOpen && (
                  <div className="px-5 pb-5 bg-gray-50 space-y-4">
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {[
                        { label: '참여자', value: parts.length + '명' },
                        { label: '총 카드', value: tc.toLocaleString() + '회' },
                        { label: '얼음 강도', value: (h.iceTotal ?? '-').toLocaleString() },
                        { label: '카드당 데미지', value: h.iceDamagePerCard ?? '-' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white rounded-xl p-2.5 text-center border border-gray-100">
                          <p className="text-sm font-bold text-gray-800">{value}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                    {parts.length > 0 && <ParticipantsTable participants={parts} totalCards={tc} compact />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 공통: 참여자 테이블
// ══════════════════════════════════════════════════════════════════
function ParticipantsTable({ participants, totalCards, compact = false }: {
  participants: any[]; totalCards: number; compact?: boolean;
}) {
  if (participants.length === 0) return null;
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${compact ? '' : ''}`}>
      <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">참여자 목록</h3>
        <span className="text-xs text-gray-400">{participants.length}명 · 총 {totalCards.toLocaleString()}회</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-semibold">순위</th>
              <th className="px-4 py-2 text-left font-semibold">닉네임</th>
              <th className="px-4 py-2 text-right font-semibold">카드 사용</th>
              <th className="px-4 py-2 text-right font-semibold">당첨 확률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {participants.map((p, i) => (
              <tr key={p.userId ?? i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{p.nickname}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="font-bold text-cyan-600">{(p.cardCount ?? 0).toLocaleString()}회</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, p.percentage ?? 0)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">{(p.percentage ?? 0).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
