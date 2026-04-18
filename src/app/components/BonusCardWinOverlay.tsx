import { useEffect, useState } from 'react';

interface BonusCardWinOverlayProps {
  onClose: () => void;
}

export function BonusCardWinOverlay({ onClose }: BonusCardWinOverlayProps) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 2600);
    const t3 = setTimeout(() => onClose(), 3100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onClose]);

  const sparkles = [
    { top: '20%', left: '15%', delay: '0.1s', size: 18 },
    { top: '15%', left: '75%', delay: '0.2s', size: 14 },
    { top: '60%', left: '10%', delay: '0.3s', size: 10 },
    { top: '55%', left: '82%', delay: '0.15s', size: 16 },
    { top: '35%', left: '5%',  delay: '0.25s', size: 12 },
    { top: '30%', left: '88%', delay: '0.35s', size: 10 },
    { top: '75%', left: '20%', delay: '0.4s',  size: 14 },
    { top: '70%', left: '72%', delay: '0.2s',  size: 12 },
    { top: '10%', left: '45%', delay: '0.3s',  size: 16 },
    { top: '80%', left: '50%', delay: '0.1s',  size: 10 },
  ];

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{
        background: phase === 'exit'
          ? 'rgba(0,0,0,0)'
          : phase === 'show'
          ? 'rgba(0,0,0,0.72)'
          : 'rgba(0,0,0,0)',
        transition: 'background 0.4s ease',
        pointerEvents: 'none',
      }}
      onClick={onClose}
    >
      {/* 파티클 반짝이 */}
      {sparkles.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: phase === 'show' ? 1 : 0,
            transform: phase === 'show' ? 'scale(1) rotate(0deg)' : 'scale(0) rotate(45deg)',
            transition: `opacity 0.4s ease ${s.delay}, transform 0.5s ease ${s.delay}`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <path
              d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
              fill={i % 3 === 0 ? '#00BCD4' : i % 3 === 1 ? '#FFD700' : '#ffffff'}
            />
          </svg>
        </div>
      ))}

      {/* 카드 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          opacity: phase === 'exit' ? 0 : phase === 'show' ? 1 : 0,
          transform: phase === 'exit'
            ? 'translateY(-30px) scale(0.85)'
            : phase === 'show'
            ? 'translateY(0px) scale(1)'
            : 'translateY(60px) scale(0.7)',
          transition: phase === 'exit'
            ? 'opacity 0.5s ease, transform 0.5s ease'
            : 'opacity 0.5s cubic-bezier(0.34,1.56,0.64,1), transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* 빛 발산 링 */}
        <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* 글로우 원 */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,188,212,0.35) 0%, rgba(0,188,212,0) 70%)',
            animation: phase === 'show' ? 'cardGlowPulse 1.2s ease-in-out infinite alternate' : 'none',
          }} />

          {/* 카드 본체 */}
          <div style={{
            width: 100,
            height: 140,
            borderRadius: 16,
            background: 'linear-gradient(145deg, #00BCD4, #006064)',
            boxShadow: '0 0 40px rgba(0,188,212,0.7), 0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: '2px solid rgba(255,255,255,0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* 카드 빛 줄기 */}
            <div style={{
              position: 'absolute',
              top: '-20%',
              left: '-20%',
              width: '60%',
              height: '140%',
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
              animation: phase === 'show' ? 'cardShine 1.8s ease-in-out infinite' : 'none',
            }} />
            <div style={{ fontSize: 38, lineHeight: 1 }}>🃏</div>
            <div style={{ color: 'white', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', opacity: 0.9 }}>BONUS CARD</div>
          </div>
        </div>

        {/* 텍스트 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            color: '#ffffff',
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: '-0.01em',
            textShadow: '0 0 20px rgba(0,188,212,0.8)',
            lineHeight: 1.2,
          }}>
            보너스카드 획득! 🎉
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 13,
            marginTop: 6,
            fontWeight: 500,
          }}>
            카드 1장이 지급되었어요
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cardGlowPulse {
          from { opacity: 0.6; transform: scale(0.95); }
          to   { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes cardShine {
          0%   { left: -60%; }
          50%  { left: 120%; }
          100% { left: 120%; }
        }
      `}</style>
    </div>
  );
}
