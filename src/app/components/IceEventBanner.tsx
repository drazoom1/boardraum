import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { RouletteModal } from './RouletteModal';

const ICE_API = (path: string) =>
  `https://${projectId}.supabase.co/functions/v1/make-server-bb453c8e${path}`;

interface IceEvent {
  eventId: string;
  status: 'active' | 'ended' | 'drawn';
  iceTotal: number;
  iceCurrent: number;
  iceDamagePerCard?: number;
  iceCurrentPercentage: number;
  currentStageImage: string | null;
  iceImages?: Record<string, string>;
  myCardCount: number;
  prizeName?: string;
  winnerNickname?: string;
}

interface IceEventBannerProps {
  event: IceEvent | null;
  accessToken?: string;
  userId?: string | null;
  bonusCards?: number;
  onCardUsed?: (remainingCards: number) => void;
  onEventUpdate?: (event: IceEvent) => void; // 서버 응답으로 이벤트 직접 갱신
  onRefreshNeeded?: () => void;
  onResyncCards?: () => void; // 실패 시 카드 수 서버 재동기화
}

function calcPct(iceTotal: number, iceCurrent: number) {
  if (!iceTotal) return 0;
  return Math.max(0, Math.min(100, Math.round((iceCurrent / iceTotal) * 100)));
}

function getStageKey(pct: number): string {
  if (pct >= 95) return '100';
  if (pct >= 80) return '90';
  if (pct >= 60) return '70';
  if (pct >= 40) return '50';
  if (pct >= 20) return '30';
  if (pct > 0)   return '10';
  return '0';
}

export function IceEventBanner({ event: serverEvent, accessToken, userId, bonusCards = 0, onCardUsed, onEventUpdate, onRefreshNeeded, onResyncCards }: IceEventBannerProps) {
  const [localEvent, setLocalEvent] = useState<IceEvent | null>(null);
  const [showRoulette, setShowRoulette] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [useCount, setUseCount] = useState(1);
  const [using, setUsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shaking, setShaking] = useState(false);
  const inFlightRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = () => {
    setProgress(0);
    let cur = 0;
    progressIntervalRef.current = setInterval(() => {
      cur += (85 - cur) * 0.08; // 점점 느려지며 85%에 수렴
      setProgress(Math.min(cur, 85));
    }, 50);
  };

  const completeProgress = (onDone: () => void) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgress(100);
    setTimeout(() => { setProgress(0); onDone(); }, 250);
  };
  // 낙관적 목표 iceCurrent — 서버가 이 값 이하로 내려오면 localEvent 해제
  const targetIceRef = useRef<number | null>(null);

  // 서버값이 낙관적 목표에 도달하면 즉시 localEvent 해제
  useEffect(() => {
    if (localEvent === null) return;
    if (targetIceRef.current === null) return;
    if (serverEvent && serverEvent.iceCurrent <= targetIceRef.current) {
      targetIceRef.current = null;
      setLocalEvent(null);
    }
  }, [serverEvent?.iceCurrent, serverEvent?.status]);

  const event = localEvent ?? serverEvent;

  const handleUseCard = useCallback(async () => {
    if (!userId) { toast.error('로그인이 필요합니다'); return; }
    if (bonusCards < 1) { toast.error('보너스 카드가 없습니다'); setShowConfirm(false); return; }
    if (!serverEvent || serverEvent.status !== 'active') { setShowConfirm(false); return; }
    if (inFlightRef.current) return; // 중복 요청 차단

    const count = Math.min(useCount, bonusCards);
    setShowConfirm(false);
    inFlightRef.current = true;
    setUsing(true);
    startProgress();

    // 낙관적 업데이트 — 즉시 UI 반영
    const damagePerCard = serverEvent.iceDamagePerCard ?? 3;
    const totalDamage = damagePerCard * count;
    const optimisticIce = Math.max(0, serverEvent.iceCurrent - totalDamage);
    const optimisticPct = calcPct(serverEvent.iceTotal, optimisticIce);
    const optimisticStage = getStageKey(optimisticPct);
    targetIceRef.current = optimisticIce; // 서버가 이 값에 도달하면 localEvent 해제
    setLocalEvent({
      ...serverEvent,
      iceCurrent: optimisticIce,
      iceCurrentPercentage: optimisticPct,
      currentStageImage: serverEvent.iceImages?.[optimisticStage] ?? serverEvent.currentStageImage,
      myCardCount: (serverEvent.myCardCount ?? 0) + count,
      status: optimisticIce <= 0 ? 'ended' : 'active',
    });
    setShaking(true);
    setTimeout(() => setShaking(false), 700);

    try {
      const res = await fetch(ICE_API('/ice/use-card'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ count }),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        targetIceRef.current = null;
        setLocalEvent(null);
        const msg = data?.error || `카드 사용 실패 (${res.status})`;
        toast.error(msg, {
          description: '카드가 차감됐을 수 있습니다. 카드 수를 자동으로 다시 확인합니다.',
          duration: 5000,
        });
        onRefreshNeeded?.();
        onResyncCards?.();
      } else {
        if (data.cappedByIce) {
          toast.success(`얼음에 타격이 ${data.damage} 가해졌습니다! 🧊`, {
            description: `${data.requestedCount}장 중 ${data.useCount}장만 사용됐어요. 나머지 ${data.requestedCount - data.useCount}장은 보관됩니다.`,
            duration: 5000,
          });
        } else {
          toast.success(`얼음에 타격이 ${data.damage ?? totalDamage} 가해졌습니다! 🧊`);
        }
        // 서버 응답의 updatedEvent로 직접 갱신 — poll 왕복 없이 즉시 확정
        if (data.updatedEvent) {
          targetIceRef.current = null;
          onEventUpdate?.(data.updatedEvent);
          setLocalEvent(null);
        } else {
          onRefreshNeeded?.();
        }
        if (typeof data.remainingBonusCards === 'number') {
          onCardUsed?.(data.remainingBonusCards);
        } else {
          onCardUsed?.(bonusCards - count);
        }
      }
    } catch {
      targetIceRef.current = null;
      setLocalEvent(null);
      toast.error('네트워크 오류', {
        description: '인터넷 연결을 확인하고 다시 시도해주세요.',
        duration: 5000,
      });
      onRefreshNeeded?.();
      onResyncCards?.();
    } finally {
      inFlightRef.current = false;
      completeProgress(() => setUsing(false));
    }
  }, [userId, bonusCards, useCount, serverEvent, accessToken, onCardUsed, onEventUpdate, onRefreshNeeded]);

  if (!event) return null;

  const pct = event.iceCurrentPercentage ?? 0;
  const isActive = event.status === 'active';
  const isEnded = event.status === 'ended';
  const isDrawn = event.status === 'drawn';

  return (
    <>
      <div className="rounded-2xl mb-3 overflow-hidden shadow-sm bg-white" style={{ border: '2px solid #60a5fa' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2" style={{ background: 'linear-gradient(90deg,#bfdbfe,#dbeafe)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🧊</span>
            <span className="font-bold text-blue-800 text-sm">얼음깨기 이벤트</span>
            {isActive && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">진행중</span>}
            {isEnded && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full">추첨 대기 중</span>}
            {isDrawn && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">추첨 완료</span>}
          </div>
          {event.prizeName && (
            <span className="text-xs text-blue-700 font-medium">{event.prizeName}</span>
          )}
        </div>

        <div className="flex" style={{ minHeight: 140 }}>
          {/* 얼음 이미지 — 절반 차지 */}
          <div
            className={`flex-shrink-0 overflow-hidden ${shaking ? 'animate-shake' : ''}`}
            style={{ width: '50%' }}
          >
            {event.currentStageImage ? (
              <img
                src={event.currentStageImage}
                alt="얼음"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div className="w-full h-full bg-blue-100 flex items-center justify-center" style={{ fontSize: 64 }}>🧊</div>
            )}
          </div>

          {/* 정보 영역 */}
          <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-center">
            {isDrawn && event.winnerNickname ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-400">당첨자</div>
                <div className="font-bold text-blue-700 text-base leading-tight">{event.winnerNickname}</div>
                <div className="text-xs text-gray-400">축하합니다! 🎉</div>
                {(event as any).roulettePublished && (event as any).rouletteParticipants?.length > 0 && (
                  <button
                    onClick={() => setShowRoulette(true)}
                    className="w-full py-2 rounded-xl text-xs font-bold text-blue-600 border border-blue-200 hover:bg-blue-50"
                  >
                    🎲 추첨 장면 보기
                  </button>
                )}
              </div>
            ) : isEnded ? (
              <div>
                <div className="text-sm font-semibold text-amber-700">얼음이 다 깨졌어요!</div>
                <div className="text-xs text-gray-500 mt-1">관리자가 곧 추첨을 진행합니다</div>
              </div>
            ) : (
              <>
                <div className="text-xs text-gray-500 mb-1">
                  카드 사용 <span className="font-semibold text-blue-600">{event.myCardCount ?? 0}회</span>
                </div>
                <div className="text-xs text-gray-500 mb-4">
                  보유 카드 <span className="font-semibold text-blue-600">{bonusCards}장</span>
                </div>
                <button
                  onClick={() => {
                    if (!userId) { toast.error('로그인이 필요합니다'); return; }
                    if (bonusCards < 1) { toast.error('보너스 카드가 없습니다'); return; }
                    setUseCount(1);
                    setShowConfirm(true);
                  }}
                  disabled={using}
                  className="w-full rounded-xl text-white text-sm font-bold overflow-hidden relative"
                  style={{ height: 36, background: '#3b82f6' }}
                >
                  {using ? (
                    <>
                      <span className="relative z-10 text-xs">깨는 중...</span>
                      <span
                        className="absolute inset-y-0 left-0 transition-all duration-100"
                        style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.3)' }}
                      />
                    </>
                  ) : '얼음깨기'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-xs w-full mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🧊</div>
              <div className="font-bold text-lg text-gray-800">얼음깨기</div>
              <div className="text-sm text-gray-500 mt-1">
                카드 사용이 많을수록 당첨 확률이 높아집니다.
              </div>
            </div>
            {/* 수량 선택 */}
            <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 mb-4">
              <button
                onClick={() => setUseCount(c => Math.max(1, c - 1))}
                className="w-9 h-9 rounded-full bg-white border border-blue-200 text-blue-600 font-bold text-lg flex items-center justify-center"
              >−</button>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-700">{useCount}장</div>
                <div className="text-xs text-gray-400">보유 {bonusCards}장</div>
              </div>
              <button
                onClick={() => setUseCount(c => Math.min(bonusCards, c + 1))}
                className="w-9 h-9 rounded-full bg-white border border-blue-200 text-blue-600 font-bold text-lg flex items-center justify-center"
              >+</button>
            </div>
            {bonusCards > 1 && (
              <button
                onClick={() => setUseCount(bonusCards)}
                className="w-full py-1.5 mb-3 rounded-xl border border-blue-200 text-blue-600 text-xs font-medium"
              >
                전체 사용 ({bonusCards}장)
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm"
              >
                취소
              </button>
              <button
                onClick={handleUseCard}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white font-bold text-sm"
              >
                {useCount}장 사용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoulette && (event as any).roulettePublished && (
        <RouletteModal
          participants={(event as any).rouletteParticipants ?? []}
          totalCards={(event as any).rouletteTotalCards ?? 0}
          winnerNickname={event.winnerNickname ?? ''}
          prizeName={event.prizeName}
          onClose={() => setShowRoulette(false)}
        />
      )}

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0) rotate(0)}
          20%{transform:translateX(-6px) rotate(-3deg)}
          40%{transform:translateX(6px) rotate(3deg)}
          60%{transform:translateX(-4px) rotate(-2deg)}
          80%{transform:translateX(4px) rotate(2deg)}
        }
        .animate-shake { animation: shake 0.6s ease-in-out; }
      `}</style>
    </>
  );
}
