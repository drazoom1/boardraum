import { useState } from 'react';
import { MessageSquare, X, ChevronLeft, ExternalLink, Loader2, Star } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getWikiGameId } from '../utils/wikiGameId';

type ReviewItem = {
  source: 'boardraum' | 'bgg';
  title: string;
  content: string;        // boardraum: description / bgg: 번역문
  original?: string;      // bgg 원문
  rating?: number | string;
  author?: string;
  images?: string[];
  link: string;
};

// 게임태그 옆 "후기" 버튼 — 누르면 해당 게임의 후기 리스트(제목)를 보여주고,
// 항목을 누르면 상세를 모달로 보여준다. 보드라움 후기가 없으면 BGG 후기(한국어 번역)로 폴백.
export function GameReviewsButton({ game, compact = false }: {
  game: { id?: string; bggId?: string; name: string };
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [source, setSource] = useState<'boardraum' | 'bgg' | 'none'>('none');
  const [selected, setSelected] = useState<ReviewItem | null>(null);

  const bggId = /^\d+$/.test(game.bggId || '') ? game.bggId
    : /^\d+$/.test(game.id || '') ? game.id : '';
  const wikiId = getWikiGameId({ id: game.id, bggId: game.bggId, koreanName: game.name });

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      // 1) 보드라움 위키 후기 우선
      const r = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${encodeURIComponent(wikiId)}?category=review`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } });
      const d = r.ok ? await r.json() : { posts: [] };
      const reviews = (d.posts || []).filter((p: any) => p.category === 'review');
      if (reviews.length > 0) {
        setSource('boardraum');
        setItems(reviews.map((p: any) => ({
          source: 'boardraum' as const,
          title: p.title || '후기',
          content: p.description || '',
          rating: p.data?.rating,
          author: p.created_by_name || '',
          images: Array.isArray(p.images) ? p.images : [],
          link: `https://www.boardraum.site/game/${encodeURIComponent(game.name)}`,
        })));
      } else if (bggId) {
        // 2) BGG 후기 (한국어 자동 번역)
        const br = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/reviews-bgg?id=${bggId}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } });
        const bd = br.ok ? await br.json() : { reviews: [] };
        if ((bd.reviews || []).length > 0) {
          setSource('bgg');
          setItems((bd.reviews as any[]).map(x => ({
            source: 'bgg' as const,
            title: `${x.username || 'BGG 유저'} · ★${x.rating}`,
            content: x.translated || x.original || '',
            original: x.original || '',
            rating: x.rating,
            link: bd.bggUrl || `https://boardgamegeek.com/boardgame/${bggId}`,
          })));
        } else { setSource('none'); setItems([]); }
      } else { setSource('none'); setItems([]); }
    } catch {
      setSource('none'); setItems([]);
    }
    setLoading(false);
    setLoaded(true);
  };

  const close = () => { setOpen(false); setSelected(null); };

  const Stars = ({ value }: { value: number }) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(value / 2) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
      ))}
      <span className="text-xs text-gray-500 ml-1">{value}</span>
    </div>
  );

  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); load(); }}
        className={`flex-shrink-0 flex items-center gap-1 rounded-lg font-semibold border border-gray-200 bg-white text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 transition-colors ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'}`}>
        <MessageSquare className="w-3.5 h-3.5" /> 후기
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[9990]" onClick={(e) => { e.stopPropagation(); close(); }} />
          <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                {selected && (
                  <button onClick={() => setSelected(null)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className="font-bold text-gray-900 text-sm flex-1 truncate">
                  {selected ? selected.title : `🎲 ${game.name} · 후기`}
                </h3>
                <button onClick={close} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 본문 */}
              <div className="overflow-y-auto p-4 min-h-[120px]">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mb-2" /> <span className="text-sm">후기 불러오는 중…</span>
                  </div>
                )}

                {!loading && items.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-sm">아직 등록된 후기가 없어요</div>
                )}

                {/* 리스트 (제목만) */}
                {!loading && !selected && items.length > 0 && (
                  <>
                    <div className="text-[11px] text-gray-400 mb-1">
                      {source === 'bgg' ? '🌐 BGG 후기 (자동 번역)' : '🩵 보드라움 후기'} · {items.length}개
                    </div>
                    <div className="divide-y divide-gray-100">
                      {items.map((it, i) => (
                        <button key={i} type="button" onClick={() => setSelected(it)}
                          className="w-full text-left py-3 px-1 flex items-center gap-2 hover:bg-gray-50 rounded-lg transition-colors">
                          {it.rating != null && it.rating !== '' && (
                            <span className="flex-shrink-0 text-[11px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">★{it.rating}</span>
                          )}
                          <span className="flex-1 truncate text-sm text-gray-800">{it.title}</span>
                          <span className="flex-shrink-0 text-gray-300 text-xs">›</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* 상세 */}
                {!loading && selected && (
                  <div className="space-y-3">
                    {selected.source === 'boardraum' && selected.rating != null && (
                      <Stars value={Number(selected.rating) || 0} />
                    )}
                    {selected.author && <div className="text-xs text-gray-400">작성자: {selected.author}</div>}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{selected.content || '(내용 없음)'}</p>
                    {Array.isArray(selected.images) && selected.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {selected.images.map((src, i) => (
                          <img key={i} src={src} className="w-full rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ))}
                      </div>
                    )}
                    {selected.source === 'bgg' && selected.original && (
                      <details className="text-xs text-gray-400">
                        <summary className="cursor-pointer">원문(영어) 보기</summary>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{selected.original}</p>
                      </details>
                    )}
                    <a href={selected.link} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:text-cyan-700">
                      출처에서 보기 <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
