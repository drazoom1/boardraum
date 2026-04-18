import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Search } from 'lucide-react';
import { BoardGame, PlayRecord } from '../App';
import { WingspanCalculator } from './WingspanCalculator';
import { CustomCalculatorBuilder, CustomCalculator } from './CustomCalculatorBuilder';
import { CustomCalculatorPlayer } from './CustomCalculatorPlayer';
import { projectId } from '/utils/supabase/info';

// 공식 계산기 목록 - 정확한 이름만 매칭, 확장판 제외
const OFFICIAL_CALCS: { names: string[]; type: string; label: string }[] = [
  { names: ['윙스팬', 'Wingspan'], type: 'wingspan', label: '윙스팬' },
];

function getOfficialType(game: BoardGame): string | null {
  if (game.isExpansion) return null;
  const name = (game.koreanName || game.englishName || '').trim();
  for (const entry of OFFICIAL_CALCS) {
    if (entry.names.some(n => name === n)) return entry.type;
  }
  return null;
}

interface Props {
  ownedGames: BoardGame[];
  accessToken?: string;
  onSavePlayRecord: (gameId: string, record: PlayRecord) => void;
  onClose: () => void;
}

type View = 'list' | 'build' | 'play-official' | 'play-custom';

export function CalculatorHub({ ownedGames, accessToken, onSavePlayRecord, onClose }: Props) {
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [customCalcs, setCustomCalcs] = useState<CustomCalculator[]>([]);
  const [publicCalcs, setPublicCalcs] = useState<CustomCalculator[]>([]);
  const [selectedOfficialGame, setSelectedOfficialGame] = useState<BoardGame | null>(null);
  const [selectedCustomCalc, setSelectedCustomCalc] = useState<CustomCalculator | null>(null);
  const [editingCalc, setEditingCalc] = useState<CustomCalculator | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCustomCalcs(); }, [accessToken]);

  const loadCustomCalcs = async () => {
    if (!accessToken) { setLoading(false); return; }
    try {
      const [myRes, pubRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/calculators`,
          { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/calculators/public`,
          { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (myRes.ok) { const d = await myRes.json(); setCustomCalcs(d.calculators || []); }
      if (pubRes.ok) { const d = await pubRes.json(); setPublicCalcs(d.calculators || []); }
    } catch {}
    setLoading(false);
  };

  const saveCustomCalc = async (calc: CustomCalculator) => {
    if (!accessToken) return;
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/calculators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ calculator: calc }),
        }
      );
      setCustomCalcs(prev => {
        const exists = prev.find(c => c.id === calc.id);
        return exists ? prev.map(c => c.id === calc.id ? calc : c) : [...prev, calc];
      });
    } catch {}
    setView('list');
    setEditingCalc(undefined);
  };

  const deleteCustomCalc = async (calcId: string) => {
    if (!accessToken || !confirm('이 계산기를 삭제할까요?')) return;
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/calculators/${calcId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setCustomCalcs(prev => prev.filter(c => c.id !== calcId));
    } catch {}
  };

  // 공식 계산기 — 보유 게임 중 지원 게임
  const officialGames = ownedGames.filter(g => getOfficialType(g) !== null);

  // 커스텀 계산기 — 보유 게임과 연결된 것만
  const ownedGameIds = new Set(ownedGames.map(g => g.id));
  const ownedGameNames = new Set(ownedGames.flatMap(g => [
    (g.koreanName || '').trim().toLowerCase(),
    (g.englishName || '').trim().toLowerCase(),
  ].filter(Boolean)));
  // 승인된 공개 계산기 — 보유 여부 관계없이 전체 표시
  const approvedCustomCalcs = publicCalcs;
  // 내 커스텀 계산기 (승인 여부 무관)
  const myCustomCalcs = customCalcs.filter(c => ownedGameIds.has(c.gameId));

  // 검색 필터
  const q = search.trim().toLowerCase();
  const filteredOfficial = officialGames.filter(g =>
    !q || (g.koreanName||'').toLowerCase().includes(q) || (g.englishName||'').toLowerCase().includes(q)
  );
  const filteredApproved = approvedCustomCalcs.filter(c =>
    !q || c.gameName.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  );
  const filteredCustom = myCustomCalcs.filter(c =>
    !q || c.gameName.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  );

  // 공식 계산기 플레이
  if (view === 'play-official' && selectedOfficialGame) {
    const type = getOfficialType(selectedOfficialGame);
    if (type === 'wingspan') {
      return (
        <WingspanCalculator
          game={selectedOfficialGame}
          onSavePlayRecord={r => onSavePlayRecord(selectedOfficialGame.id, r)}
          onClose={onClose}
        />
      );
    }
  }

  // 커스텀 계산기 플레이
  if (view === 'play-custom' && selectedCustomCalc) {
    return (
      <CustomCalculatorPlayer
        calc={selectedCustomCalc}
        onSavePlayRecord={r => onSavePlayRecord(selectedCustomCalc.gameId, r)}
        onClose={onClose}
      />
    );
  }

  // 계산기 빌더
  if (view === 'build') {
    return (
      <CustomCalculatorBuilder
        ownedGames={ownedGames}
        onSave={saveCustomCalc}
        onClose={() => { setView('list'); setEditingCalc(undefined); }}
        editCalc={editingCalc}
      />
    );
  }

  // 메인 목록
  return (
    <div className="fixed inset-0 bg-black/60 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white w-full sm:w-[min(100vw-2rem,460px)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-500">
              <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>
              <line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/>
              <line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/>
            </svg>
            <h2 className="text-lg font-bold text-gray-900">점수 계산기</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
        </div>

        {/* 검색 */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="내 게임 중 계산기 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-cyan-400" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5"/>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">

          {/* 공식 계산기 */}
          {(filteredOfficial.length > 0 || filteredApproved.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">공식 계산기</p>
              {filteredOfficial.map(game => (
                <button key={game.id}
                  onClick={() => { setSelectedOfficialGame(game); setView('play-official'); }}
                  className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-cyan-50 to-blue-50 hover:from-cyan-100 hover:to-blue-100 rounded-xl border border-cyan-200 transition-colors text-left">
                  {game.imageUrl
                    ? <img src={game.imageUrl} alt={game.koreanName} className="w-11 h-11 object-cover rounded-lg flex-shrink-0" />
                    : <div className="w-11 h-11 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">🎲</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-sm">{game.koreanName}</p>
                    <p className="text-xs text-cyan-600">✓ 공식 계산기</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
              {/* 승인된 공개 계산기 */}
              {filteredApproved.map(calc => {
                const game = ownedGames.find(g => g.id === calc.gameId);
                return (
                  <button key={calc.id}
                    onClick={() => { setSelectedCustomCalc(calc); setView('play-custom'); }}
                    className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-cyan-50 to-blue-50 hover:from-cyan-100 hover:to-blue-100 rounded-xl border border-cyan-200 transition-colors text-left">
                    {game?.imageUrl || calc.gameImage
                      ? <img src={game?.imageUrl || calc.gameImage} alt={calc.gameName} className="w-11 h-11 object-cover rounded-lg flex-shrink-0" />
                      : <div className="w-11 h-11 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">🎲</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate text-sm">{calc.title}</p>
                      <p className="text-xs text-cyan-600">✓ 공개 계산기 · {calc.gameName}</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* 커스텀 계산기 */}
          {(filteredCustom.length > 0 || !search) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">내 커스텀 계산기</p>
                <span className="text-xs text-gray-400">{myCustomCalcs.length}개</span>
              </div>

              {loading ? (
                <div className="text-center py-4 text-sm text-gray-400">불러오는 중...</div>
              ) : filteredCustom.length === 0 && !search ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl space-y-1">
                  <p className="text-sm text-gray-500">아직 만든 계산기가 없어요</p>
                  <p className="text-xs text-gray-400">아래 버튼으로 직접 만들어보세요!</p>
                </div>
              ) : (
                filteredCustom.map(calc => {
                  const game = ownedGames.find(g => g.id === calc.gameId);
                  return (
                    <div key={calc.id} className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedCustomCalc(calc); setView('play-custom'); }}
                        className="flex-1 flex items-center gap-3 p-3 bg-gray-50 hover:bg-amber-50 rounded-xl border border-transparent hover:border-amber-200 transition-colors text-left">
                        {game?.imageUrl
                          ? <img src={game.imageUrl} alt={calc.gameName} className="w-11 h-11 object-cover rounded-lg flex-shrink-0" />
                          : <div className="w-11 h-11 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">🎲</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate text-sm">{calc.title}</p>
                          <p className="text-xs text-gray-400">{calc.gameName} · {calc.items.length}개 항목
                            {calc.shareRequested && !calc.approved && <span className="ml-1 text-orange-400">검수 요청중</span>}
                            {calc.approved && <span className="ml-1 text-green-500">✓ 공개됨</span>}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                      {/* 수정/삭제 */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingCalc(calc); setView('build'); }}
                          className="w-8 h-8 bg-gray-100 hover:bg-cyan-100 text-gray-500 hover:text-cyan-600 rounded-lg flex items-center justify-center transition-colors">
                          <Edit2 className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={() => deleteCustomCalc(calc.id)}
                          className="w-8 h-8 bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 rounded-lg flex items-center justify-center transition-colors">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 검색 결과 없음 */}
          {search && filteredOfficial.length === 0 && filteredCustom.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">"{search}" 검색 결과가 없어요</p>
          )}

          {/* 커스텀 계산기 만들기 버튼 */}
          <button onClick={() => { setEditingCalc(undefined); setView('build'); }}
            className="w-full py-3.5 border-2 border-dashed border-gray-200 hover:border-cyan-300 rounded-xl text-sm text-gray-400 hover:text-cyan-500 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4"/> 새 계산기 만들기
          </button>

          <p className="text-xs text-gray-400 text-center">공식 지원: 윙스팬 · 더 많은 게임 준비 중</p>
        </div>
      </div>
    </div>
  );
}