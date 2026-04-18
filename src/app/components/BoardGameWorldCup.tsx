import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, RefreshCw, ChevronRight, Copy, Check } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { BoardGame } from '../App';

// 32강 고정 토너먼트: 32→16→8→4→2→우승
// 항상 2의 거듭제곱 수로 유지 → 홀수 문제 없음

function getRoundLabel(count: number) {
  if (count === 32) return '32강';
  if (count === 16) return '16강';
  if (count === 8) return '8강';
  if (count === 4) return '4강';
  if (count === 2) return '결승';
  return `${count}강`;
}

interface WCGame extends BoardGame {
  resolvedImage: string;
}

type Phase = 'intro' | 'playing' | 'result' | 'shared';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


interface Props {
  accessToken?: string | null;
  userEmail?: string | null;
  wishlistGames?: BoardGame[];
  onAddToWishlist?: (game: BoardGame) => void;
}

export function BoardGameWorldCup({ accessToken, userEmail, wishlistGames = [], onAddToWishlist }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [allGames, setAllGames] = useState<WCGame[]>([]);
  const [loading, setLoading] = useState(false);

  // 토너먼트 상태: pool = 현재 라운드 전체 참가자 (항상 짝수)
  const [pool, setPool] = useState<WCGame[]>([]);       // 현재 라운드 참가자 전체
  const [matchIdx, setMatchIdx] = useState(0);           // 현재 몇 번째 경기
  const [roundWinners, setRoundWinners] = useState<WCGame[]>([]);  // 이번 라운드 승자 누적
  const [top8, setTop8] = useState<WCGame[]>([]);
  const [winner, setWinner] = useState<WCGame | null>(null);
  const [selected, setSelected] = useState<'left' | 'right' | null>(null);
  const [copied, setCopied] = useState(false);

  const totalMatches = pool.length / 2;  // 항상 짝수이므로 나머지 없음
  const leftGame = pool[matchIdx * 2];
  const rightGame = pool[matchIdx * 2 + 1];
  const currentRound = getRoundLabel(pool.length);

  // 이미지 lazy fetch
  const bggImageCache = useRef<Record<string, string>>({});
  const [imageMap, setImageMap] = useState<Record<string, string>>({});

  const fetchBggImageLazy = async (bggId: string, gameId: string) => {
    if (bggImageCache.current[bggId] !== undefined) return;
    bggImageCache.current[bggId] = '';
    try {
      const token = accessToken || publicAnonKey;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ id: bggId }) }
      );
      if (res.ok) {
        const d = await res.json();
        const url = d.imageUrl || '';
        bggImageCache.current[bggId] = url;
        if (url) setImageMap(prev => ({ ...prev, [gameId]: url }));
      }
    } catch {}
  };

  const getImage = (game: WCGame) => imageMap[game.id] || game.resolvedImage || '';

  useEffect(() => {
    if (phase !== 'playing') return;
    [leftGame, rightGame].forEach(g => {
      if (g && !g.resolvedImage && g.bggId) fetchBggImageLazy(g.bggId, g.id);
    });
  }, [matchIdx, pool, phase]);

  const loadGames = async () => {
    setLoading(true);
    try {
      const token = accessToken || publicAnonKey;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/all-games`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const raw: BoardGame[] = d.games || [];

      // 중복 제거
      const seen = new Set<string>();
      const deduped: WCGame[] = [];
      for (const g of raw) {
        const key = g.bggId ? `bgg_${g.bggId}` : `id_${g.id}`;
        if (!seen.has(key) && (g.koreanName || g.englishName)) {
          seen.add(key);
          deduped.push({ ...g, resolvedImage: g.imageUrl?.trim() || '' } as WCGame);
        }
      }
      setAllGames(deduped);
    } catch (e) {
      console.error('loadGames error:', e);
      setAllGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGames(); }, []);

  // 공유 링크로 접속 시 결과 복원
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wc = params.get('wc');
    if (!wc) return;
    
    // 짧은 ID인 경우 (6자리)
    if (wc.length === 6) {
      loadSharedResult(wc);
    } else {
      // 레거시 base64 형식
      try {
        const binary = atob(wc);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (!data?.w) return;
        const makeGame = (item: any, idx: number): WCGame => ({
          id: `shared_${idx}`,
          koreanName: item.name || item,
          englishName: '',
          imageUrl: item.img || '',
          resolvedImage: item.img || '',
          bggId: '',
        } as WCGame);
        setWinner(makeGame(data.w, 0));
        setTop8((data.t || []).map((item: any, i: number) => makeGame(item, i)));
        setPhase('shared');
      } catch {}
    }
  }, []);

  const loadSharedResult = async (shareId: string) => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/wc/load/${shareId}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      
      const makeGame = (item: any, idx: number): WCGame => ({
        id: `shared_${idx}`,
        koreanName: item.name || '',
        englishName: '',
        imageUrl: item.img || '',
        resolvedImage: item.img || '',
        bggId: '',
      } as WCGame);
      
      setWinner(makeGame(data.winner, 0));
      setTop8((data.top8 || []).map((item: any, i: number) => makeGame(item, i)));
      setPhase('shared');
    } catch (e) {
      console.error('Failed to load shared result:', e);
    }
  };

  const startGame = () => {
    // 32강으로 고정 (2^5 = 32, 항상 짝수 유지)
    const picked = shuffle(allGames).slice(0, 32);
    setPool(picked);
    setRoundWinners([]);
    setMatchIdx(0);
    setTop8([]);
    setWinner(null);
    setSelected(null);
    setImageMap({});
    setPhase('playing');
  };

  const pick = useCallback((side: 'left' | 'right') => {
    if (selected || !leftGame || !rightGame) return;
    setSelected(side);

    setTimeout(() => {
      const win = side === 'left' ? leftGame : rightGame;
      const lose = side === 'left' ? rightGame : leftGame;
      const winWithImg = { ...win, resolvedImage: imageMap[win.id] || win.resolvedImage };
      const loseWithImg = { ...lose, resolvedImage: imageMap[lose.id] || lose.resolvedImage };

      const newRoundWinners = [...roundWinners, winWithImg];
      const nextMatchIdx = matchIdx + 1;

      // TOP8 추적 (8강 이하부터)
      const newTop8 = [...top8];
      if (pool.length <= 8 && !newTop8.find(g => g.id === winWithImg.id)) newTop8.unshift(winWithImg);
      if (pool.length <= 16 && !newTop8.find(g => g.id === loseWithImg.id)) newTop8.push(loseWithImg);

      if (nextMatchIdx >= totalMatches) {
        // 이번 라운드 끝
        if (newRoundWinners.length === 1) {
          // 최종 우승
          const finalTop8 = [newRoundWinners[0], ...newTop8.filter(g => g.id !== newRoundWinners[0].id)].slice(0, 8);
          setWinner(newRoundWinners[0]);
          setTop8(finalTop8);
          setPhase('result');
        } else {
          // 다음 라운드: 승자들로 새 pool (항상 짝수 — 2의 거듭제곱이므로 보장)
          setPool(shuffle(newRoundWinners));
          setRoundWinners([]);
          setMatchIdx(0);
          setTop8(newTop8);
        }
      } else {
        setRoundWinners(newRoundWinners);
        setMatchIdx(nextMatchIdx);
        setTop8(newTop8);
      }
      setSelected(null);
    }, 600);
  }, [leftGame, rightGame, roundWinners, matchIdx, totalMatches, pool.length, top8, selected, imageMap]);

  const downloadResult = async () => {
    const el = document.getElementById('wc-result-card');
    if (!el) return;
    try {
      // @ts-ignore
      const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js');
      const canvas = await html2canvas(el, { backgroundColor: '#0f0f1a', scale: 2, useCORS: true, allowTaint: false });
      const link = document.createElement('a');
      link.download = '보드게임월드컵_결과.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch {
      alert('이미지 저장에 실패했습니다. 스크린샷을 이용해주세요.');
    }
  };

  const shareLink = 'https://boardraum.com?tab=taste';
  const copyLink = () => {
    // 폴백 메서드 사용 (Clipboard API 대신)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = shareLink;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // ── INTRO ──
  if (phase === 'intro') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 text-xs font-bold tracking-widest uppercase mb-4">
              취향 분석
            </div>
            <h1 className="text-4xl font-black text-gray-900 leading-tight">
              보드게임<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">월드컵</span>
            </h1>
            <p className="text-gray-500 mt-3 text-sm leading-relaxed">
              보드라움에 등록된 게임 중 32개를 골라<br />나만의 최애 보드게임을 찾아보세요!
            </p>
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
            {['32강', '16강', '8강', '4강', '결승'].map((r, i) => (
              <div key={r} className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">{r}</span>
                {i < 4 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-center border border-gray-100">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">불러오는 중...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-gray-900">{allGames.length}개</div>
                <div className="text-xs text-gray-400 mt-1">보드라움 전체 등록 게임 · 32개 무작위 선발</div>
                {allGames.length < 32 && (
                  <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                    ⚠️ 32개 이상의 게임이 필요합니다 (현재 {allGames.length}개)
                  </div>
                )}
              </>
            )}
          </div>

          <button
            onClick={startGame}
            disabled={loading || allGames.length < 32}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-lg font-black rounded-2xl shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            🏆 월드컵 시작하기
          </button>
        </div>
      </div>
    );
  }

  // ── PLAYING ──
  if (phase === 'playing' && leftGame && rightGame) {
    const progress = (matchIdx / totalMatches) * 100;
    return (
      <div className="min-h-[70vh] flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-lg mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xl font-black text-gray-900">{currentRound}</span>
            <span className="text-sm text-gray-400 font-medium">{matchIdx + 1} / {totalMatches}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="text-xs font-black text-gray-300 tracking-widest mb-4 uppercase">어느 쪽이 더 좋아요?</div>

        <div className="w-full max-w-lg flex gap-3 items-stretch">
          {([['left', leftGame], ['right', rightGame]] as const).map(([side, game]) => {
            const img = getImage(game);
            return (
              <button key={side} onClick={() => pick(side)} disabled={!!selected}
                className={`flex-1 flex flex-col rounded-2xl overflow-hidden border-2 transition-all duration-300 active:scale-95
                  ${selected === side ? 'border-cyan-500 shadow-xl shadow-cyan-500/30 scale-[1.02]'
                    : selected ? 'border-gray-100 opacity-40 scale-[0.98]'
                    : 'border-gray-200 hover:border-cyan-400 hover:shadow-lg hover:scale-[1.01]'}`}>
                <div className="relative w-full aspect-square bg-gray-100">
                  {img
                    ? <img src={img} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl bg-gray-50">🎲</div>}
                  {selected === side && (
                    <div className="absolute inset-0 bg-cyan-500/20 flex items-center justify-center">
                      <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg">
                        <Check className="w-7 h-7 text-white" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 bg-white flex-1 flex flex-col justify-center">
                  <p className="font-bold text-gray-900 text-sm text-center leading-tight line-clamp-2">
                    {game.koreanName || game.englishName}
                  </p>
                  {game.koreanName && game.englishName && (
                    <p className="text-xs text-gray-400 text-center mt-0.5 truncate">{game.englishName}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-black">VS</span>
        </div>
      </div>
    );
  }

  // ── RESULT ──
  if (phase === 'result' && winner) {
    const shareMyResult = async () => {
      try {
        // 서버에 결과 저장
        const token = accessToken || publicAnonKey;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/wc/save`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              winner: {
                name: winner.koreanName || winner.englishName,
                img: imageMap[winner.id] || winner.resolvedImage || winner.imageUrl || '',
              },
              top8: top8.slice(0, 8).map(g => ({
                name: g.koreanName || g.englishName,
                img: imageMap[g.id] || g.resolvedImage || g.imageUrl || '',
              })),
            }),
          }
        );

        if (!res.ok) throw new Error('Failed to save');
        
        const data = await res.json();
        const link = `${window.location.origin}?tab=taste&wc=${data.shareId}`;
        
        // 폴백 메서드 사용 (Clipboard API 대신)
        try {
          const textArea = document.createElement('textarea');
          textArea.value = link;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          
          if (successful) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        } catch (copyErr) {
          console.error('Copy failed:', copyErr);
          alert('링크 복사에 실패했습니다. 링크를 수동으로 복사해주세요:\n' + link);
        }
      } catch (error) {
        console.error('Failed to share:', error);
        alert('공유 링크 생성에 실패했습니다.');
      }
    };

    return (
      <div className="flex flex-col items-center px-4 py-6 gap-6">
        {/* ── 공유 버튼 ── */}
        <button
          onClick={shareMyResult}
          className="w-full max-w-sm flex items-center justify-center gap-2 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? '링크 복사됨!' : '보드게임 월드컵 링크 공유'}
        </button>

        {/* ── TOP8 리스트 (구매 예정 추가 버튼 포함) ── */}
        {top8.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">나의 보드게임 TOP {Math.min(top8.length, 8)}</h3>
            <div className="space-y-2">
              {top8.slice(0, 8).map((g, i) => {
                const alreadyInWishlist = wishlistGames.some(w => w.id === g.id || (g.bggId && w.bggId === g.bggId));
                return (
                  <div key={g.id} className="flex items-center gap-3 bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    {(imageMap[g.id] || g.resolvedImage) && <img src={imageMap[g.id] || g.resolvedImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.koreanName || g.englishName}</p>
                      {g.koreanName && g.englishName && <p className="text-xs text-gray-400 truncate">{g.englishName}</p>}
                    </div>
                    {onAddToWishlist && (
                      alreadyInWishlist
                        ? <span className="shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">추가됨</span>
                        : <button
                            onClick={() => onAddToWishlist({ ...g, imageUrl: imageMap[g.id] || g.resolvedImage || g.imageUrl })}
                            className="shrink-0 text-xs font-bold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          >
                            + 구매 예정
                          </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SHARED (공유 링크로 방문 시) ──
  if (phase === 'shared' && winner) {
    return (
      <div className="flex flex-col items-center px-4 py-6 gap-6">
        <div className="text-center">
          <div className="text-3xl font-black text-gray-900 mb-1">🏆 보드게임 월드컵 결과</div>
          <p className="text-gray-500 text-sm">친구의 취향을 확인해보세요!</p>
        </div>

        {/* ── TOP8 리스트 ── */}
        {top8.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">보드게임 TOP {Math.min(top8.length, 8)}</h3>
            <div className="space-y-2">
              {top8.slice(0, 8).map((g, i) => (
                <div key={g.id} className="flex items-center gap-3 bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  {g.resolvedImage && <img src={g.resolvedImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.koreanName || g.englishName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 홍보 배너 ── */}
        <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
          <div className="bg-gray-900 px-5 py-4 text-white">
            <div className="text-xs font-bold text-cyan-400 tracking-widest mb-1">BOARDRAUM</div>
            <p className="text-base font-black leading-tight mb-1">나도 보드게임 월드컵<br />참여해볼까? 🏆</p>
            <p className="text-xs text-gray-400">보드라움에 가입하고 나만의 취향을 찾아보세요</p>
          </div>
          <div className="bg-white px-5 py-3">
            <a href={window.location.origin} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-black rounded-xl transition-colors">
              🏆 보드라움 가입하고 월드컵 하기
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}