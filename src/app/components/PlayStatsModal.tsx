import { useState, useMemo } from 'react';
import { BoardGame, PlayRecord } from '../App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import {
  ChevronLeft, ChevronRight, Trophy, Clock, Gamepad2,
  TrendingUp, Star, Users, CalendarDays, BarChart3, X
} from 'lucide-react';

interface PlayStatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  games: BoardGame[];
}

interface MonthStats {
  totalPlays: number;
  uniqueGames: number;
  totalMinutes: number;
  newGames: number;
  avgPlayers: number;
  topGames: { game: BoardGame; count: number; minutes: number }[];
  topGame: BoardGame | null;
  allRecords: { game: BoardGame; record: PlayRecord }[];
  winCounts: Record<string, number>;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function PlayStatsModal({ open, onOpenChange, games }: PlayStatsModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // 전체 플레이 기록 + 게임 정보 flatten
  const allRecords = useMemo(() => {
    const records: { game: BoardGame; record: PlayRecord }[] = [];
    for (const game of games) {
      for (const rec of game.playRecords || []) {
        records.push({ game, record: rec });
      }
    }
    return records;
  }, [games]);

  // 선택 월 통계
  const stats: MonthStats = useMemo(() => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthRecords = allRecords.filter(({ record }) =>
      record.date?.startsWith(key)
    );

    const gameCount: Record<string, { game: BoardGame; count: number; minutes: number }> = {};
    let totalMinutes = 0;
    let totalPlayers = 0;
    const winCounts: Record<string, number> = {};

    for (const { game, record } of monthRecords) {
      const gid = game.id;
      if (!gameCount[gid]) gameCount[gid] = { game, count: 0, minutes: 0 };
      gameCount[gid].count++;
      gameCount[gid].minutes += record.totalTime || 0;
      totalMinutes += record.totalTime || 0;
      totalPlayers += record.players?.length || 0;
      if (record.winner && record.winner !== '무승부' && record.winner !== '승자 없음') {
        winCounts[record.winner] = (winCounts[record.winner] || 0) + 1;
      }
    }

    const topGames = Object.values(gameCount).sort((a, b) => b.count - a.count);

    // 이번 달에 처음 추가된 게임 수
    const newGames = games.filter(g => {
      if (!g.createdAt) return false;
      return g.createdAt.startsWith(key);
    }).length;

    return {
      totalPlays: monthRecords.length,
      uniqueGames: topGames.length,
      totalMinutes,
      newGames,
      avgPlayers: monthRecords.length > 0 ? Math.round(totalPlayers / monthRecords.length * 10) / 10 : 0,
      topGames,
      topGame: topGames[0]?.game || null,
      allRecords: monthRecords,
      winCounts,
    };
  }, [allRecords, games, year, month]);

  // 연간 월별 플레이 수 (막대 차트용)
  const yearlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const count = allRecords.filter(({ record }) => record.date?.startsWith(key)).length;
      return { month: m, count };
    });
  }, [allRecords, year]);

  const maxMonthlyCount = Math.max(...yearlyData.map(d => d.count), 1);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const isNext = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (isNext) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const isNextDisabled = year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1);

  const topWinner = Object.entries(stats.winCounts).sort(([, a], [, b]) => b - a)[0];

  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border-0 shadow-2xl">
        {/* 헤더 */}
        <DialogTitle className="sr-only">{year}년 {month}월 플레이 통계</DialogTitle>
        <DialogDescription className="sr-only">월별 보드게임 플레이 통계를 확인합니다.</DialogDescription>
        <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-6 pt-6 pb-8 rounded-t-2xl overflow-hidden">
          {/* 배경 장식 */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-400 rounded-full -translate-y-32 translate-x-32" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400 rounded-full translate-y-24 -translate-x-24" />
          </div>

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-400 tracking-widest uppercase">Play Stats</span>
              </div>
              <button onClick={() => onOpenChange(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 월 선택 */}
            <div className="flex items-center gap-4">
              <button onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-3xl font-black tracking-tight">
                {year}년 {month}월
              </h2>
              <button onClick={nextMonth} disabled={isNextDisabled}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 주요 지표 4개 */}
            <div className="grid grid-cols-4 gap-3 mt-6">
              {[
                { label: '플레이', value: stats.totalPlays, icon: Gamepad2, color: 'text-cyan-400' },
                { label: '게임 종류', value: stats.uniqueGames, icon: Trophy, color: 'text-yellow-400' },
                { label: '새 게임', value: stats.newGames, icon: TrendingUp, color: 'text-green-400' },
                { label: '평균 인원', value: stats.avgPlayers || '-', icon: Users, color: 'text-pink-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
                  <Icon className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
                  <div className="text-2xl font-black">{value}</div>
                  <div className="text-xs text-white/60 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-6 space-y-5 rounded-b-2xl">
          {stats.totalPlays === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">이 달의 플레이 기록이 없어요</p>
              <p className="text-sm mt-1">게임 카드에서 플레이 기록을 추가해보세요!</p>
            </div>
          ) : (
            <>
              {/* 총 플레이 시간 */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">총 플레이 시간</span>
                </div>
                <div className="text-3xl font-black text-gray-900">{formatMinutes(stats.totalMinutes)}</div>
                {stats.totalPlays > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    평균 {formatMinutes(Math.round(stats.totalMinutes / stats.totalPlays))} / 세션
                  </p>
                )}
              </div>

              {/* 이번 달 많이 한 게임 */}
              {stats.topGames.length > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">많이 플레이한 게임</span>
                  </div>
                  <div className="space-y-2.5">
                    {stats.topGames.slice(0, 5).map(({ game, count, minutes }, idx) => {
                      const maxCount = stats.topGames[0].count;
                      const pct = (count / maxCount) * 100;
                      const medals = ['🥇','🥈','🥉'];
                      return (
                        <div key={game.id} className="flex items-center gap-3">
                          <span className="text-lg w-6 text-center shrink-0">
                            {medals[idx] || <span className="text-sm text-gray-400">{idx + 1}</span>}
                          </span>
                          {game.imageUrl ? (
                            <img src={game.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                              <Gamepad2 className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-900 truncate">{game.koreanName || game.englishName}</span>
                              <span className="text-sm font-black text-gray-900 shrink-0">{count}회</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400">{formatMinutes(minutes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 우승자 + 별점 높은 게임 */}
              <div className="grid grid-cols-2 gap-4">
                {/* 최다 우승자 */}
                {topWinner && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">최다 우승</span>
                    </div>
                    <div className="text-lg font-black text-gray-900 truncate">{topWinner[0]}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{topWinner[1]}회 우승</div>
                  </div>
                )}

                {/* 이달 평균 별점 */}
                {stats.allRecords.length > 0 && (() => {
                  const rated = stats.allRecords.filter(({ game }) => game.rating);
                  if (!rated.length) return null;
                  const unique = [...new Map(rated.map(({ game }) => [game.id, game])).values()];
                  const avg = unique.reduce((s, g) => s + (g.rating || 0), 0) / unique.length;
                  return (
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">평균 별점</span>
                      </div>
                      <div className="text-lg font-black text-gray-900">{avg.toFixed(1)}<span className="text-sm text-gray-400 font-normal">/10</span></div>
                      <div className="text-xs text-gray-400 mt-0.5">{unique.length}개 게임</div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* 구매 총액 */}
          {(() => {
            const gamesWithPrice = games.filter(g => g.purchasePrice != null && g.purchasePrice > 0);
            if (gamesWithPrice.length === 0) return null;
            const total = gamesWithPrice.reduce((sum, g) => sum + (g.purchasePrice || 0), 0);
            const avg = Math.round(total / gamesWithPrice.length);
            const maxPrice = Math.max(...gamesWithPrice.map(g => g.purchasePrice || 0));
            const mostExpensive = gamesWithPrice.find(g => g.purchasePrice === maxPrice);
            return (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">💰</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">컬렉션 구매 총액</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">총 구매액</div>
                    <div className="text-lg font-black text-gray-900">{total.toLocaleString()}<span className="text-xs font-normal text-gray-400">원</span></div>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">평균 단가</div>
                    <div className="text-lg font-black text-gray-900">{avg.toLocaleString()}<span className="text-xs font-normal text-gray-400">원</span></div>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">기록된 게임</div>
                    <div className="text-lg font-black text-gray-900">{gamesWithPrice.length}<span className="text-xs font-normal text-gray-400">개</span></div>
                  </div>
                </div>
                {mostExpensive && (
                  <div className="mt-3 flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
                    <span className="text-sm">👑</span>
                    <div className="min-w-0">
                      <span className="text-xs text-gray-500">최고가 </span>
                      <span className="text-xs font-semibold text-gray-800 truncate">{mostExpensive.koreanName}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-700 ml-auto flex-shrink-0">{maxPrice.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 연간 월별 플레이 수 막대 차트 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{year}년 월별 플레이</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setYear(y => y - 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <span className="text-xs font-bold text-gray-600 w-10 text-center">{year}</span>
                <button onClick={() => setYear(y => Math.min(y + 1, now.getFullYear()))}
                  disabled={year >= now.getFullYear()}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors disabled:opacity-30">
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {yearlyData.map(({ month: m, count }) => {
                const pct = count === 0 ? 0 : Math.max((count / maxMonthlyCount) * 100, 8);
                const isCurrent = m === month && year === year;
                return (
                  <button key={m} onClick={() => setMonth(m)}
                    className="flex-1 flex flex-col items-center gap-1 group"
                    title={`${m}월: ${count}회`}>
                    <span className="text-xs font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {count}
                    </span>
                    <div className="w-full rounded-t-md transition-all duration-300"
                      style={{
                        height: `${pct}%`,
                        minHeight: count > 0 ? '6px' : '2px',
                        backgroundColor: m === month
                          ? '#06b6d4'
                          : count > 0 ? '#e2e8f0' : '#f1f5f9',
                      }} />
                    <span className={`text-xs transition-colors ${m === month ? 'font-bold text-cyan-600' : 'text-gray-400'}`}>
                      {m}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 플레이 기록 목록 */}
          {stats.allRecords.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  이달 플레이 기록 ({stats.allRecords.length}건)
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {stats.allRecords
                  .sort((a, b) => b.record.date.localeCompare(a.record.date))
                  .map(({ game, record }) => (
                    <div key={record.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      {game.imageUrl ? (
                        <img src={game.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{game.koreanName || game.englishName}</p>
                        <p className="text-xs text-gray-400">
                          {record.date} · {record.players?.length || 1}인 · {formatMinutes(record.totalTime || 0)}
                          {record.winner && record.winner !== '승자 없음' && ` · 🏆 ${record.winner}`}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}