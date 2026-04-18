import { useState, useEffect } from 'react';
import { Loader2, Trophy, Gamepad2, CreditCard, ChevronRight } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface RankUser {
  userId: string;
  nickname: string;
  totalGames: number;
  totalPlayCount: number;
  totalSpent: number;
}

interface RankingData {
  byGames: RankUser[];
  byPlayCount: RankUser[];
  bySpent: RankUser[];
}

interface RankingPageProps {
  currentUserId?: string;
  onViewUserGames: (userId: string, nickname: string) => void;
}

type RankTab = 'games' | 'playCount' | 'spent';

export function RankingPage({ currentUserId, onViewUserGames }: RankingPageProps) {
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RankTab>('games');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/ranking`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  const tabs: { key: RankTab; label: string; icon: typeof Trophy; color: string; desc: string }[] = [
    { key: 'games',     label: '보유 수량',   icon: Gamepad2,   color: 'text-cyan-500',   desc: '가장 많은 게임을 보유한 랭커' },
    { key: 'playCount', label: '다회 플레이', icon: Trophy,     color: 'text-yellow-500', desc: '가장 많이 플레이한 랭커' },
    { key: 'spent',     label: '구매 금액',   icon: CreditCard, color: 'text-green-500',  desc: '가장 많이 투자한 랭커' },
  ];

  const fullList = data
    ? tab === 'games' ? data.byGames
    : tab === 'playCount' ? data.byPlayCount
    : data.bySpent
    : [];
  const rankList = showAll ? fullList : fullList.slice(0, 10);

  const getValue = (u: RankUser) =>
    tab === 'games' ? `${u.totalGames}개`
    : tab === 'playCount' ? `${u.totalPlayCount}회`
    : `${u.totalSpent.toLocaleString()}원`;

  const medalColor = (i: number) =>
    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300';

  const medalEmoji = (i: number) =>
    i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`;

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
        <h2 className="text-xl font-black text-gray-900">🏆 보드랭킹</h2>
        <p className="text-sm text-gray-500 mt-0.5">보드라움 회원들의 컬렉션 랭킹이에요</p>
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
        {tabs.map(({ key, label, icon: Icon, color }) => (
          <button key={key} onClick={() => { setTab(key); setShowAll(false); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              tab === key
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            <Icon className={`w-4 h-4 ${tab === key ? 'text-white' : color}`} />
            {label}
          </button>
        ))}
      </div>

      {/* 설명 */}
      <p className="text-xs text-gray-400">
        {tabs.find(t => t.key === tab)?.desc} · 닉네임은 일부 가려져 표시됩니다
      </p>
      </div>

      {/* 랭킹 목록 */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : rankList.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-gray-500 font-medium">아직 랭킹 데이터가 없어요</p>
          <p className="text-sm text-gray-400 mt-1">게임을 추가하고 플레이 기록을 쌓아보세요!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 상위 3위 podium */}
          {rankList.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[rankList[1], rankList[0], rankList[2]].map((u, podiumIdx) => {
                const rank = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2;
                const heights = ['h-24', 'h-32', 'h-20'];
                const height = heights[podiumIdx];
                return (
                  <button key={u.userId}
                    onClick={() => onViewUserGames(u.userId, u.nickname)}
                    className="flex flex-col items-center gap-2 group">
                    <div className="text-2xl">{['🥈','🥇','🥉'][podiumIdx]}</div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs font-semibold text-gray-700 truncate">{u.nickname}</span>
                      {u.userId === currentUserId && (
                        <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-1 py-0.5 rounded-full flex-shrink-0">나</span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-gray-900">{getValue(u)}</div>
                    <div className={`w-full ${height} rounded-t-xl flex items-end justify-center pb-2 transition-all group-hover:opacity-80 ${
                      podiumIdx === 1 ? 'bg-yellow-400' : podiumIdx === 0 ? 'bg-gray-300' : 'bg-amber-500'
                    }`}>
                      <span className="text-white font-black text-lg">{rank + 1}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 전체 목록 */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {rankList.map((u, i) => (
              <button key={u.userId} onClick={() => onViewUserGames(u.userId, u.nickname)}
                className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 text-left">
                {/* 순위 */}
                <div className={`w-8 text-center font-black text-sm flex-shrink-0 ${medalColor(i)}`}>
                  {medalEmoji(i)}
                </div>
                {/* 아바타 */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {u.nickname[0]?.toUpperCase() || '?'}
                </div>
                {/* 닉네임 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-gray-900 truncate">{u.nickname}</p>
                    {u.userId === currentUserId && (
                      <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-full flex-shrink-0">나</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {tab !== 'games' && `보유 ${u.totalGames}개`}
                    {tab === 'playCount' && ` · 총 ${u.totalPlayCount}회`}
                    {tab === 'spent' && ` · 투자 ${u.totalSpent.toLocaleString()}원`}
                  </p>
                </div>
                {/* 값 */}
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-gray-900">{getValue(u)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>

          {!showAll && fullList.length > 10 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-sm font-semibold text-cyan-600 hover:text-cyan-700 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all mt-1"
            >
              더보기 ({fullList.length - 10}명 더) ▼
            </button>
          )}
          <p className="text-xs text-gray-400 text-center pt-2">
            게임 리스트를 눌러 해당 랭커의 컬렉션을 확인할 수 있어요
          </p>
        </div>
      )}
      </div>
    </div>
  );
}