import { useState } from 'react';
import { X } from 'lucide-react';
import {
  chess_t1_king, chess_t1_queen, chess_t1_bishop, chess_t1_knight, chess_t1_rook, chess_t1_pawn,
  chess_t2_king, chess_t2_queen, chess_t2_bishop, chess_t2_knight, chess_t2_rook, chess_t2_pawn,
  chess_t3_king, chess_t3_queen, chess_t3_bishop, chess_t3_knight, chess_t3_rook, chess_t3_pawn,
  chess_t4_king, chess_t4_queen, chess_t4_bishop, chess_t4_knight, chess_t4_rook, chess_t4_pawn,
  chess_t5_king, chess_t5_queen, chess_t5_bishop, chess_t5_knight, chess_t5_rook, chess_t5_pawn,
  chess_t6_king, chess_t6_queen, chess_t6_bishop, chess_t6_knight, chess_t6_rook, chess_t6_pawn,
} from './chessIcons';
import {
  ALL_RANKS, POINT_RULES,
  getRankByStats, getNextRank, getRankProgress,
  type ChessRank, type PieceType, type TierNum,
} from './chessRank';

const TIER_IMGS: Record<TierNum, Record<PieceType, string>> = {
  1: { king: chess_t1_king, queen: chess_t1_queen, bishop: chess_t1_bishop, knight: chess_t1_knight, rook: chess_t1_rook, pawn: chess_t1_pawn },
  2: { king: chess_t2_king, queen: chess_t2_queen, bishop: chess_t2_bishop, knight: chess_t2_knight, rook: chess_t2_rook, pawn: chess_t2_pawn },
  3: { king: chess_t3_king, queen: chess_t3_queen, bishop: chess_t3_bishop, knight: chess_t3_knight, rook: chess_t3_rook, pawn: chess_t3_pawn },
  4: { king: chess_t4_king, queen: chess_t4_queen, bishop: chess_t4_bishop, knight: chess_t4_knight, rook: chess_t4_rook, pawn: chess_t4_pawn },
  5: { king: chess_t5_king, queen: chess_t5_queen, bishop: chess_t5_bishop, knight: chess_t5_knight, rook: chess_t5_rook, pawn: chess_t5_pawn },
  6: { king: chess_t6_king, queen: chess_t6_queen, bishop: chess_t6_bishop, knight: chess_t6_knight, rook: chess_t6_rook, pawn: chess_t6_pawn },
};

function getImg(rank: ChessRank) {
  return TIER_IMGS[rank.tier][rank.piece];
}

// 아이콘만
export function ChessRankIcon({ rank, size = 'sm' }: { rank: ChessRank; size?: 'xs'|'sm'|'md'|'lg' }) {
  const sizeMap = { xs:'w-4 h-4', sm:'w-5 h-5', md:'w-7 h-7', lg:'w-10 h-10' };
  return <img src={getImg(rank)} className={`${sizeMap[size]} object-contain flex-shrink-0`} title={rank.label} />;
}

// 배지 (피드: 아이콘만 / 마이페이지: 아이콘+텍스트)
export function ChessRankBadge({ rank, showLabel = false }: { rank: ChessRank; showLabel?: boolean }) {
  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1 flex-shrink-0">
        <img src={getImg(rank)} className="w-5 h-5 object-contain" />
        <span className="text-xs font-semibold text-gray-600">{rank.label}</span>
      </span>
    );
  }
  return <img src={getImg(rank)} className="w-5 h-5 object-contain flex-shrink-0" title={rank.label} />;
}

// 등급 설명 모달
export function RankInfoModal({ onClose, userPoints, userPosts, userComments, userLikes }: {
  onClose: () => void;
  userPoints: number; userPosts: number; userComments: number; userLikes: number;
}) {
  const [tab, setTab] = useState<'my'|'table'>('my');
  const cur = getRankByStats(userPoints, userPosts, userComments, userLikes);
  const next = getNextRank(cur);
  const prog = getRankProgress(userPoints, cur, next);

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">♟️ 체스 등급 시스템</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(['my','table'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold relative ${tab===t ? 'text-gray-900' : 'text-gray-400'}`}>
              {t==='my' ? '내 등급' : '등급표'}
              {tab===t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === 'my' ? (
            <div className="px-5 py-5 space-y-5">
              {/* 현재 등급 */}
              <div className="rounded-2xl p-5 text-center bg-gray-50">
                <img src={getImg(cur)} className="w-24 h-24 object-contain mx-auto mb-3" />
                <p className="text-2xl font-black text-gray-900">{cur.label}</p>
              </div>

              {/* 진행바 */}
              {next ? (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span className="font-semibold text-gray-700">{cur.label}</span>
                    <span>{userPoints.toLocaleString()} / {next.points.toLocaleString()} pt</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gray-800 transition-all duration-500" style={{ width: `${prog}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">다음: {next.label} ({prog}%)</p>
                </div>
              ) : <p className="text-center text-sm font-bold text-gray-900">🏆 최고 등급 달성!</p>}

              {/* 통계 */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label:'총 포인트', val:userPoints, unit:'pt', icon:'⭐' },
                  { label:'작성한 글', val:userPosts, unit:'개', icon:'📝' },
                  { label:'작성한 댓글', val:userComments, unit:'개', icon:'💬' },
                  { label:'받은 하트', val:userLikes, unit:'개', icon:'❤️' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-0.5">{s.icon} {s.label}</p>
                    <p className="text-lg font-black text-gray-900">{s.val.toLocaleString()}<span className="text-xs font-normal ml-0.5">{s.unit}</span></p>
                  </div>
                ))}
              </div>

              {/* 포인트 적립 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 mb-2">포인트 적립 방법</p>
                {[
                  { label:'게시물 작성', pt:`+${POINT_RULES.POST}pt` },
                  { label:'댓글 작성', pt:`+${POINT_RULES.COMMENT}pt` },
                  { label:'하트 받기', pt:`+${POINT_RULES.LIKE_RECEIVED}pt` },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{r.label}</span>
                    <span className="text-sm font-bold text-gray-900">{r.pt}</span>
                  </div>
                ))}
              </div>

              {/* 다음 등급 조건 */}
              {next && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={getImg(next)} className="w-6 h-6 object-contain" />
                    <p className="text-xs font-bold text-gray-600">다음 등급 조건: {next.label}</p>
                  </div>
                  {[
                    { label:'포인트', need:next.points, have:userPoints },
                    { label:'글', need:next.posts, have:userPosts },
                    { label:'댓글', need:next.comments, have:userComments },
                    { label:'받은 하트', need:next.likes, have:userLikes },
                  ].map(c => {
                    const done = c.have >= c.need;
                    return (
                      <div key={c.label} className="flex justify-between items-center text-sm">
                        <span className={done ? 'text-green-600 font-medium' : 'text-gray-600'}>{done ? '✅' : '◻️'} {c.label}</span>
                        <span className={`font-bold ${done ? 'text-green-600' : 'text-gray-700'}`}>
                          {c.have.toLocaleString()} / {c.need.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-4">
              {([1,2,3,4,5,6] as TierNum[]).map(tier => {
                const ranks = ALL_RANKS.filter(r => r.tier === tier);
                return (
                  <div key={tier} className="mb-5">
                    <p className="text-sm font-bold text-gray-700 mb-2 px-1">{tier}단계 ({ranks[0].tierKo})</p>
                    <div className="rounded-xl overflow-hidden border border-gray-100">
                      <div className="grid grid-cols-5 bg-gray-50 px-3 py-2 text-xs text-gray-400 font-medium">
                        <span>등급</span>
                        <span className="text-right">포인트</span>
                        <span className="text-right">글</span>
                        <span className="text-right">댓글</span>
                        <span className="text-right">하트</span>
                      </div>
                      {ranks.map((rank, i) => (
                        <div key={rank.label} className={`grid grid-cols-5 px-3 py-2 text-xs items-center ${i%2===0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <div className="flex items-center gap-1.5">
                            <img src={getImg(rank)} className="w-6 h-6 object-contain" />
                            <span className="font-medium text-gray-700">{rank.pieceKo}</span>
                          </div>
                          <span className="text-right font-bold text-gray-800">{rank.points.toLocaleString()}</span>
                          <span className="text-right text-gray-600">{rank.posts.toLocaleString()}</span>
                          <span className="text-right text-gray-600">{rank.comments.toLocaleString()}</span>
                          <span className="text-right text-gray-600">{rank.likes.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}