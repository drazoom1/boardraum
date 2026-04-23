import { useEffect, useRef, useState } from 'react';

interface Props {
  onClose: () => void;
}

const CONFETTI = [
  { color: '#FFD700', x: '10%', delay: '0s',   size: 10, spin: 1 },
  { color: '#FF6B6B', x: '25%', delay: '0.1s', size: 8,  spin: -1 },
  { color: '#4ECDC4', x: '40%', delay: '0.05s',size: 12, spin: 1 },
  { color: '#45B7D1', x: '55%', delay: '0.15s',size: 9,  spin: -1 },
  { color: '#96CEB4', x: '70%', delay: '0.08s',size: 11, spin: 1 },
  { color: '#FFEAA7', x: '85%', delay: '0.2s', size: 8,  spin: -1 },
  { color: '#DDA0DD', x: '15%', delay: '0.25s',size: 10, spin: 1 },
  { color: '#98FB98', x: '32%', delay: '0.12s',size: 7,  spin: -1 },
  { color: '#FFB347', x: '48%', delay: '0.18s',size: 13, spin: 1 },
  { color: '#87CEEB', x: '63%', delay: '0.07s',size: 9,  spin: -1 },
  { color: '#FF69B4', x: '78%', delay: '0.22s',size: 11, spin: 1 },
  { color: '#00CED1', x: '92%', delay: '0.14s',size: 8,  spin: -1 },
];

const SPARKLES = [
  { top: '18%', left: '12%', delay: '0.1s', size: 20 },
  { top: '12%', left: '70%', delay: '0.2s', size: 16 },
  { top: '65%', left: '8%',  delay: '0.3s', size: 14 },
  { top: '58%', left: '85%', delay: '0.15s',size: 18 },
  { top: '38%', left: '4%',  delay: '0.25s',size: 12 },
  { top: '28%', left: '90%', delay: '0.35s',size: 14 },
  { top: '78%', left: '22%', delay: '0.4s', size: 16 },
  { top: '72%', left: '75%', delay: '0.18s',size: 12 },
];

export function FirstPostCelebration({ onClose }: Props) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 3200);
    const t3 = setTimeout(() => onCloseRef.current(), 3700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const visible = phase === 'show';

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{
        background: phase === 'exit' ? 'rgba(0,0,0,0)' : visible ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0)',
        transition: 'background 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      {/* 떨어지는 색종이 */}
      {CONFETTI.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: c.x,
            top: visible ? '110%' : '-5%',
            width: c.size,
            height: c.size * 1.4,
            background: c.color,
            borderRadius: 2,
            opacity: visible ? 0.9 : 0,
            transform: visible ? `rotate(${c.spin * 360}deg)` : 'rotate(0deg)',
            transition: `top 1.8s ease-in ${c.delay}, opacity 0.3s ease ${c.delay}, transform 1.8s ease ${c.delay}`,
          }}
        />
      ))}

      {/* 반짝이 별 */}
      {SPARKLES.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1) rotate(0deg)' : 'scale(0) rotate(45deg)',
            transition: `opacity 0.4s ease ${s.delay}, transform 0.5s ease ${s.delay}`,
          }}
        >
          ✨
        </div>
      ))}

      {/* 중앙 메시지 카드 */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.7) translateY(20px)',
          transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
          background: 'white',
          borderRadius: 24,
          padding: '28px 32px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          maxWidth: 300,
        }}
      >
        <div style={{ fontSize: 48, lineHeight: 1.2 }}>🎉</div>
        <p style={{ fontSize: 18, fontWeight: 900, color: '#1a1a1a', marginTop: 10 }}>첫 게시물 완료!</p>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
          축하 포인트 <strong style={{ color: '#f59e0b' }}>+300pt</strong>와<br />
          조커카드 <strong style={{ color: '#00BCD4' }}>🃏×3</strong>을 드렸어요!
        </p>
      </div>
    </div>
  );
}
