import { useEffect, useRef, useState } from 'react';

const WHEEL_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1',
];

export function RouletteWheel({ participants, totalCards, winnerNickname, winnerId, onDone }: {
  participants: any[]; totalCards: number; winnerNickname: string; winnerId?: string; onDone?: (actualWinner: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || participants.length === 0) return;

    const TWO_PI = Math.PI * 2;
    const total = totalCards || participants.reduce((s: number, p: any) => s + p.cardCount, 0);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r  = cx - 8;

    // 화살표(포인터)는 휠 상단(북쪽, -π/2)에 고정
    // winner 칸의 중간 각도를 -π/2에 맞추려면: finalRotation = -winnerMid - π/2 + extraSpins
    let accAngle = -Math.PI / 2;
    let winnerMid = accAngle;
    for (const p of participants) {
      const slice = (p.cardCount / total) * TWO_PI;
      const isWinner = winnerId ? p.userId === winnerId : p.nickname === winnerNickname;
      if (isWinner) {
        winnerMid = accAngle + slice / 2;
        break;
      }
      accAngle += slice;
    }
    const extraSpins = TWO_PI * 8;
    // 수정된 공식: winner 칸 중심이 포인터(북쪽 = -π/2)에 정확히 멈춤
    const finalRotation = -winnerMid - Math.PI / 2 + extraSpins;

    const draw = (rot: number) => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();

      let angle = rot - Math.PI / 2;
      participants.forEach((p, i) => {
        const slice = (p.cardCount / total) * TWO_PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + slice);
        ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.stroke();
        angle += slice;
      });

      // 중앙 원
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, TWO_PI);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 포인터 삼각형 — 상단, 꼭지점이 아래(휠 안쪽)를 향함
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - r - 2);
      ctx.lineTo(cx + 10, cy - r - 2);
      ctx.lineTo(cx, cy - r + 20);
      ctx.closePath();
      ctx.fillStyle = '#1e293b';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 4;
      ctx.fill();
    };

    const duration  = 5000;
    const startTime = performance.now();

    const animate = (now: number) => {
      const t     = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      draw(finalRotation * eased);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        draw(finalRotation);

        // 화살표(북쪽 = -π/2)가 실제로 가리키는 칸을 기하학적으로 계산
        // 포인터의 첫 번째 칸 시작점으로부터의 상대 각도
        const pointerPos = ((-finalRotation) % TWO_PI + TWO_PI) % TWO_PI;
        let cum = 0;
        let pointed = participants[0];
        for (const p of participants) {
          cum += (p.cardCount / total) * TWO_PI;
          if (pointerPos < cum) { pointed = p; break; }
        }

        setTimeout(() => onDone?.(pointed.nickname), 600);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [winnerNickname, winnerId]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} width={280} height={280} style={{ borderRadius: '50%' }} />
      {/* 색상 범례 */}
      <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1 px-1">
        {participants.map((p, i) => (
          <div key={p.userId || i} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] }} />
            <span className="text-xs text-gray-700 truncate">{p.nickname}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RouletteModal({ participants, totalCards, winnerNickname, winnerId, prizeName, onClose }: {
  participants: any[];
  totalCards: number;
  winnerNickname: string;
  winnerId?: string;
  prizeName?: string;
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  const [actualWinner, setActualWinner] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={done ? onClose : undefined}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 text-center" style={{ background: 'linear-gradient(135deg,#bfdbfe,#dbeafe)' }}>
          <div className="text-2xl mb-1">🎲</div>
          <p className="font-black text-blue-900 text-base">얼음깨기 추첨</p>
          {prizeName && <p className="text-xs text-blue-600 mt-0.5">🎁 {prizeName}</p>}
        </div>

        <div className="px-5 py-5 space-y-4">
          <RouletteWheel
            participants={participants}
            totalCards={totalCards}
            winnerNickname={winnerNickname}
            winnerId={winnerId}
            onDone={(name) => { setActualWinner(name); setDone(true); }}
          />

          {done ? (
            <div className="text-center py-4 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl border border-yellow-200">
              <div className="text-3xl mb-1">🏆</div>
              <p className="text-xs text-gray-400 mb-1">당첨자</p>
              <p className="text-2xl font-black text-gray-900">{actualWinner}</p>
              <p className="text-xs text-gray-400 mt-2">화면을 탭하면 닫힙니다</p>
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-blue-500 font-bold animate-pulse">룰렛 돌아가는 중...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
