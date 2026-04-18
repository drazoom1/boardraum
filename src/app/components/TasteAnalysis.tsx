import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { BoardGameWorldCup } from './BoardGameWorldCup';
import type { BoardGame } from '../App';

interface Props {
  accessToken?: string | null;
  userEmail?: string | null;
  wishlistGames?: BoardGame[];
  onAddToWishlist?: (game: BoardGame) => void;
}

export function TasteAnalysis({ accessToken, userEmail, wishlistGames = [], onAddToWishlist }: Props) {
  const [activeFeature, setActiveFeature] = useState<string | null>(null);

  if (activeFeature === 'worldcup') {
    return (
      <div>
        <button
          onClick={() => setActiveFeature(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          ← 취향 분석으로 돌아가기
        </button>
        <BoardGameWorldCup
          accessToken={accessToken}
          userEmail={userEmail}
          wishlistGames={wishlistGames}
          onAddToWishlist={onAddToWishlist}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-full text-purple-600 text-xs font-bold tracking-wide mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          취향 분석
        </div>
        <h1 className="text-2xl font-black text-gray-900">나의 보드게임 취향 찾기</h1>
        <p className="text-gray-500 text-sm mt-2">다양한 테스트로 나만의 보드게임 취향을 발견해보세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveFeature('worldcup')}
          className="group text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/10 transition-all duration-200 hover:-translate-y-0.5"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform shadow-md">
            🏆
          </div>
          <h3 className="font-bold text-gray-900 mb-1">보드게임 월드컵</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            보드라움 전체 등록 게임 중 32개를 뽑아<br />
            1:1 대결로 나의 최애를 찾아보세요
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-medium">32강</span>
            <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">결과 공유</span>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">이미지 저장</span>
          </div>
        </button>

        {[
          { emoji: '🎯', title: '플레이 스타일 테스트', desc: '나는 전략형? 파티형? 협력형?\n몇 가지 질문으로 플레이 스타일을 분석해드려요' },
          { emoji: '📊', title: '장르 취향 분석', desc: '플레이 기록 기반으로 내가 자주 하는\n게임 장르와 메커니즘을 분석해드려요' },
        ].map(({ emoji, title, desc }) => (
          <div key={title}
            className="relative text-left bg-gray-50 rounded-2xl border border-gray-100 p-5 opacity-60 cursor-not-allowed overflow-hidden">
            <div className="absolute top-3 right-3 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">
              준비중
            </div>
            <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center text-xl mb-4 text-gray-400">
              {emoji}
            </div>
            <h3 className="font-bold text-gray-500 mb-1">{title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}