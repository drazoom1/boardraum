// ♟️ 보드라움 등급 시스템 (6단계 × 6레벨 = 36등급)
// 포인트 적립: 글 1개 = 10pt, 댓글 1개 = 3pt, 하트 1개 받을 때 = 5pt

export const POINT_RULES = {
  POST: 10,
  COMMENT: 3,
  LIKE_RECEIVED: 5,
} as const;

export type TierNum = 1 | 2 | 3 | 4 | 5 | 6;
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

export interface ChessRank {
  tier: TierNum;
  piece: PieceType;
  tierKo: string;
  pieceKo: string;
  points: number;
  posts: number;
  comments: number;
  likes: number;
  label: string;
}

const TIER_KO: Record<TierNum, string> = {
  1: '애기', 2: '유아', 3: '보린이', 4: '대딩', 5: '회사원', 6: '원로',
};

const PIECES: { piece: PieceType; pieceKo: string }[] = [
  { piece: 'pawn',   pieceKo: '1' },
  { piece: 'rook',   pieceKo: '2' },
  { piece: 'knight', pieceKo: '3' },
  { piece: 'bishop', pieceKo: '4' },
  { piece: 'queen',  pieceKo: '5' },
  { piece: 'king',   pieceKo: '6' },
];

// 포인트/글/댓글/하트 (6단계 × 6기물 = 36등급)
const RAW_DATA: [number, number, number, number][] = [
  // 1단계
  [0,   0,  0,   0],
  [80,  3,  10,  1],
  [200, 6,  25,  3],
  [400, 10, 50,  6],
  [700, 15, 80,  10],
  [1100,22, 120, 15],
  // 2단계
  [1600, 30,  170, 20],
  [2200, 40,  230, 28],
  [2900, 52,  300, 38],
  [3700, 65,  380, 50],
  [4600, 80,  470, 63],
  [5600, 97,  570, 78],
  // 3단계
  [6800,  115, 680,  95],
  [8200,  135, 800,  115],
  [9800,  157, 930,  138],
  [11600, 180, 1080, 163],
  [13600, 206, 1240, 191],
  [15800, 234, 1410, 222],
  // 4단계
  [18300, 265, 1600, 256],
  [21000, 298, 1800, 293],
  [24000, 334, 2020, 334],
  [27300, 373, 2260, 379],
  [30900, 415, 2520, 428],
  [34800, 460, 2800, 481],
  // 5단계
  [39200,  510, 3100, 539],
  [43900,  563, 3420, 602],
  [49000,  620, 3760, 670],
  [54600,  682, 4120, 744],
  [60600,  748, 4510, 824],
  [67000,  820, 4920, 910],
  // 6단계
  [74000,  898,  5360, 1003],
  [81500,  982,  5830, 1103],
  [89500,  1073, 6330, 1210],
  [98000,  1171, 6860, 1325],
  [107000, 1277, 7420, 1449],
  [116500, 1391, 8010, 1582],
];

export const ALL_RANKS: ChessRank[] = ([1,2,3,4,5,6] as TierNum[]).flatMap((tier, ti) =>
  PIECES.map((p, pi) => {
    const [points, posts, comments, likes] = RAW_DATA[ti * 6 + pi];
    return {
      tier, piece: p.piece, tierKo: TIER_KO[tier],
      pieceKo: p.pieceKo, points, posts, comments, likes,
      label: `${TIER_KO[tier]} ${p.pieceKo}`,
    };
  })
);

export function getRankByStats(points: number, posts: number, comments: number, likes: number): ChessRank {
  let current = ALL_RANKS[0];
  for (const rank of ALL_RANKS) {
    if (points >= rank.points && posts >= rank.posts && comments >= rank.comments && likes >= rank.likes) {
      current = rank;
    } else break;
  }
  return current;
}

export function getNextRank(current: ChessRank): ChessRank | null {
  const idx = ALL_RANKS.findIndex(r => r.tier === current.tier && r.piece === current.piece);
  return idx < ALL_RANKS.length - 1 ? ALL_RANKS[idx + 1] : null;
}

export function getRankProgress(points: number, current: ChessRank, next: ChessRank | null): number {
  if (!next) return 100;
  const range = next.points - current.points;
  const earned = points - current.points;
  return Math.min(100, Math.max(0, Math.round((earned / range) * 100)));
}