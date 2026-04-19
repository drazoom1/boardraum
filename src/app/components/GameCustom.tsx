import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Heart, MessageCircle, AlertCircle, CheckCircle, XCircle, Edit, FileText, Package, Boxes, Video, Users, Star, ChevronRight, Camera, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { BoardGame } from '../App';
import { SleeveForm, OrganizerForm, ComponentUpgradeForm, FreePostForm, GameOverviewForm, GameComponentsForm, VideoForm, ReviewForm } from './GameCustomForms';
import { getSupabaseClient } from '../lib/supabase';
import { deduplicateAndMergeGames, type GameWithUserId } from '../utils/gameMerger';
import { getWikiGameId } from '../utils/wikiGameId';

const supabase = getSupabaseClient();

interface GameCustomProps {
  ownedGames: BoardGame[];
  wishlistGames?: BoardGame[];
  onAddToWishlist?: (game: BoardGame) => void;
  accessToken: string;
  userEmail: string;
  initialCategory?: string;
  initialGame?: BoardGame;
  initialTab?: 'info' | 'feed';
}

interface BggHotGame {
  id: string;
  rank: number;
  name: string;
  thumbnail: string;
  yearPublished: string;
  koreanName?: string;
}

interface CustomPost {
  id: string;
  gameId: string;
  gameName: string;
  category: string;
  postType: 'info' | 'post';
  title: string;
  description: string;
  link: string;
  sizeInfo: string;
  images: string[];
  data: any;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string;
  created_by_email: string;
  created_at: string;
  likes: number;
  liked_by: string[];
  rejectionReason?: string;
}

interface Comment {
  id: string;
  postId: string;
  content: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
}

const CATEGORIES = [
  { id: 'overview', name: '게임 설명', icon: 'FileText' },
  { id: 'sleeve', name: '슬리브 크기', icon: 'Package' },
  { id: 'components', name: '구성품', icon: 'Boxes' },
  { id: 'video', name: '플레이/규칙 영상', icon: 'Video' },
  { id: 'review', name: '평가/리뷰', icon: 'MessageSquare' },
  { id: 'player-count', name: '인원별 평가', icon: 'Users' },
];

// 메타태그 헬퍼
function setMeta(name: string, content: string) {
  const isOg = name.startsWith('og:') || name.startsWith('twitter:');
  const attr = isOg ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function GameCustom({ ownedGames, wishlistGames = [], onAddToWishlist, accessToken, userEmail, initialCategory, initialGame, initialTab = 'info' }: GameCustomProps) {
  const [selectedGame, setSelectedGame] = useState<BoardGame | null>(initialGame || null);
  const isFirstMount = useRef(true);

  // initialGame에 유효한 bggId 없으면 이름으로 BGG 검색해서 자동 매칭
  useEffect(() => {
    if (!initialGame) return;
    const hasValidBggId = /^\d+$/.test(initialGame.bggId || '') || /^\d+$/.test(initialGame.id || '');
    if (hasValidBggId) return;
    const name = initialGame.koreanName || initialGame.englishName || '';
    if (!name) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ query: name }),
    }).then(r => r.ok ? r.json() : []).then((results: any[]) => {
      if (!results.length) return;
      const match = results[0];
      // id는 변경하지 않음 — id 변경 시 useEffect([selectedGame?.id])가 재발동해 게임피드 탭이 info로 리셋되는 버그 방지
      setSelectedGame(prev => prev ? { ...prev, bggId: match.id, englishName: prev.englishName || match.name } : prev);
    }).catch(() => {});
  }, []);

  // game/info를 이미 fetch한 게임 ID 추적 (중복 fetch 방지)
  const siteInfoFetchedRef = useRef<Set<string>>(new Set());

  // selectedGame이 바뀔 때 이미지/상세정보 없으면 자동 로드
  useEffect(() => {
    if (!selectedGame) return;
    // 숫자 bggId만 유효한 것으로 취급
    const bggId = /^\d+$/.test(selectedGame.bggId || '') ? selectedGame.bggId
      : /^\d+$/.test(selectedGame.id || '') ? selectedGame.id : '';
    if (bggId) {
      // BGG 게임: 이미지 없을 때만 image-override + bgg-details에서 로드
      if (selectedGame.imageUrl) return;
      Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/image-override?bggId=${bggId}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` }, body: JSON.stringify({ id: bggId }) }),
      ]).then(async ([overrideRes, detailRes]) => {
        const override = overrideRes.ok ? await overrideRes.json() : null;
        const detail = detailRes.ok ? await detailRes.json() : null;
        const img = override?.imageUrl || detail?.imageUrl || '';
        if (img) setSelectedGame(prev => prev ? { ...prev, imageUrl: img, recommendedPlayers: prev.recommendedPlayers || (detail?.minPlayers && detail?.maxPlayers ? `${detail.minPlayers}-${detail.maxPlayers}명` : ''), playTime: prev.playTime || (detail?.maxPlayTime ? `${detail.maxPlayTime}분` : '') } : prev);
      }).catch(() => {});
    } else {
      // 직접 등록 게임(비BGG): game/info?name=으로 site_game_* 전체 데이터 로드
      const fetchKey = selectedGame.id;
      if (siteInfoFetchedRef.current.has(fetchKey)) return; // 이미 fetch했으면 스킵
      if (selectedGame.imageUrl && selectedGame.yearPublished) return; // 이미 완전한 데이터 있으면 스킵
      const name = selectedGame.koreanName || selectedGame.englishName || '';
      if (!name) return;
      siteInfoFetchedRef.current.add(fetchKey);
      fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/info?name=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } })
        .then(r => r.ok ? r.json() : null)
        .then(info => {
          if (!info) return;
          setSelectedGame(prev => prev ? {
            ...prev,
            imageUrl: prev.imageUrl || info.imageUrl || '',
            englishName: prev.englishName || info.englishName || '',
            koreanName: prev.koreanName || info.koreanName || '',
            yearPublished: prev.yearPublished || info.yearPublished || '',
            recommendedPlayers: prev.recommendedPlayers || info.recommendedPlayers || '',
            playTime: prev.playTime || info.playTime || '',
            complexity: (prev as any).complexity ?? info.complexity,
            averageRating: (prev as any).averageRating ?? info.averageRating,
            designers: (prev as any).designers || info.designers || [],
            publishers: (prev as any).publishers || info.publishers || [],
          } : prev);
        }).catch(() => {});
    }
  }, [selectedGame?.id, selectedGame?.bggId]);

  // 게임 진입/이탈 시 URL + 메타태그 + JSON-LD 업데이트
  useEffect(() => {
    if (selectedGame) {
      const gameName = selectedGame.koreanName || selectedGame.englishName || '';
      const gameId = selectedGame.bggId || selectedGame.id;
      const slug = encodeURIComponent(gameName || gameId);

      // URL 업데이트 (/game/게임이름)
      const newUrl = `/game/${slug}`;
      if (window.location.pathname !== newUrl) {
        window.history.pushState({ gameId }, '', newUrl);
      }

      // 동적 메타태그 업데이트
      const players = selectedGame.recommendedPlayers || '';
      const playTime = selectedGame.playTime || '';
      const year = selectedGame.yearPublished || '';
      const desc = `${gameName}${year ? ` (${year}년)` : ''}${players ? ` · ${players}` : ''}${playTime ? ` · ${playTime}` : ''} — 보드라움에서 ${gameName} 정보, 리뷰, 커뮤니티를 만나보세요.`;

      document.title = `${gameName} — 보드라움`;
      setMeta('description', desc);
      setMeta('og:title', `${gameName} — 보드라움`);
      setMeta('og:description', desc);
      setMeta('og:image', selectedGame.imageUrl || '');
      setMeta('og:url', `https://boardraum.site/game/${slug}`);
      setMeta('twitter:title', `${gameName} — 보드라움`);
      setMeta('twitter:description', desc);

      // JSON-LD 삽입
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Game',
        name: gameName,
        alternateName: selectedGame.englishName || undefined,
        description: desc,
        image: selectedGame.imageUrl || undefined,
        url: `https://boardraum.site/game/${slug}`,
        ...(year ? { datePublished: year } : {}),
        ...(players ? { numberOfPlayers: players } : {}),
        aggregateRating: undefined,
      };
      let el = document.getElementById('boardraum-jsonld');
      if (!el) { el = document.createElement('script'); el.id = 'boardraum-jsonld'; (el as HTMLScriptElement).type = 'application/ld+json'; document.head.appendChild(el); }
      el.textContent = JSON.stringify(jsonLd);

    } else {
      // 뒤로가기 시 원래 상태 복원
      if (window.location.pathname.startsWith('/game/')) {
        window.history.pushState({}, '', '/');
      }
      document.title = '보드라움 - 보드게임 컬렉션 관리 커뮤니티';
      setMeta('description', '보드게임 컬렉션을 관리하고, 위시리스트를 만들고, 보드게이머들과 소통하는 커뮤니티.');
      setMeta('og:title', '보드라움 - 보드게임 컬렉션 관리 커뮤니티');
      setMeta('og:description', '보드게임 컬렉션을 관리하고, 위시리스트를 만들고, 보드게이머들과 소통하는 커뮤니티.');
      const el = document.getElementById('boardraum-jsonld');
      if (el) el.remove();
    }
  }, [selectedGame?.id, selectedGame?.recommendedPlayers, selectedGame?.playTime]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || CATEGORIES[0].id);
  const [mainTab, setMainTab] = useState<'info' | 'feed'>(initialTab);
  const [gameFeedPosts, setGameFeedPosts] = useState<any[]>([]);
  const [gameFeedLoading, setGameFeedLoading] = useState(false);
  const [posts, setPosts] = useState<CustomPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bggSearchQuery, setBggSearchQuery] = useState('');
  const [bggSearchResults, setBggSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [newComment, setNewComment] = useState('');
  const [editingPost, setEditingPost] = useState<CustomPost | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [allRegisteredGames, setAllRegisteredGames] = useState<BoardGame[]>([]);
  const [searchQuery, setSearchQuery] = useState(''); // 통합 검색어
  const [ownedGamesFilter, setOwnedGamesFilter] = useState<string>('전체'); // 내 보유 게임 필터
  const [allGamesFilter, setAllGamesFilter] = useState<string>('전체');
  const [hotGames, setHotGames] = useState<BggHotGame[]>([]);
  const [hotLoading, setHotLoading] = useState(true);
  const [addingToWishlist, setAddingToWishlist] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUpdateSuccess, setImageUpdateSuccess] = useState(false);
  const [imageUpdateMessage, setImageUpdateMessage] = useState('');
  const [trendingGames, setTrendingGames] = useState<{ id: string; name: string; imageUrl: string; count: number }[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [activeRankTab, setActiveRankTab] = useState<'bgg' | 'trending'>('bgg');
  const [trendingShowAll, setTrendingShowAll] = useState(false);

  // 게임 이미지 변경
  const handleImageChange = async (file: File) => {
    if (!selectedGame || !accessToken) return;
    setUploadingImage(true);
    setImageUpdateSuccess(false);
    try {
      // 1. 이미지 업로드
      const fd = new FormData(); fd.append('file', file);
      const uploadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd }
      );
      if (!uploadRes.ok) throw new Error('이미지 업로드 실패');
      const { imageUrl } = await uploadRes.json();

      // BGG 검색으로 찾은 게임은 bggId가 id에 있을 수 있음
      const bggId = selectedGame.bggId || selectedGame.id;
      const gameId = selectedGame.bggId ? selectedGame.id : '';

      // 2. 이미지 변경 요청 (관리자: 즉시 / 일반: 검수 대기)
      const updateRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/update-image`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ gameId, bggId, koreanName: selectedGame.koreanName || selectedGame.englishName, newImageUrl: imageUrl }) }
      );
      if (!updateRes.ok) throw new Error('이미지 업데이트 실패');
      const updateData = await updateRes.json();

      // 3. 로컬 상태 즉시 반영 (페이지 이동 전까지 보임)
      setSelectedGame(prev => prev ? { ...prev, imageUrl } : prev);
      setImageUpdateSuccess(true);
      if (updateData.status === 'pending') {
        setImageUpdateMessage('검수 후 반영돼요 ✅');
      } else {
        setImageUpdateMessage('변경 완료!');
      }
      setTimeout(() => { setImageUpdateSuccess(false); setImageUpdateMessage(''); }, 4000);
    } catch (e: any) {
      alert(e.message || '이미지 변경 실패');
    }
    setUploadingImage(false);
  };

  // 보드라움 트렌딩 로드
  useEffect(() => {
    const loadTrending = async () => {
      setTrendingLoading(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/trending-games`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (res.ok) {
          const raw: any[] = await res.json();
          setTrendingGames(raw);
        }
      } catch {}
      setTrendingLoading(false);
    };
    loadTrending();
  }, []);

  // BGG Hot Games 로드
  useEffect(() => {
    const loadHotGames = async () => {
      setHotLoading(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-hot`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setHotGames(data || []);
        }
      } catch (e) {
        console.error('Hot games load error:', e);
      }
      setHotLoading(false);
    };
    loadHotGames();
  }, []);

  // Check if user is admin
  useEffect(() => {
    if (userEmail === 'sityplanner2@naver.com') {
      setIsAdmin(true);
    }
  }, [userEmail]);

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setCurrentUserId(session.user.id);
      }
    };
    getUserId();
  }, []);

  // Load all registered games from all users
  useEffect(() => {
    loadAllRegisteredGames();
  }, []);

  // Debug: Monitor allRegisteredGames state changes
  useEffect(() => {
    console.log('🔄 [State Update] allRegisteredGames changed:', allRegisteredGames.length, 'games');
    if (allRegisteredGames.length > 0) {
      console.log('📊 [State Update] First 3 games:', allRegisteredGames.slice(0, 3).map(g => ({
        id: g.id,
        korean: g.koreanName,
        english: g.englishName
      })));
    }
  }, [allRegisteredGames]);

  const loadAllRegisteredGames = async () => {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎲 [Client] Loading all registered games...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Get current user's session
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      console.log('👤 [Client] Current user ID:', currentUserId);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/all-games`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      console.log('📡 [Client] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        
        console.log('✅ [Client] Response received!');
        console.log('   - games length:', data.games?.length || 0);
        console.log('   - count:', data.count);
        console.log('   - processedKeys:', data.processedKeys);
        console.log('   - totalKeys:', data.totalKeys);
        
        if (data.games && data.games.length > 0) {
          // 🔥 중복 제거 및 정보 병합: 현재 사용자 우선
          const uniqueGames = deduplicateAndMergeGames(
            data.games as GameWithUserId[],
            currentUserId
          );
          
          setAllRegisteredGames(uniqueGames);
        } else {
          console.warn('⚠️ [Client] No games in response!');
          if (data.error) {
            console.error('Server error:', data.error);
          }
          setAllRegisteredGames([]);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else {
        const errorText = await response.text();
        console.error('❌ [Client] Failed:', response.status);
        console.error('Error:', errorText);
        setAllRegisteredGames([]);
      }
    } catch (error) {
      console.error('❌ [Client] Error loading games:', error);
      setAllRegisteredGames([]);
    }
  };

  // Load posts when game changes
  useEffect(() => {
    if (selectedGame) {
      loadPosts();
      if (isFirstMount.current) {
        // 최초 마운트: initialTab이 'feed'면 게임피드 자동 로드
        isFirstMount.current = false;
        if (initialTab === 'feed') {
          loadGameFeedPosts();
        }
      } else {
        // 게임 전환 시: 피드 초기화 + info 탭으로 리셋
        setGameFeedPosts([]);
        setMainTab('info');
      }
    }
  }, [selectedGame?.id]);

  // BGG ID가 비동기적으로 resolve된 후 위키 콘텐츠 + 게임피드 재로드
  // (BGG 이름 검색으로 bggId가 채워졌지만 id는 그대로인 경우)
  const prevBggIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const newBggId = selectedGame?.bggId;
    if (newBggId && newBggId !== prevBggIdRef.current && !isFirstMount.current) {
      prevBggIdRef.current = newBggId;
      // wiki key가 바뀌었으므로 위키 콘텐츠도 재로드
      loadPosts();
      // 피드 탭에 있고 아직 로드 안 된 경우에만 재시도
      if (mainTab === 'feed' && gameFeedPosts.length === 0 && !gameFeedLoading) {
        loadGameFeedPosts();
      }
    }
  }, [selectedGame?.bggId]);

  const loadGameFeedPosts = async () => {
    if (!selectedGame) return;
    setGameFeedLoading(true);
    try {
      // 가능한 모든 ID를 수집 후 병렬 조회 → 결과 합산
      // deduplication으로 id가 바뀔 수 있으므로 여러 ID를 모두 시도
      const normalize = (id: string) => id.replace(/^bgg_/, '').trim();

      // BGG ID 여부 판별: 숫자만으로 구성 & 10자리 미만
      // (custom_${Date.now()} 같은 13자리 타임스탬프 ID는 서버에 없으므로 제외)
      const isBggId = (id: string) => /^\d+$/.test(id) && id.length <= 9;

      const idsToTry = new Set<string>();      // BGG 숫자 ID — bgg_ 접두사 변형도 추가됨
      const rawIdsToTry = new Set<string>(); // UUID 등 비-BGG ID — 정확히 일치만

      const addId = (id: string) => {
        const n = normalize(id);
        if (!n) return;
        if (isBggId(n)) idsToTry.add(n);
        else rawIdsToTry.add(n); // UUID, custom_* 등 비-BGG ID
      };

      if (selectedGame.bggId) addId(selectedGame.bggId);
      if (selectedGame.id) addId(selectedGame.id);

      // ownedGames / allRegisteredGames에서 같은 게임 이름 찾아 원본 id 추가
      const sKorean = (selectedGame.koreanName || '').toLowerCase().trim();
      const sEnglish = (selectedGame.englishName || '').toLowerCase().trim();
      [...ownedGames, ...allRegisteredGames].forEach(g => {
        const gKorean = (g.koreanName || '').toLowerCase().trim();
        const gEnglish = (g.englishName || '').toLowerCase().trim();
        const nameMatch =
          (sKorean && gKorean && gKorean === sKorean) ||
          (sEnglish && gEnglish && gEnglish === sEnglish);
        const bggMatch =
          selectedGame.bggId && g.bggId &&
          normalize(g.bggId) === normalize(selectedGame.bggId);
        if (nameMatch || bggMatch) {
          if (g.bggId) addId(g.bggId);
          if (g.id)    addId(g.id);
        }
      });

      // BGG ID는 bgg_ 접두사 변형도 추가, 비-BGG ID는 원본만
      const withPrefixes = new Set<string>();
      idsToTry.forEach(id => {
        withPrefixes.add(id);
        withPrefixes.add(`bgg_${id}`);
      });
      rawIdsToTry.forEach(id => withPrefixes.add(id));

      const validIds = [...withPrefixes].filter(id => id.length > 0 && id !== 'bgg_');
      if (validIds.length === 0) { setGameFeedLoading(false); return; }

      console.log('[GameFeed] querying IDs:', validIds);

      const authHeader = accessToken || publicAnonKey;
      const results = await Promise.all(
        validIds.map(id =>
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/by-game/${id}`,
            { headers: { Authorization: `Bearer ${authHeader}` } }
          )
            .then(r => {
              if (!r.ok) { console.warn('[GameFeed] status', r.status, 'for id:', id); return { posts: [] }; }
              return r.json();
            })
            .catch(e => { console.error('[GameFeed] error for id:', id, e); return { posts: [] }; })
        )
      );

      // 합산 + 중복 제거 + 최신순 정렬
      const postMap = new Map<string, any>();
      results.flatMap(r => r.posts || []).forEach(p => { if (p.id) postMap.set(p.id, p); });
      const merged = [...postMap.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      console.log(`[GameFeed] ${merged.length} posts found for "${selectedGame.koreanName || selectedGame.englishName}"`);
      setGameFeedPosts(merged);
    } catch (e) {
      console.error('[GameFeed] loadGameFeedPosts error:', e);
    }
    setGameFeedLoading(false);
  };

  const loadPosts = async () => {
    if (!selectedGame) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${getWikiGameId(selectedGame)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
      toast.error('게시물을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // Load posts for a specific category without changing selected category
  const loadPostsForCategory = async (categoryId: string): Promise<CustomPost[]> => {
    if (!selectedGame) return [];

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${getWikiGameId(selectedGame)}?category=${categoryId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.posts || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to load posts for category:', error);
      return [];
    }
  };

  const searchBGG = async () => {
    if (!bggSearchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ query: bggSearchQuery }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setBggSearchResults(data);
      }
    } catch (error) {
      console.error('BGG search error:', error);
      toast.error('검색 중 오류가 발생했습니다');
    } finally {
      setIsSearching(false);
    }
  };

  const selectGameFromBGG = async (game: any) => {
    // 일단 기본 정보로 먼저 표시
    const customGame: BoardGame = {
      id: game.id,
      imageUrl: game.thumbnail ? (game.thumbnail.startsWith('//') ? 'https:' + game.thumbnail : game.thumbnail) : '',
      koreanName: game.koreanName || '',
      englishName: game.name,
      bggId: game.id,
      recommendedPlayers: '',
      playTime: '',
      difficulty: '',
      videoUrl: '',
    };
    setSelectedGame(customGame);
    setBggSearchResults([]);
    setBggSearchQuery('');

    // 승인된 이미지 오버라이드 확인 + BGG 상세 정보 로드
    try {
      const [overrideRes, detailRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/image-override?bggId=${game.id}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
            body: JSON.stringify({ id: game.id }) }),
      ]);
      const override = overrideRes.ok ? await overrideRes.json() : null;
      const detail = detailRes.ok ? await detailRes.json() : null;
      setSelectedGame(prev => prev ? {
        ...prev,
        imageUrl: override?.imageUrl || detail?.imageUrl || prev.imageUrl,
        recommendedPlayers: detail?.minPlayers && detail?.maxPlayers ? `${detail.minPlayers}-${detail.maxPlayers}명` : '',
        playTime: detail?.maxPlayTime ? `${detail.maxPlayTime}분` : '',
      } : prev);
    } catch {}
  };

  const handleLike = async (postId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/like`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPosts(posts.map(p => p.id === postId ? { ...p, likes: data.likes } : p));
        toast.success(data.isLiked ? '좋아요!' : '좋아요 취소');
      }
    } catch (error) {
      console.error('Like error:', error);
      toast.error('좋아요 처리 중 오류가 발생했습니다');
    }
  };

  const loadComments = async (postId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/comments`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setComments({ ...comments, [postId]: data.comments || [] });
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const addComment = async (postId: string) => {
    if (!newComment.trim()) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ content: newComment }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setComments({
          ...comments,
          [postId]: [...(comments[postId] || []), data.comment],
        });
        setNewComment('');
        toast.success('댓글이 추가되었습니다');
      }
    } catch (error) {
      console.error('Add comment error:', error);
      toast.error('댓글 추가 중 오류가 발생했습니다');
    }
  };

  const handleApprove = async (postId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: 'approved' }),
        }
      );

      if (response.ok) {
        toast.success('게시물이 승인되었습니다');
        loadPosts();
      }
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('승인 처리 중 오류가 발생했습니다');
    }
  };

  const handleReject = async (postId: string) => {
    const reason = prompt('반려 사유를 입력해주세요:');
    if (!reason) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: 'rejected', rejectionReason: reason }),
        }
      );

      if (response.ok) {
        toast.success('게시물이 반려되었습니다');
        loadPosts();
      }
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('반려 처리 중 오류가 발생했습니다');
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('정말 이 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        toast.success('정보가 삭제되었습니다');
        loadPosts();
      } else {
        const errorData = await response.json();
        toast.error(`삭제 실패: ${errorData.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('삭제 처리 중 오류가 발생했습니다');
    }
  };

  const toggleComments = (postId: string) => {
    if (showComments === postId) {
      setShowComments(null);
    } else {
      setShowComments(postId);
      if (!comments[postId]) {
        loadComments(postId);
      }
    }
  };

  const handleEdit = (post: CustomPost) => {
    setEditingPost(post);
    setShowAddForm(true);
  };

  const handleUpdatePost = async (formData: any) => {
    if (!editingPost) return;

    try {
      console.log('✏️ [Update] Starting post update...');
      console.log('Form data:', formData);
      console.log('Editing post ID:', editingPost.id);
      
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${editingPost.id}`;
      console.log('📡 [Update] Request URL:', url);
      console.log('📦 [Update] Request payload:', JSON.stringify(formData, null, 2));
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ...formData, status: 'approved' }),
      });

      console.log('← [Update] Response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Update] Success:', data);
        toast.success('수정이 완료되었습니다!');
        setShowAddForm(false);
        setEditingPost(null);
        loadPosts();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [Update] Failed:', errorData);
        
        if (response.status === 401) {
          toast.error('로그인이 필요합니다. 다시 로그인해주세요.');
        } else if (response.status === 403) {
          toast.error(`권한 없음: ${errorData.error || '수정할 권한이 없습니다'}`);
        } else {
          toast.error(`수정에 실패했습니다 (${response.status}): ${errorData.error || '알 수 없는 오류'}`);
        }
      }
    } catch (error) {
      console.error('❌ [Update] Network/Exception error:', error);
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      toast.error(`수정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  const handleFormSubmit = async (formData: any) => {
    // 수정 모드인 경우
    if (editingPost) {
      await handleUpdatePost(formData);
      return;
    }

    // 새 게시물 등록
    if (!selectedGame) return;

    try {
      console.log('📝 [Submit] Starting post creation...');
      console.log('Form data:', formData);
      
      const payload = {
        gameId: getWikiGameId(selectedGame),
        gameName: selectedGame.koreanName || selectedGame.englishName,
        category: selectedCategory,
        title: formData.title || `${CATEGORIES.find(c => c.id === selectedCategory)?.name} 정보`,
        postType: 'info',
        ...formData,
        status: 'approved',
      };
      
      console.log('📦 [Submit] Payload:', payload);
      console.log('📊 [Submit] Status field:', payload.status);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        }
      );

      console.log('← [Submit] Response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Submit] Success:', data);
        toast.success('등록이 완료되었습니다!');
        setShowAddForm(false);
        loadPosts();
      } else {
        const errorData = await response.json();
        console.error('❌ [Submit] Failed:', errorData);
        console.error('Status:', response.status);
        console.error('Error details:', errorData);
        
        if (response.status === 401) {
          toast.error('로그인이 필요합니다. 다시 로그인해주세요.');
        } else if (response.status === 403) {
          toast.error(`권 없음: ${errorData.error || '등록할 권한이 없습니다'}`);
        } else {
          toast.error(`등록에 실패했습니다 (${response.status}): ${errorData.error || '알 수 없는 오류'}`);
        }
      }
    } catch (error) {
      console.error('❌ [Submit] Network/Exception error:', error);
      console.error('Error details:', error instanceof Error ? error.message : error);
      toast.error('등록 중 오류가 발생했습니다');
    }
  };

  const renderPost = (post: CustomPost) => {
    if (post.postType === 'info' && post.category === 'sleeve' && post.data?.cards) {
      // 슬리브 정보 표시
      return (
        <div key={post.id} className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                슬리브 정보
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                작성자: {(post as any).created_by_name || post.created_by_email?.split('@')[0] || ''}
              </p>
              {post.status === 'pending' && isAdmin && (
                <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                  승인 대기
                </span>
              )}
            </div>
            {isAdmin && post.status === 'pending' && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleApprove(post.id)} className="text-green-600">
                  승인
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleReject(post.id)} className="text-red-600">
                  반려
                </Button>
              </div>
            )}
            {isAdmin && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDelete(post.id)} 
                className="text-red-600 hover:bg-red-50 ml-2"
              >
                삭제
              </Button>
            )}
          </div>

          {/* 카드 사이즈 시각화 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {post.data.cards.map((card: any, idx: number) => {
              const maxDimension = Math.max(card.width, card.height);
              const scaleFactor = 150 / maxDimension;
              const scaledWidth = card.width * scaleFactor;
              const scaledHeight = card.height * scaleFactor;

              return (
                <div key={idx} className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                  <div
                    className="bg-white border-2 border-gray-400 rounded flex items-center justify-center shadow-sm mb-2"
                    style={{
                      width: `${scaledWidth}px`,
                      height: `${scaledHeight}px`,
                    }}
                  >
                    <div className="text-center text-xs text-gray-600">
                      <div className="font-medium">{card.width} × {card.height}mm</div>
                      <div className="text-gray-500 mt-1">{card.quantity}장</div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{card.name}</div>
                </div>
              );
            })}
          </div>

          {post.data.recommendedProduct && (
            <p className="text-sm text-gray-700 mb-2">
              <span className="font-medium">추천 제품:</span> {post.data.recommendedProduct}
            </p>
          )}

          {post.data.purchaseLinks && post.data.purchaseLinks.length > 0 && (
            <div className="space-y-1 mb-2">
              <p className="text-sm font-medium text-gray-700">구매 링크:</p>
              {post.data.purchaseLinks.map((link: any, idx: number) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm block ml-2"
                >
                  🔗 {link.name || `링크 ${idx + 1}`}
                </a>
              ))}
            </div>
          )}
          
          {/* 하위 호환성: 기존 단일 purchaseLink */}
          {post.data.purchaseLink && !post.data.purchaseLinks && (
            <a
              href={post.data.purchaseLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              🔗 구매 링크
            </a>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center gap-4 pt-4 border-t border-gray-200">
            {post.created_by === currentUserId && (
              <button
                onClick={() => handleEdit(post)}
                className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
              >
                <Edit className="w-4 h-4" />
                <span className="text-sm">수정</span>
              </button>
            )}
            <button
              onClick={() => handleLike(post.id)}
              className="flex items-center gap-1 text-gray-600 hover:text-red-600 transition-colors"
            >
              <Heart className="w-4 h-4" />
              <span className="text-sm">{post.likes || 0}</span>
            </button>
            <button
              onClick={() => toggleComments(post.id)}
              className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm">{comments[post.id]?.length || 0}</span>
            </button>
          </div>

          {/* Comments Section */}
          {showComments === post.id && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="space-y-3">
                {comments[post.id]?.map(comment => (
                  <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-900">{comment.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {comment.created_by_email} · {new Date(comment.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="댓글을 입력하세요"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addComment(post.id)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button size="sm" onClick={() => addComment(post.id)}>
                  작성
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 기타 정보형 게시물 또는 일반 게시물
    return (
      <div key={post.id} className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{post.title}</h3>
              {post.postType === 'info' && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">정보</span>
              )}
              {/* 별점 표시 (리뷰 카테고리) */}
              {post.category === 'review' && post.data?.rating && (
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-4 h-4 ${
                        idx < post.data.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="text-sm font-semibold text-gray-700 ml-1">
                    {post.data.rating}.0
                  </span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              작성자: {(post as any).created_by_name || post.created_by_email?.split('@')[0] || ''}
            </p>
            {post.status === 'pending' && isAdmin && (
              <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                승인 대기
              </span>
            )}
          </div>
          {isAdmin && post.status === 'pending' && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleApprove(post.id)} className="text-green-600">
                승인
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleReject(post.id)} className="text-red-600">
                반려
              </Button>
            </div>
          )}
          {isAdmin && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDelete(post.id)} 
              className="text-red-600 hover:bg-red-50 ml-2"
            >
              삭제
            </Button>
          )}
        </div>

        {post.description && !(post.postType === 'info' && post.category === 'overview') && (
          <p className="text-gray-700 mb-4 whitespace-pre-wrap">{post.description}</p>
        )}

        {/* 게임 설명(Overview) 정보형 게시물 구조화 표시 */}
        {post.postType === 'info' && post.category === 'overview' && post.data && (() => {
          const d = post.data.data || post.data;
          return (
          <div className="mb-4 space-y-4">
            {d.description && (
              <p className="text-sm text-gray-700 leading-relaxed">{d.description}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {d.playerCount && <span>👥 {d.playerCount}{d.bestPlayers ? ` (베스트:${d.bestPlayers})` : ''}</span>}
              {d.playTime && <span>⏱ {d.playTime}</span>}
              {d.recommendedAge && <span>🔞 {d.recommendedAge}</span>}
            </div>
            {(d.bggScore || d.difficulty || d.bggRank) && (
              <div className="flex flex-wrap gap-3 text-sm">
                {d.bggScore && <span className="flex items-center gap-1">⭐ <span className="font-bold text-gray-900">{d.bggScore}</span><span className="text-gray-400">/10</span></span>}
                {d.difficulty && <span className="text-gray-600">난이도 <span className="font-semibold text-gray-900">{d.difficulty}</span></span>}
                {d.bggRank && <span className="text-gray-600">전체 <span className="font-semibold text-gray-900">{d.bggRank}</span></span>}
              </div>
            )}
            {(d.designer || d.artist || d.publisher) && (
              <div className="grid grid-cols-1 gap-1 text-sm border-t pt-3">
                {d.designer && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">디자이너</span><span className="text-gray-900">{d.designer}</span></div>}
                {d.artist && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">아트웍</span><span className="text-gray-900">{d.artist}</span></div>}
                {d.publisher && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">출판사</span><span className="text-gray-900">{d.publisher}</span></div>}
              </div>
            )}
            {d.expansions?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">확장팩</p>
                <div className="flex flex-wrap gap-2">
                  {d.expansions.map((g: any) => (
                    <div key={g.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1">
                      {g.imageUrl && <img src={g.imageUrl} className="w-4 h-4 rounded object-cover" />}
                      <span className="text-xs text-gray-700">{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {d.relatedGames?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">작가의 다른 작품</p>
                <div className="flex flex-wrap gap-2">
                  {d.relatedGames.map((g: any) => (
                    <div key={g.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1">
                      {g.imageUrl && <img src={g.imageUrl} className="w-4 h-4 rounded object-cover" />}
                      <span className="text-xs text-gray-700">{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {d.images?.length > 0 && (
              <div className="grid grid-cols-3 gap-2 border-t pt-3">
                {d.images.map((img: string, idx: number) => (
                  <img key={idx} src={img} className="w-full h-24 object-cover rounded-xl" />
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* 게임 구성품 정보 표시 */}
        {post.postType === 'info' && post.category === 'components' && post.data?.components && post.data.components.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {post.data.components.map((component: any, idx: number) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start gap-4">
                    {component.image && (
                      <div className="flex-shrink-0">
                        <img
                          src={component.image}
                          alt={component.type}
                          className="w-24 h-24 object-cover rounded-lg border-2 border-gray-300"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{component.type}</h4>
                      <p className="text-sm text-gray-600">수량: {component.quantity}개</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 정보형 게시물 데이터 표시 (기타 카테고리) */}
        {post.postType === 'info' && post.category !== 'overview' && post.category !== 'components' && post.data && (
          <div className="mb-4 space-y-2 text-sm">
            {post.data.productName && (
              <p><span className="font-medium">제품명:</span> {post.data.productName}</p>
            )}
            {post.data.brand && (
              <p><span className="font-medium">브랜드:</span> {post.data.brand}</p>
            )}
            {post.data.componentType && (
              <p><span className="font-medium">컴포 종류:</span> {post.data.componentType}</p>
            )}
            {post.data.purchaseLinks && post.data.purchaseLinks.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">구매 링크:</p>
                {post.data.purchaseLinks.map((link: any, idx: number) => (
                  <a 
                    key={idx}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:underline block ml-2"
                  >
                    🔗 {link.name || `링크 ${idx + 1}`}
                  </a>
                ))}
              </div>
            )}
            {/* 하위 호환성: 기존 단일 purchaseLink */}
            {post.data.purchaseLink && !post.data.purchaseLinks && (
              <a href={post.data.purchaseLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block">
                🔗 구매 링크
              </a>
            )}
            {post.data.printFileLink && (
              <a href={post.data.printFileLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block">
                📄 3D프린트 파일
              </a>
            )}
          </div>
        )}

        {/* 플레이/규칙 영상 표시 */}
        {post.postType === 'info' && post.category === 'video' && post.data?.videos && post.data.videos.length > 0 && (
          <div className="mb-4 space-y-4">
            {post.data.videos.map((video: any, idx: number) => {
              // 유튜브 URL에서 비디오 ID 추출
              const getYoutubeVideoId = (url: string) => {
                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                const match = url.match(regExp);
                return (match && match[2].length === 11) ? match[2] : null;
              };
              
              const videoId = getYoutubeVideoId(video.youtubeUrl);
              
              return (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="mb-3">
                    <h4 className="font-semibold text-gray-900 mb-1">{video.title}</h4>
                    <a 
                      href={video.youtubeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      🔗 유튜브에서 보기
                    </a>
                  </div>
                  {videoId && (
                    <div className="aspect-video">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title={video.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="rounded-lg"
                      ></iframe>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 태그 표시 (갤러리) */}
        {post.data?.tags && post.data.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {post.data.tags.map((tag: string, idx: number) => (
              <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Images */}
        {((post.images && post.images.length > 0) || (post.data?.images && post.data.images.length > 0)) && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
            {(post.images || post.data?.images || []).map((img: string, idx: number) => (
              <img
                key={idx}
                src={img}
                alt={`${post.title} ${idx + 1}`}
                className="w-full h-40 object-cover rounded-lg"
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-4 pt-4 border-t border-gray-200">
          {post.created_by === currentUserId && (
            <button
              onClick={() => handleEdit(post)}
              className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span className="text-sm">수정</span>
            </button>
          )}
          <button
            onClick={() => handleLike(post.id)}
            className="flex items-center gap-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Heart className="w-4 h-4" />
            <span className="text-sm">{post.likes || 0}</span>
          </button>
          <button
            onClick={() => toggleComments(post.id)}
            className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-sm">{comments[post.id]?.length || 0}</span>
          </button>
        </div>

        {/* Comments Section */}
        {showComments === post.id && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-3">
              {comments[post.id]?.map(comment => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-900">{comment.content}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {comment.created_by_email} · {new Date(comment.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="댓글을 입력하세요"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addComment(post.id)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button size="sm" onClick={() => addComment(post.id)}>
                작성
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const currentCategory = CATEGORIES.find(c => c.id === selectedCategory);
  const infoPosts = posts.filter(p => p.postType === 'info');
  const regularPosts = posts.filter(p => p.postType === 'post');

  // 한글 초성 추출 함수
  const getKoreanInitial = (char: string): string => {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      // 한글 유니코드 범위
      const initial = Math.floor((code - 0xAC00) / 588);
      const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
      return initials[initial];
    }
    return char;
  };

  // 게임 정렬 함수 (오름차순: ㄱ→ㅎ, A→Z, 0→9)
  const sortGames = (games: BoardGame[]) => {
    return [...games].sort((a, b) => {
      const nameA = (a.koreanName || a.englishName || '').trim();
      const nameB = (b.koreanName || b.englishName || '').trim();
      
      if (!nameA) return 1;
      if (!nameB) return -1;
      
      const firstCharA = nameA.charAt(0);
      const firstCharB = nameB.charAt(0);
      
      // 한글 여부 확인
      const isKoreanA = /[가-힣]/.test(firstCharA);
      const isKoreanB = /[가-힣]/.test(firstCharB);
      
      // 영문 여부 확인
      const isEnglishA = /[a-zA-Z]/.test(firstCharA);
      const isEnglishB = /[a-zA-Z]/.test(firstCharB);
      
      // 숫자 여부 확인
      const isNumberA = /[0-9]/.test(firstCharA);
      const isNumberB = /[0-9]/.test(firstCharB);
      
      // 1순위: 한글 > 영문 > 숫자 > 기타
      if (isKoreanA && !isKoreanB) return -1;
      if (!isKoreanA && isKoreanB) return 1;
      
      if (isKoreanA && isKoreanB) {
        // 한글끼리 비교: 오름차순 (ㄱ→ㅎ)
        return nameA.localeCompare(nameB, 'ko');
      }
      
      if (isEnglishA && !isEnglishB && !isKoreanB) return -1;
      if (!isEnglishA && isEnglishB && !isKoreanA) return 1;
      
      if (isEnglishA && isEnglishB) {
        // 영문끼리 비교: 오름차순 (A→Z)
        return nameA.toLowerCase().localeCompare(nameB.toLowerCase(), 'en');
      }
      
      if (isNumberA && !isNumberB && !isKoreanB && !isEnglishB) return -1;
      if (!isNumberA && isNumberB && !isKoreanA && !isEnglishA) return 1;
      
      if (isNumberA && isNumberB) {
        // 숫자끼리 비교: 오름차순 (0→9)
        const numA = parseInt(nameA);
        const numB = parseInt(nameB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
      }
      
      // 기본 문자열 비교: 오름차순
      return nameA.localeCompare(nameB);
    });
  };

  // 통합 검색: BGG, 보유 게임, 모든 등록 게임
  const filteredOwnedGames = searchQuery
    ? ownedGames.filter(game => 
        game.koreanName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.englishName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : ownedGames;

  const filteredAllGames = searchQuery
    ? allRegisteredGames.filter(game => 
        game.koreanName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.englishName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game as any).name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allRegisteredGames;

  // 정렬 후 필터링
  const sortedOwnedGames = sortGames(filteredOwnedGames);
  const sortedAllGames = sortGames(filteredAllGames);

  // 초성/알파벳 필터 적용
  const applyCharacterFilter = (games: BoardGame[], filter: string) => {
    if (filter === '전체') return games;
    
    return games.filter(game => {
      const name = (game.koreanName || game.englishName || '').trim();
      if (!name) return false;
      
      const firstChar = name.charAt(0);
      
      // 한글 초성 필터
      if (['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].includes(filter)) {
        const initial = getKoreanInitial(firstChar);
        return initial === filter;
      }
      
      // 영문 알파벳 필터
      if (filter === 'A-E') return /^[a-eA-E]/.test(firstChar);
      if (filter === 'F-J') return /^[f-jF-J]/.test(firstChar);
      if (filter === 'K-O') return /^[k-oK-O]/.test(firstChar);
      if (filter === 'P-T') return /^[p-tP-T]/.test(firstChar);
      if (filter === 'U-Z') return /^[u-zU-Z]/.test(firstChar);
      
      // 숫자 필터
      if (filter === '0-9') return /^[0-9]/.test(firstChar);
      
      return true;
    });
  };

  const displayOwnedGames = applyCharacterFilter(sortedOwnedGames, ownedGamesFilter);
  const displayAllGames = applyCharacterFilter(sortedAllGames, allGamesFilter);

  const filteredBGGResults = searchQuery
    ? bggSearchResults.filter(game => 
        game.source !== 'site' && game.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : bggSearchResults.filter(game => game.source !== 'site');

  const filteredSiteSearchResults = bggSearchResults.filter(game => game.source === 'site');

  // 필터 버튼 목록
  const koreanFilters = ['전체', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const englishFilters = ['A-E', 'F-J', 'K-O', 'P-T', 'U-Z'];
  const numberFilter = ['0-9'];

  const renderInfoTab = () => {
    // 리뷰(postType:'post') + 정보(postType:'info') 모두 포함
    const reviewPosts = posts.filter(p => p.category === 'review');
    const ratedPosts = reviewPosts.filter(p => p.data?.rating !== undefined);
    const avgRating = ratedPosts.length > 0
      ? ratedPosts.reduce((s, p) => s + Number(p.data.rating), 0) / ratedPosts.length
      : null;

    return (
      <div className="space-y-2">
        {/* 종합 평점 요약 (리뷰가 있을 때만) */}
        {avgRating !== null && (
          <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-gray-900">{avgRating.toFixed(1)}</div>
              <div className="text-xs text-gray-400 mt-0.5">/10</div>
            </div>
            <div className="flex-1">
              <div className="flex gap-0.5 mb-1">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <div key={n} className={`h-2 flex-1 rounded-full ${n <= Math.round(avgRating) ? 'bg-yellow-400' : 'bg-gray-200'}`} />
                ))}
              </div>
              <p className="text-xs text-gray-400">{ratedPosts.length}명의 평균 별점 ★</p>
            </div>
          </div>
        )}

        {CATEGORIES.map(category => {
          const IconComponent = category.icon === 'FileText' ? FileText :
                                category.icon === 'Package' ? Package :
                                category.icon === 'Boxes' ? Boxes :
                                category.icon === 'Video' ? Video :
                                category.icon === 'Users' ? Users : FileText;
          // postType 구분 없이 해당 카테고리 전체 포스트 표시 (리뷰도 포함)
          const categoryPosts = posts.filter(p => p.category === category.id);

          return (
            <div key={category.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 섹션 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <IconComponent className="w-4 h-4 text-cyan-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">{category.name}</h3>
                  {categoryPosts.length > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{categoryPosts.length}</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory(category.id);
                    const existingInfoPost = infoPosts.find(p => p.postType === 'info' && p.category === category.id);
                    if (existingInfoPost) {
                      const confirmEdit = window.confirm('이미 등록된 정보가 있어요.\n수정하시겠습니까?');
                      if (confirmEdit) handleEdit(existingInfoPost);
                    } else {
                      setShowAddForm(true);
                    }
                  }}
                  className="h-7 px-3 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {category.id === 'review' ? '리뷰' : '추가'}
                </button>
              </div>

              {/* 로딩 */}
              {isLoading && (
                <div className="flex justify-center py-5">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* 빈 상태 */}
              {!isLoading && categoryPosts.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-xs">
                  아직 등록된 정보가 없어요
                </div>
              )}

              {/* 포스트 목록 */}
              {!isLoading && categoryPosts.length > 0 && (
                <div className="p-3 space-y-3">
                  {categoryPosts.map(post => renderPost(post))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-3">
        <h1 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2"><img src="data:image/webp;base64,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" className="w-7 h-7 object-contain" /> 보드위키</h1>

        {/* Game Selection */}
        {!selectedGame ? (
          <div className="space-y-3">

            {/* ── 검색창 ── */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="보드게임 이름으로 검색..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setBggSearchQuery(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') searchBGG(); }}
                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-colors"
                  />
                </div>
                <button
                  onClick={() => { setBggSearchQuery(searchQuery); searchBGG(); }}
                  disabled={isSearching}
                  className="h-10 px-4 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 disabled:opacity-50"
                >
                  {isSearching ? '검색 중...' : '검색'}
                </button>
              </div>
            </div>

            {/* ── 검색 결과 ── */}
            {filteredBGGResults.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 pt-4 pb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">BGG 검색 결과</p>
                </div>
                {filteredBGGResults.map(game => (
                  <button key={game.id} onClick={() => selectGameFromBGG(game)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-50 text-left">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{game.name}</p>
                      {game.yearPublished && <p className="text-xs text-gray-400">{game.yearPublished}년</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* ── 보드라움 등록 게임 검색 (allRegisteredGames 로컬 필터 — AddGameDialog와 동일) ── */}
            {searchQuery && filteredAllGames.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 pt-4 pb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">보드라움 등록 게임</p>
                </div>
                {filteredAllGames.map(game => (
                  <button key={game.id} onClick={() => {
                    setSelectedGame({ ...game, bggId: game.bggId || game.id });
                    setBggSearchQuery('');
                  }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-50 text-left">
                    {game.imageUrl
                      ? <img src={game.imageUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{game.koreanName || game.englishName}</p>
                      {game.koreanName && game.englishName && <p className="text-xs text-gray-400 truncate">{game.englishName}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : null}

            {/* ── BGG 추천 작품 & 보드라움 트렌딩 (검색 전 기본 화면) ── */}
            {!searchQuery && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* 탭 헤더 */}
                <div className="flex border-b border-gray-100">
                  <button onClick={() => setActiveRankTab('bgg')}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeRankTab === 'bgg' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                    🌐 BGG 추천 작품
                  </button>
                  <button onClick={() => setActiveRankTab('trending')}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeRankTab === 'trending' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                    🔥 보드라움 순위
                  </button>
                  {activeRankTab === 'trending' && (
                    <button onClick={async () => {
                      setTrendingLoading(true);
                      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/trending-games/cache`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${accessToken || ''}` },
                      }).catch(() => {});
                      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/trending-games`, {
                        headers: { Authorization: `Bearer ${accessToken || ''}` },
                      });
                      if (res.ok) setTrendingGames(await res.json());
                      setTrendingLoading(false);
                      setTrendingShowAll(false);
                      toast.success('순위를 새로 불러왔어요');
                    }}
                    className="px-3 py-3 text-gray-400 hover:text-gray-600 transition-colors text-sm">
                      🔄
                    </button>
                  )}
                </div>

                {/* BGG 탭 */}
                {activeRankTab === 'bgg' && hotLoading && (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                )}
                {activeRankTab === 'bgg' && !hotLoading && hotGames.length === 0 && (
                  <div className="text-center py-10 text-sm text-gray-400">순위를 불러오지 못했어요</div>
                )}
                {activeRankTab === 'bgg' && !hotLoading && hotGames.slice(0, 20).map(game => {
                  const alreadyInWishlist = wishlistGames.some(w => w.bggId === game.id);
                  const alreadyOwned = ownedGames.some(o => o.bggId === game.id);
                  return (
                    <div key={game.id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
                      <span className={`w-6 text-center text-xs font-bold shrink-0 ${game.rank <= 3 ? 'text-yellow-500' : 'text-gray-400'}`}>
                        {game.rank}
                      </span>
                      <button onClick={() => selectGameFromBGG({ id: game.id, name: game.name, yearPublished: game.yearPublished })}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        {game.thumbnail
                          ? <img src={game.thumbnail.startsWith('//') ? 'https:' + game.thumbnail : game.thumbnail} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{game.koreanName || game.name}</p>
                          {game.yearPublished && <p className="text-xs text-gray-400">{game.yearPublished}년</p>}
                        </div>
                      </button>
                      <button
                        disabled={alreadyOwned || alreadyInWishlist || addingToWishlist === game.id}
                        onClick={async () => {
                          if (!onAddToWishlist || alreadyOwned || alreadyInWishlist) return;
                          setAddingToWishlist(game.id);
                          const newGame: BoardGame = { id: `${Date.now()}`, bggId: game.id, koreanName: game.name, englishName: game.name, imageUrl: game.thumbnail ? (game.thumbnail.startsWith('//') ? 'https:' + game.thumbnail : game.thumbnail) : '', listType: '구매 예정', rating: 0, savedAt: Date.now(), createdAt: new Date().toISOString() } as any;
                          onAddToWishlist(newGame);
                          setAddingToWishlist(null);
                        }}
                        className={`shrink-0 h-8 px-3 rounded-xl text-xs font-bold transition-all ${alreadyOwned ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : alreadyInWishlist ? 'bg-cyan-50 text-cyan-500 border border-cyan-200 cursor-default' : 'bg-gray-900 hover:bg-gray-700 text-white'}`}
                      >
                        {alreadyOwned ? '보유중' : alreadyInWishlist ? '위시' : '+ 위시'}
                      </button>
                    </div>
                  );
                })}

                {/* 보드라움 순위 탭 */}
                {activeRankTab === 'trending' && trendingLoading && (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                )}
                {activeRankTab === 'trending' && !trendingLoading && trendingGames.length === 0 && (
                  <div className="text-center py-10 text-sm text-gray-400">아직 게임 태그가 없어요</div>
                )}
                {activeRankTab === 'trending' && !trendingLoading && (trendingShowAll ? trendingGames : trendingGames.slice(0, 20)).map((game, idx) => {
                  const alreadyInWishlist = wishlistGames.some(w => w.bggId === game.id || w.id === game.id);
                  const alreadyOwned = ownedGames.some(o => o.bggId === game.id || o.id === game.id);
                  return (
                    <div key={game.id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
                      <span className={`w-6 text-center text-xs font-bold shrink-0 ${idx < 3 ? 'text-yellow-500' : 'text-gray-400'}`}>
                        {idx + 1}
                      </span>
                      <button onClick={() => selectGameFromBGG({ id: game.id, name: game.name, yearPublished: '' })}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        {game.imageUrl
                          ? <img src={game.imageUrl} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-gray-100" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{game.name}</p>
                          <p className="text-xs text-gray-400">💬 {game.count}회 언급</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && (
                          <button
                            onClick={async () => {
                              if (!window.confirm(`"${game.name}"을 순위에서 제외할까요?`)) return;
                              await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/trending-blacklist`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                                body: JSON.stringify({ gameId: game.id, action: 'add' }),
                              });
                              setTrendingGames(prev => prev.filter(g => g.id !== game.id));
                              toast.success('순위에서 제외했어요');
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 text-xs">
                            ✕
                          </button>
                        )}
                        <button
                          disabled={alreadyOwned || alreadyInWishlist}
                          onClick={() => {
                            if (!onAddToWishlist || alreadyOwned || alreadyInWishlist) return;
                            const newGame: any = { id: `${Date.now()}`, bggId: game.id, koreanName: game.name, englishName: game.name, imageUrl: game.imageUrl, listType: '구매 예정', rating: 0, savedAt: Date.now(), createdAt: new Date().toISOString() };
                            onAddToWishlist(newGame);
                          }}
                          className={`h-8 px-3 rounded-xl text-xs font-bold transition-all ${alreadyOwned ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : alreadyInWishlist ? 'bg-cyan-50 text-cyan-500 border border-cyan-200 cursor-default' : 'bg-gray-900 hover:bg-gray-700 text-white'}`}>
                          {alreadyOwned ? '보유중' : alreadyInWishlist ? '위시' : '+ 위시'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {activeRankTab === 'trending' && !trendingLoading && trendingGames.length > 20 && (
                  <button
                    onClick={() => setTrendingShowAll(prev => !prev)}
                    className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    {trendingShowAll ? '접기 ▲' : `더보기 (${trendingGames.length - 20}개 더) ▼`}
                  </button>
                )}
              </div>
            )}

          </div>        ) : (
          <div>
            {/* Selected Game Header - 모바일 최적화 */}
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-3">
              <div className="flex items-start gap-3">
                {/* 썸네일 + 이미지 변경 버튼 */}
                <div className="relative shrink-0">
                  {selectedGame.imageUrl ? (
                    <img
                      src={selectedGame.imageUrl}
                      alt={selectedGame.koreanName || selectedGame.englishName}
                      className="w-20 h-20 object-cover rounded-xl"
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-3xl">🎲</div>
                  )}
                  <label className={`absolute -bottom-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer shadow-md transition-all
                    ${imageUpdateSuccess ? 'bg-green-500' : 'bg-black/70 hover:bg-black/90'}`}>
                    {uploadingImage
                      ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                      : imageUpdateSuccess
                      ? <CheckCircle className="w-3 h-3 text-white" />
                      : <Camera className="w-3 h-3 text-white" />}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingImage}
                      onChange={e => { if (e.target.files?.[0]) handleImageChange(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                </div>

                {/* 게임 이름 + 메타 정보 */}
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 truncate">
                    {selectedGame.koreanName || selectedGame.englishName}
                  </h2>
                  {selectedGame.koreanName && selectedGame.englishName && (
                    <p className="text-xs text-gray-400 truncate">{selectedGame.englishName}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedGame.recommendedPlayers && (
                      <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">👥 {selectedGame.recommendedPlayers}</span>
                    )}
                    {selectedGame.playTime && (
                      <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">⏱ {selectedGame.playTime}</span>
                    )}
                    {selectedGame.difficulty && (
                      <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">⚡ {selectedGame.difficulty}</span>
                    )}
                  </div>
                  {imageUpdateSuccess && (
                    <p className="text-xs text-green-500 mt-1">{imageUpdateMessage || '변경 완료!'}</p>
                  )}
                </div>
              </div>

              {/* 버튼 행 */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                <button
                  onClick={() => setSelectedGame(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ← 뒤로
                </button>
                <button
                  onClick={async () => {
                    const gameName = selectedGame.koreanName || selectedGame.englishName || '';
                    const slug = encodeURIComponent(gameName || selectedGame.bggId || selectedGame.id);
                    const url = `https://boardraum.site/game/${slug}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success('게임 링크가 복사됐어요!');
                    } catch {
                      toast.error('복사 실패');
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  🔗 링크 복사
                </button>
              </div>
            </div>

            {/* Main Tab - 게임설명 / 게임피드 */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
              <div className="flex border-b border-gray-100">
                <button onClick={() => setMainTab('info')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mainTab === 'info' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                  📋 게임설명
                </button>
                <button onClick={() => {
                    setMainTab('feed');
                    if (!gameFeedLoading) loadGameFeedPosts();
                  }}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mainTab === 'feed' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                  🔥 게임피드
                  {mainTab === 'feed' && gameFeedPosts.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-gray-400">({gameFeedPosts.length})</span>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3">
            {mainTab === 'info' ? renderInfoTab() : null}

            {/* 게임피드 탭 */}
            {mainTab === 'feed' && (
              <div className="space-y-3">
                {/* 새로고침 버튼 */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { if (!gameFeedLoading) loadGameFeedPosts(); }}
                    disabled={gameFeedLoading}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                  >
                    <Loader2 className={`w-3 h-3 ${gameFeedLoading ? 'animate-spin' : ''}`} />
                    새로고침
                  </button>
                </div>
                {gameFeedLoading && (
                  <div className="bg-white rounded-2xl shadow-sm p-10 flex justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                )}
                {!gameFeedLoading && gameFeedPosts.length === 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                    <div className="text-3xl mb-3">🎮</div>
                    <p className="text-sm text-gray-500">아직 이 게임이 태그된 게시글이 없어요</p>
                    <p className="text-xs text-gray-400 mt-1">커뮤니티에서 게임을 태그해 글을 남겨보세요!</p>
                  </div>
                )}
                {!gameFeedLoading && gameFeedPosts.map((post: any) => (
                  <div key={post.id} className="bg-white rounded-2xl shadow-sm p-4">
                    {/* 작성자 헤더 */}
                    <div className="flex items-center gap-2 mb-3">
                      {post.userAvatar
                        ? <img src={post.userAvatar} className="w-9 h-9 rounded-full object-cover" />
                        : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white">{(post.userName || '?')[0]}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{post.userName}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString('ko-KR')}</p>
                          {post.category && (
                            <span className="text-xs text-gray-400">·</span>
                          )}
                          {post.category && (
                            <span className="text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-full">{post.category}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 본문 */}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{post.content}</p>
                    {/* 이미지 */}
                    {post.images?.length > 0 && (
                      post.images.length === 1
                        ? <img src={post.images[0]} className="mt-3 w-full h-48 object-cover rounded-xl" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        : <div className="mt-3 grid grid-cols-2 gap-1.5">
                            {post.images.slice(0, 4).map((img: string, i: number) => (
                              <img key={i} src={img} className="w-full h-28 object-cover rounded-xl" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                            ))}
                          </div>
                    )}
                    {/* 통계 */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" />
                        {Array.isArray(post.likes) ? post.likes.length : (post.likes || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {Array.isArray(post.comments) ? post.comments.length : (post.comments || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal - 모바일 바텀시트 스타일 */}
      {showAddForm && selectedGame && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* 드래그 핸들 (모바일) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            {selectedCategory === 'overview' && (
              <GameOverviewForm
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost}
                accessToken={accessToken}
                selectedGame={selectedGame}
              />
            )}
            {selectedCategory === 'sleeve' && (
              <SleeveForm
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost?.data}
                accessToken={accessToken}
              />
            )}
            {selectedCategory === 'components' && (
              <GameComponentsForm
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost}
                accessToken={accessToken}
              />
            )}
            {selectedCategory === 'video' && (
              <VideoForm
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost}
                accessToken={accessToken}
              />
            )}
            {selectedCategory === 'review' && (
              <ReviewForm
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost}
                accessToken={accessToken}
              />
            )}
            {selectedCategory === 'player-count' && (
              <FreePostForm
                category={selectedCategory}
                onSubmit={(data) => {
                  handleFormSubmit(data);
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingPost(null);
                }}
                initialData={editingPost?.data}
                accessToken={accessToken}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};