import { useState, useRef, useEffect } from 'react';
import { X, Image as ImageIcon, Smile, Loader2, Gamepad2, Save, ChevronLeft, ChevronRight, Lock, LockOpen, BarChart2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import type { BoardGame } from '../App';
import { BonusCardWinOverlay } from './BonusCardWinOverlay';
import { GameOverviewForm as GameOverviewFormInline } from './GameCustomForms';
import { getWikiGameId } from '../utils/wikiGameId';
import { SpamWarningModal } from './SpamWarningModal';

const supabase = getSupabaseClient();

interface FeedPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  category: string;
  images: string[];
  linkedGame: { id: string; name: string; imageUrl: string } | null;
  createdAt: string;
  likes: string[];
  comments: { id: string; userId: string; userName: string; content: string; createdAt: string }[];
  isDraft?: boolean;
  talentData?: {
    talentPrice: string;
    talentCategory: string;
    talentLocation: string;
  };
}

// ─── 게임 검색 모달 ───
function GamePickerModal({ ownedGames, onConfirm, onClose, accessToken, selectedIds = [] }: {
  ownedGames: BoardGame[];
  onConfirm: (games: { id: string; name: string; imageUrl: string; bggId?: string }[]) => void;
  onClose: () => void;
  accessToken: string;
  selectedIds?: string[];
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allGames, setAllGames] = useState<any[]>([]);
  const searchTimerRef = useRef<any>(null);
  // 대기열: 모달 내부에서만 관리
  const [queue, setQueue] = useState<{ id: string; name: string; imageUrl: string; bggId?: string }[]>([]);

  // AddGameDialog와 동일하게 전체 등록 게임 프리로드
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/all-games`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    })
      .then(r => r.ok ? r.json() : { games: [] })
      .then(data => setAllGames(data.games || []))
      .catch(() => {});
  }, []);

  const getThumb = (g: any) => {
    const t = g.thumbnail || g.imageUrl || '';
    return t.startsWith('//') ? 'https:' + t : t;
  };

  const ownedFiltered = ownedGames.filter(g =>
    !q || (g.koreanName || g.englishName || '').toLowerCase().includes(q.toLowerCase())
  );

  const handleQueryChange = (val: string) => {
    setQ(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) { setResults([]); return; }

    // 등록 게임: allGames 로컬 필터 (AddGameDialog와 동일 방식 — 전체 데이터 즉시 표시)
    const qLow = val.toLowerCase();
    const localSite: any[] = [];
    const seenKeys = new Set<string>();
    for (const g of allGames) {
      if (
        (g.koreanName || '').toLowerCase().includes(qLow) ||
        (g.englishName || '').toLowerCase().includes(qLow) ||
        (g.name || '').toLowerCase().includes(qLow)
      ) {
        const dk = g.bggId ? `bgg_${g.bggId}` : `id_${g.id}`;
        if (!seenKeys.has(dk)) { seenKeys.add(dk); localSite.push({ ...g, source: 'site' }); }
      }
    }
    setResults(localSite.slice(0, 10)); // 즉시 표시

    // BGG: 500ms 디바운스 후 비BGG 결과만 추가
    searchTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` }, body: JSON.stringify({ query: val }) }
        );
        if (res.ok) {
          const data = await res.json();
          const bggOnly = data.filter((g: any) => g.source !== 'site');
          setResults([...localSite.slice(0, 10), ...bggOnly]);
        }
      } catch {}
      finally { setLoading(false); }
    }, 500);
  };

  const toggleQueue = (g: { id: string; name: string; imageUrl: string; bggId?: string }) => {
    setQueue(prev => prev.find(x => x.id === g.id) ? prev.filter(x => x.id !== g.id) : [...prev, g]);
  };

  const isInQueue = (id: string) => queue.some(x => x.id === id);
  const isAlreadyAdded = (id: string) => selectedIds.includes(id);

  const bggResults = results.filter(g => g.source !== 'site');
  const siteResults = results.filter(g => g.source === 'site');

  const GameRow = ({ g, id, name, imageUrl }: { g?: any; id: string; name: string; imageUrl: string }) => {
    const inQueue = isInQueue(id);
    const added = isAlreadyAdded(id);
    return (
      <div className={`flex items-center gap-3 py-3 border-b border-gray-50 rounded-xl px-2 transition-colors ${inQueue ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}>
        {imageUrl
          ? <img src={imageUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
          {g?.englishName && g?.koreanName && <p className="text-xs text-gray-400 truncate">{g.englishName}</p>}
          {g?.yearPublished && !g?.koreanName && <p className="text-xs text-gray-400">{g.yearPublished}년</p>}
        </div>
        <button onClick={() => toggleQueue({ id, name, imageUrl, bggId: g?.bggId })}
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors
            ${added ? 'bg-gray-200 text-gray-400 cursor-default' : inQueue ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-cyan-500 hover:text-white'}`}
          disabled={added}>
          {added ? <span className="text-xs">✓</span> : inQueue ? <span className="text-xs font-bold">✓</span> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-start justify-center p-3">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col mt-8" style={{ height: '45vh' }}>
        <div className="px-4 pt-3 pb-2.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">게임 태그</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
          </div>
          {/* 대기열 표시 */}
          {queue.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {queue.map(g => (
                <div key={g.id} className="flex items-center gap-1 bg-cyan-500 text-white text-xs px-2 py-1 rounded-full">
                  <span className="max-w-[80px] truncate">{g.name}</span>
                  <button onClick={() => toggleQueue(g)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => handleQueryChange(e.target.value)}
              placeholder="게임 이름 입력 시 자동 검색..."
              style={{ fontSize: '16px' }}
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
          </div>
          {q && <p className="text-xs text-gray-400 mt-1.5 px-1">💡 1글자만 입력해도 전체 DB에서 검색돼요</p>}
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-2">
          {!q ? (
            <>
              <p className="text-xs text-gray-400 mb-2 px-1">내 보유게임</p>
              {ownedGames.length === 0
                ? <p className="text-center py-6 text-sm text-gray-400">게임 이름을 입력하면 전체 DB에서 검색돼요</p>
                : ownedFiltered.map(g => (
                    <GameRow key={g.id} id={g.bggId || g.id} name={g.koreanName || g.englishName} imageUrl={g.imageUrl || ''} g={g} />
                  ))
              }
            </>
          ) : loading && results.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin mb-2" />
              <p className="text-sm">검색 중...</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-6 px-2">
              <p className="text-center text-sm text-gray-400 mb-4">검색 결과가 없어요</p>
              <button onClick={() => toggleQueue({ id: `custom_${Date.now()}`, name: q, imageUrl: '' })}
                className="w-full flex items-center gap-3 py-3 border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-xl px-3 text-left transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">"{q}" 직접 등록</p>
                  <p className="text-xs text-gray-400">검색 결과에 없는 게임 직접 추가</p>
                </div>
              </button>
            </div>
          ) : (
            <>
              {siteResults.length > 0 && (
                <>
                  <p className="text-xs text-cyan-600 font-semibold mb-1 px-1 mt-1">📚 보드라움 회원 등록 게임</p>
                  {siteResults.map(g => {
                    const thumb = getThumb(g);
                    return <GameRow key={g.id} g={g} id={g.bggId || String(g.id)} name={g.koreanName || g.name} imageUrl={thumb} />;
                  })}
                </>
              )}
              {bggResults.length > 0 && (
                <>
                  {siteResults.length > 0 && <p className="text-xs text-gray-400 font-semibold mb-1 px-1 mt-3">🌐 BGG 검색 결과</p>}
                  {bggResults.map(g => {
                    const thumb = getThumb(g);
                    return <GameRow key={g.id} g={g} id={String(g.id)} name={g.koreanName || g.name} imageUrl={thumb} />;
                  })}
                </>
              )}
            </>
          )}
        </div>
        {/* 확정 버튼 */}
        <div className="px-4 pb-5 pt-2 flex-shrink-0 border-t border-gray-100">
          <button
            onClick={() => { onConfirm(queue); onClose(); }}
            disabled={queue.length === 0}
            className="w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm disabled:opacity-30 hover:bg-gray-700 transition-colors">
            {queue.length > 0 ? `게임 ${queue.length}개 추가하기` : '게임을 선택해주세요'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 글 작성 모달 ───
// ─── 글 작성 모달 ───
export function PostComposer({ accessToken, userId, userEmail, userProfile, ownedGames, onClose, onPosted, draftPost, editPost, initialCategory }: {
  accessToken: string; userId: string; userEmail: string;
  userProfile: { username: string; profileImage?: string } | null;
  ownedGames: BoardGame[]; onClose: () => void;
  onPosted: () => void; draftPost?: Partial<FeedPost>; editPost?: FeedPost;
  initialCategory?: string;
}) {
  const isEditMode = !!editPost;
  const [content, setContent] = useState(editPost?.content || draftPost?.content || '');
  const [category, setCategory] = useState<string>(editPost?.category || draftPost?.category || initialCategory || '자유');
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [pendingMainCategory, setPendingMainCategory] = useState<string | null>(null);
  // 보드게임 정보등록 관련
  const [showInfoTypeModal, setShowInfoTypeModal] = useState(false); // 자유등록 vs 보드위키
  const [showWikiGameSearch, setShowWikiGameSearch] = useState(false); // 게임 검색
  const [wikiGameSearchQ, setWikiGameSearchQ] = useState('');
  const [wikiGameResults, setWikiGameResults] = useState<any[]>([]);
  const [wikiGameSearching, setWikiGameSearching] = useState(false);
  const [selectedWikiGame, setSelectedWikiGame] = useState<any | null>(null);
  const [showWikiForm, setShowWikiForm] = useState(false); // GameOverviewForm
  const [wikiFormSubmitting, setWikiFormSubmitting] = useState(false);
  const [existingWikiPost, setExistingWikiPost] = useState<any | null>(null);
  const [showWikiConfirm, setShowWikiConfirm] = useState(false);
  const [images, setImages] = useState<string[]>(editPost?.images || draftPost?.images || []);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showPoll, setShowPoll] = useState(!!(editPost as any)?.poll);
  const [pollQuestion, setPollQuestion] = useState((editPost as any)?.poll?.question || '');
  const [pollOptions, setPollOptions] = useState<string[]>((editPost as any)?.poll?.options?.map((o: any) => o.text) || ['', '']);
  const dragIndexRef = useRef<number | null>(null);
  const [linkedGames, setLinkedGames] = useState<{ id: string; name: string; imageUrl: string; bggId?: string }[]>(
    editPost?.linkedGames || (editPost?.linkedGame ? [editPost.linkedGame] : []) ||
    draftPost?.linkedGames || (draftPost?.linkedGame ? [draftPost.linkedGame] : [])
  );
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [currentImagePreviewIndex, setCurrentImagePreviewIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const sallaePhotoRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imagePreviewScrollRef = useRef<HTMLDivElement>(null);
  // 재능판매 전용
  const [talentPrice, setTalentPrice] = useState(editPost?.talentData?.talentPrice || '');
  const [talentCategory, setTalentCategory] = useState(editPost?.talentData?.talentCategory || '');
  const [talentLocation, setTalentLocation] = useState(editPost?.talentData?.talentLocation || '');
  const [isPrivate, setIsPrivate] = useState((editPost as any)?.isPrivate || false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftList, setDraftList] = useState<any[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [showCardWon, setShowCardWon] = useState(false);
  const [showSpamWarning, setShowSpamWarning] = useState(false);

  // 숙제 카테고리
  const [hwCategories, setHwCategories] = useState<{ id: string; name: string; guideline: string }[]>([]);
  const [guideVisible, setGuideVisible] = useState(true);

  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.categories) setHwCategories(d.categories.filter((c: any) => c.active));
    }).catch(() => {});
  }, [accessToken]);

  // 카테고리 바뀌면 가이드 다시 표시
  useEffect(() => { setGuideVisible(true); }, [category]);

  // 진행중인 마지막글 이벤트 여부 확인
  const [hasActiveEvent, setHasActiveEvent] = useState(false);
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      const events: any[] = d?.events || [];
      const single = d?.event;
      setHasActiveEvent(events.some((e: any) => e.active) || !!single?.active);
    }).catch(() => {});
  }, [accessToken]);

  // 이벤트 카테고리 규칙
  const [eventCategoryNotice, setEventCategoryNotice] = useState<{ title?: string; content?: string } | null>(null);
  const [showEventRulesModal, setShowEventRulesModal] = useState(false);
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/event-category-notice`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.content) setEventCategoryNotice(d);
    }).catch(() => {});
  }, [accessToken]);

  const activeHwCat = hwCategories.find(c => c.name === category);

  const userName = userProfile?.username || userEmail?.split('@')[0] || '회원';
  const avatarUrl = userProfile?.profileImage;

  const insertEmoji = (emoji: string) => {
    const el = textRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    setContent(content.slice(0, s) + emoji + content.slice(e));
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + emoji.length; el.focus(); }, 0);
  };

  // 이미지 압축 함수
  const compressImage = async (file: File, maxSizeMB = 5, maxWidthOrHeight = 2048): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 최대 크기 제한
          if (width > height) {
            if (width > maxWidthOrHeight) {
              height *= maxWidthOrHeight / width;
              width = maxWidthOrHeight;
            }
          } else {
            if (height > maxWidthOrHeight) {
              width *= maxWidthOrHeight / height;
              height = maxWidthOrHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // 압축 품질 조정
          let quality = 0.9;
          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('압축 실패'));
                  return;
                }
                
                // 5MB 이하가 될 때까지 품질 낮춤
                if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.1) {
                  quality -= 0.1;
                  tryCompress();
                } else {
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                  });
                  resolve(compressedFile);
                }
              },
              'image/jpeg',
              quality
            );
          };
          tryCompress();
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
    });
  };

  const handleImageUpload = async (file: File) => {
    try {
      // 파일 타입 검증
      if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)) {
        toast.error('JPEG, PNG, WebP만 가능합니다');
        return;
      }

      let processedFile = file;
      const fileSizeMB = file.size / (1024 * 1024);

      // 5MB 넘으면 압축
      if (file.size > 5 * 1024 * 1024) {
        toast.info(`${fileSizeMB.toFixed(1)}MB 이미지 압축 중...`);
        try {
          processedFile = await compressImage(file);
          const compressedSizeMB = processedFile.size / (1024 * 1024);
          toast.success(`${fileSizeMB.toFixed(1)}MB → ${compressedSizeMB.toFixed(1)}MB 압축 완료`);
        } catch (err) {
          console.error('압축 실패:', err);
          toast.error('이미지 압축 실패');
          return;
        }
      }

      // 서버를 통해 업로드
      const fd = new FormData();
      fd.append('file', processedFile);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd }
      );
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error('이미지 업로드 에러:', errorData);
        throw new Error(errorData.error || '업로드 실패');
      }
      
      const data = await res.json();
      setImages(prev => [...prev, data.imageUrl]);
      if (file.size <= 5 * 1024 * 1024) {
        toast.success('이미지가 업로드되었습니다!');
      }
    } catch (e: any) {
      console.error('이미지 업로드 실패:', e);
      toast.error(e.message || '이미지 업로드 실패');
    }
  };

  // 여러 이미지 업로드 처리
  const handleMultipleImageUpload = async (files: FileList) => {
    const fileArray = Array.from(files);
    setUploadingImg(true);
    
    for (const file of fileArray) {
      await handleImageUpload(file);
    }
    
    setUploadingImg(false);
  };

  const loadDraftList = async () => {
    setDraftLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/drafts`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setDraftList(data.drafts || []);
      }
    } catch {}
    setDraftLoading(false);
  };

  const loadDraft = (draft: any) => {
    setContent(draft.content || '');
    setCategory(draft.category || '자유');
    setImages(draft.images || []);
    setLinkedGames(draft.linkedGames || (draft.linkedGame ? [draft.linkedGame] : []));
    setShowDraftModal(false);
    toast.success('임시저장 글을 불러왔어요');
  };

  const submit = async (isDraft = false) => {
    if (!isDraft && !content.trim()) { toast.error('내용을 입력해주세요'); return; }
    if (!isDraft && category === '살래말래' && linkedGames.length === 0) { toast.error('살래말래에는 게임을 태그해주세요 🎲'); return; }
    if (!isDraft && category === '정보') { toast.error('정보의 세부 태그를 선택해주세요'); setShowSubCategoryModal(true); setPendingMainCategory('정보'); return; }
    if (!isDraft && category === '재능판매') {
      if (!talentCategory) { toast.error('재능 카테고리를 선택해주세요'); return; }
      if (!talentLocation.trim()) { toast.error('지역을 입력해주세요'); return; }
    }

    // 3초 이내 연속 작성 도배 감지 (임시저장 제외)
    if (!isDraft) {
      const SPAM_KEY = 'boardraum_last_action_time';
      const now = Date.now();
      const lastTime = parseInt(localStorage.getItem(SPAM_KEY) || '0', 10);
      if (lastTime && now - lastTime < 3000) {
        setShowSpamWarning(true);
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/spam-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ actionType: '글작성', content: content.trim() }),
        }).catch(() => {});
      }
      localStorage.setItem(SPAM_KEY, String(now));
    }

    setSubmitting(true);
    try {
      const talentData = category === '재능판매' ? {
        talentPrice: talentPrice.replace(/[^0-9]/g, ''),
        talentCategory,
        talentLocation: talentLocation.trim(),
      } : null;
      
      // 수정 모드
      if (isEditMode && editPost) {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${editPost.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ content, category, images: mainImageIndex === 0 ? images : [images[mainImageIndex], ...images.filter((_, i) => i !== mainImageIndex)], linkedGame: linkedGames[0] || null, linkedGames, talentData }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '수정 실패');
        }
        toast.success('게시물이 수정되었습니다');
        onPosted();
        onClose();
      } else {
        // 신규 작성 모드
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            content, userName, userAvatar: avatarUrl, category,
            images: mainImageIndex === 0 ? images : [images[mainImageIndex], ...images.filter((_, i) => i !== mainImageIndex)],
            linkedGame: linkedGames[0] || null, linkedGames, isDraft, talentData, isPrivate,
            poll: showPoll && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2
              ? { question: pollQuestion.trim(), options: pollOptions.filter(o => o.trim()).map(text => ({ text, votes: [] })) }
              : null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '등록 실패');
        }
        isDraft ? toast.success('임시저장 완료') : toast.success('게시물이 등록됐어요!');
        onPosted();
        if (!isDraft) {
          // 5% 확률 보너스카드 체크 (먼저 닫기 전에 확인)
          let cardGranted = false;
          try {
            const cardRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bonus-cards/activity`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ type: 'post' }),
            });
            const cardData = await cardRes.json().catch(() => ({}));
            if (cardData.granted) cardGranted = true;
          } catch { /* 카드 실패해도 무시 */ }
          if (cardGranted) {
            setShowCardWon(true);
            // 오버레이가 끝난 뒤 닫힘 (BonusCardWinOverlay onClose → onClose())
          } else {
            onClose();
          }
        }
      }
    } catch (e: any) { toast.error(e.message || (isEditMode ? '수정 실패' : '등록 실패')); }
    setSubmitting(false);
  };

  const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇',
    '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛',
    '😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','😐',
    '😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤',
    '😴','😷','🤒','🤕','🥴','🥳','🥺','😭','😤','😠',
    '😡','🤬','😈','💀','💩','🤡','👻','👾','🎲','🃏',
    '♟️','🎮','🏆','🥇','❤️','🧡','💛','💚','💙','💜',
    '🔥','⭐','✨','💫','🎉','🎊','👍','👎','👏','🙌',
  ];
  // 메인 카테고리 5개
  const MAIN_CATEGORIES = ['이벤트', '자유', '정보', '게임리뷰', '질문'];
  const SUB_CATEGORIES: Record<string, string[]> = {
    '정보': ['보드게임 소식', '보드게임 정보등록', '재능판매'],
    '질문': ['살래말래', '보드게임 Q&A'],
  };
  const INFO_SUBS = ['보드게임 소식', '보드게임 정보등록', '재능판매'];
  const QUESTION_SUBS = ['살래말래', '보드게임 Q&A'];
  const getMainCategory = (cat: string) => {
    if (MAIN_CATEGORIES.includes(cat)) return cat;
    if (INFO_SUBS.includes(cat)) return '정보';
    if (QUESTION_SUBS.includes(cat)) return '질문';
    if (hwCategories.some(h => h.name === cat)) return cat;
    return cat;
  };
  const currentMain = getMainCategory(category);
  const hasEventCategory = category === '이벤트';
  const allCategories = [...MAIN_CATEGORIES, '숙제'];

  return (
    <>
    <div className="fixed inset-0 bg-black/60 z-[9990] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 sm:px-5 pt-3 sm:pt-5 pb-2.5 sm:pb-4 border-b border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900 font-medium">취소</button>
          <h3 className="font-bold text-gray-900 text-base">{isEditMode ? '게시물 수정' : '새 게시물'}</h3>
          <div className="flex items-center gap-2">
            {/* 비밀글 토글 */}
            {!isEditMode && (
              <button
                onClick={() => {
                  if (!isPrivate) {
                    if (window.confirm('마이페이지 게시글에만 등록하시겠습니까?')) {
                      setIsPrivate(true);
                    }
                  } else {
                    setIsPrivate(false);
                  }
                }}
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border transition-colors ${
                  isPrivate
                    ? 'border-gray-900 text-gray-900 bg-gray-50'
                    : 'border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400'
                }`}
                title={isPrivate ? '비밀글 (마이페이지에만 표시)' : '공개글'}>
                {isPrivate ? <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <LockOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            )}
            {!isEditMode && (
              <button onClick={() => { setShowDraftModal(true); loadDraftList(); }} disabled={submitting}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 transition-colors" title="임시저장">
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 카테고리 선택 */}
        <div className="px-4 sm:px-5 py-2 sm:py-3 border-b border-gray-50 flex-shrink-0">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {allCategories.map(c => {
              const isHw = hwCategories.some(h => h.name === c);
              const isSelected = currentMain === c || (isHw && category === c);
              const hasSub = SUB_CATEGORIES[c] && SUB_CATEGORIES[c].length > 0;
              return (
                <button key={c} onClick={() => {
                  if (c === '숙제') {
                    // 숙제 클릭 → 숙제 카테고리 모달
                    setPendingMainCategory('숙제');
                    setShowSubCategoryModal(true);
                  } else if (hasSub) {
                    setPendingMainCategory(c);
                    setShowSubCategoryModal(true);
                  } else {
                    setCategory(c);
                  }
                }}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    isSelected || (c === '숙제' && hwCategories.some(h => h.name === category))
                      ? isHw ? 'bg-orange-500 text-white' : c === '이벤트' ? 'bg-cyan-500 text-white' : c === '숙제' ? 'bg-orange-500 text-white' : 'bg-gray-900 text-white'
                      : isHw ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                      : c === '이벤트' ? 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100 border border-cyan-200'
                      : c === '숙제' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {c === '이벤트' ? '🎉 ' : c === '숙제' ? '📚 ' : ''}{c}{hasSub || c === '숙제' ? ' ›' : ''}
                </button>
              );
            })}
          </div>
          {/* 선택된 세부 태그 표시 */}
          {SUB_CATEGORIES[currentMain] && !MAIN_CATEGORIES.includes(category) && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-xs text-gray-400">세부:</span>
              <span className="text-xs px-2 py-0.5 bg-gray-900 text-white rounded-full font-medium">{category}</span>
              <button onClick={() => setCategory(currentMain)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">✕</button>
            </div>
          )}
          {/* 이벤트 규칙 버튼 */}
          {category === '이벤트' && eventCategoryNotice?.content && (
            <div className="mt-1.5">
              <button
                onClick={() => setShowEventRulesModal(true)}
                className="flex items-center gap-1 text-xs font-semibold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 px-2.5 py-1 rounded-lg transition-colors">
                📋 이벤트 규칙
              </button>
            </div>
          )}
        </div>

        {/* 이벤트 규칙 모달 */}
        {showEventRulesModal && eventCategoryNotice && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowEventRulesModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 text-sm">📋 {eventCategoryNotice.title || '이벤트 규칙'}</h3>
                <button onClick={() => setShowEventRulesModal(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-xs">✕</button>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{eventCategoryNotice.content}</p>
            </div>
          </div>
        )}

        {/* 세부 카테고리 모달 */}
        {showSubCategoryModal && pendingMainCategory && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowSubCategoryModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-900 mb-3 text-sm">
                {pendingMainCategory === '숙제' ? '📚 숙제 선택' : `${pendingMainCategory} 세부 태그 선택`}
              </h3>
              <div className="space-y-2">
                {pendingMainCategory === '숙제'
                  ? hwCategories.map(hw => (
                      <button key={hw.id} onClick={() => { setCategory(hw.name); setShowSubCategoryModal(false); }}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${category === hw.name ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}>
                        📚 {hw.name}
                      </button>
                    ))
                  : (SUB_CATEGORIES[pendingMainCategory] || []).map(sub => (
                      <button key={sub} onClick={() => {
                        if (sub === '보드게임 정보등록') {
                          setShowSubCategoryModal(false);
                          setShowInfoTypeModal(true);
                        } else {
                          setCategory(sub);
                          setShowSubCategoryModal(false);
                        }
                      }}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${category === sub ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {sub}
                      </button>
                    ))
                }
              </div>
              <button onClick={() => setShowSubCategoryModal(false)} className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-gray-600">취소</button>
            </div>
          </div>
        )}

        {/* 정보등록 타입 선택 모달 */}
        {showInfoTypeModal && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowInfoTypeModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-900 mb-1 text-sm">보드게임 정보등록</h3>
              <p className="text-xs text-gray-400 mb-4">어떤 방식으로 등록할까요?</p>
              <div className="space-y-2">
                <button onClick={() => { setCategory('보드게임 정보등록'); setShowInfoTypeModal(false); }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium text-left bg-gray-100 hover:bg-gray-200 transition-colors">
                  <p className="font-bold text-gray-900">✏️ 자유롭게 등록</p>
                  <p className="text-xs text-gray-500 mt-0.5">일반 게시글처럼 자유롭게 작성</p>
                </button>
                <button onClick={() => { setShowInfoTypeModal(false); setShowWikiGameSearch(true); setWikiGameSearchQ(''); setWikiGameResults([]); }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium text-left bg-cyan-50 hover:bg-cyan-100 transition-colors border border-cyan-200">
                  <p className="font-bold text-cyan-800">🎲 보드위키 등록</p>
                  <p className="text-xs text-cyan-600 mt-0.5">게임 선택 후 보드위키에 바로 등록</p>
                </button>
              </div>
              <button onClick={() => setShowInfoTypeModal(false)} className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-gray-600">취소</button>
            </div>
          </div>
        )}

        {/* 보드위키 게임 검색 모달 */}
        {showWikiGameSearch && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center p-4 pt-12"
            onClick={() => setShowWikiGameSearch(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}
              onClick={e => e.stopPropagation()}>
              <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
                <h3 className="font-bold text-gray-900 mb-3 text-sm">🎲 게임 선택</h3>
                <input autoFocus value={wikiGameSearchQ}
                  onChange={async e => {
                    const q = e.target.value;
                    setWikiGameSearchQ(q);
                    if (!q.trim()) { setWikiGameResults([]); return; }
                    setWikiGameSearching(true);
                    try {
                      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                        body: JSON.stringify({ query: q }),
                      });
                      if (res.ok) setWikiGameResults(await res.json());
                    } catch {}
                    setWikiGameSearching(false);
                  }}
                  placeholder="게임 이름으로 검색 (한글/영문)..."
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div className="overflow-y-auto flex-1 px-3 py-2">
                {wikiGameSearching && <p className="text-center py-6 text-sm text-gray-400">검색 중...</p>}
                {!wikiGameSearching && wikiGameSearchQ && wikiGameResults.length === 0 && (
                  <div className="py-6 text-center">
                    <p className="text-sm text-gray-400 mb-3">검색 결과가 없어요</p>
                    <button onClick={() => {
                      const newGame = { id: `custom_${Date.now()}`, name: wikiGameSearchQ, koreanName: wikiGameSearchQ, englishName: '', imageUrl: '', bggId: '' };
                      setSelectedWikiGame(newGame);
                      setShowWikiGameSearch(false);
                      setShowWikiForm(true);
                    }} className="px-4 py-2 bg-cyan-500 text-white text-sm rounded-xl font-medium hover:bg-cyan-600">
                      처음으로 "{wikiGameSearchQ}" 등록하기
                    </button>
                  </div>
                )}
                {wikiGameResults.map((g: any) => {
                  const thumb = (g.thumbnail || g.imageUrl || '');
                  const imgUrl = thumb.startsWith('//') ? 'https:' + thumb : thumb;
                  return (
                    <button key={g.id} onClick={async () => {
                      const game = { ...g, koreanName: g.koreanName || g.name, imageUrl: imgUrl, bggId: g.source === 'bgg' ? g.id : (g.bggId || '') };
                      setSelectedWikiGame(game);
                      setShowWikiGameSearch(false);
                      // 기존 등록 데이터 조회
                      try {
                        const gameId = getWikiGameId(game);
                        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${gameId}?category=overview`, { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } });
                        if (res.ok) {
                          const data = await res.json();
                          const existing = data.posts?.filter((p: any) => p.postType === 'info');
                          if (existing && existing.length > 0) {
                            setExistingWikiPost(existing[0]);
                            setShowWikiConfirm(true);
                            return;
                          }
                        }
                      } catch {}
                      setExistingWikiPost(null);
                      setShowWikiForm(true);
                    }} className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl text-left transition-colors">
                      {imgUrl ? <img src={imgUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">🎲</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{g.koreanName || g.name}</p>
                        {g.yearPublished && <p className="text-xs text-gray-400">{g.yearPublished}년</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => setShowWikiGameSearch(false)} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">취소</button>
              </div>
            </div>
          </div>
        )}

        {/* 보드위키 등록 폼 모달 */}
        {/* 이미 등록된 정보 수정 확인 모달 */}
        {showWikiConfirm && selectedWikiGame && (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm">
              <h3 className="font-bold text-gray-900 mb-2">이미 등록된 정보가 있어요</h3>
              <p className="text-sm text-gray-500 mb-4">기존에 등록된 게임 설명 정보가 있습니다. 수정하시겠습니까?</p>
              <div className="space-y-2">
                <button onClick={() => { setShowWikiConfirm(false); setShowWikiForm(true); }}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700">
                  예, 수정할게요
                </button>
                <button onClick={() => { setShowWikiConfirm(false); setExistingWikiPost(null); setSelectedWikiGame(null); }}
                  className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200">
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {showWikiForm && selectedWikiGame && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center p-2 pt-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
                {selectedWikiGame.imageUrl && <img src={selectedWikiGame.imageUrl} className="w-10 h-10 rounded-xl object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{selectedWikiGame.koreanName || selectedWikiGame.name}</p>
                  <p className="text-xs text-cyan-600">보드위키 등록</p>
                </div>
                <button onClick={() => setShowWikiForm(false)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
              </div>
              <div className="overflow-y-auto flex-1">
                <GameOverviewFormInline
                  accessToken={accessToken || publicAnonKey}
                  selectedGame={selectedWikiGame}
                  initialData={existingWikiPost}
                  onCancel={() => setShowWikiForm(false)}
                  onSubmit={async (formData: any) => {
                    setWikiFormSubmitting(true);
                    try {
                      const gameId = getWikiGameId(selectedWikiGame);

                      // 0) 이미 등록된 overview 있는지 확인
                      const checkRes = await fetch(
                        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${gameId}?category=overview`,
                        { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
                      );
                      if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        const existing = checkData.posts?.filter((p: any) => p.postType === 'info');
                        if (existing && existing.length > 0) {
                          const confirmEdit = window.confirm('이미 등록된 게임 설명 정보가 있어요.\n수정하시겠습니까?');
                          if (!confirmEdit) { setWikiFormSubmitting(false); return; }
                          // 기존 게시글 수정
                          const existingPost = existing[0];
                          await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${existingPost.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                            body: JSON.stringify({
                              title: '게임 설명',
                              description: formData.data?.description || formData.description || '',
                              images: formData.data?.images || formData.images || [],
                              data: formData.data || formData,
                              status: 'approved',
                            }),
                          });
                          // 표지 이미지 저장
                          const coverUrl = formData.coverImageUrl || selectedWikiGame.imageUrl;
                          if (coverUrl) {
                            await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/update-image`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                              body: JSON.stringify({ gameId: selectedWikiGame.id, bggId: selectedWikiGame.bggId || '', koreanName: selectedWikiGame.koreanName || selectedWikiGame.name, newImageUrl: coverUrl }),
                            }).catch(() => {});
                          }
                          // 수정 완료 피드 게시글 등록
                          const gameName = selectedWikiGame.koreanName || selectedWikiGame.name;
                          const fd2 = formData.data || formData;
                          const playerInfo2 = [fd2.playerCount, fd2.bestPlayers && `베스트:${fd2.bestPlayers}`].filter(Boolean).join(', ');
                          const editParts: string[] = [];
                          editParts.push('🎲 **' + gameName + '** 보드위키 정보가 수정되었어요!');
                          if (fd2.bggScore) editParts.push('⭐ 게임평점 ' + fd2.bggScore + '점');
                          if (fd2.difficulty) editParts.push('🧠 난이도 ' + fd2.difficulty);
                          if (playerInfo2) editParts.push('👥 ' + playerInfo2);
                          if (fd2.playTime) editParts.push('⏱ ' + fd2.playTime);
                          if (fd2.designer) editParts.push('✏️ 디자이너 ' + fd2.designer);
                          if (fd2.description) editParts.push('\n' + fd2.description.slice(0, 200) + (fd2.description.length > 200 ? '...' : ''));
                          await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                            body: JSON.stringify({
                              content: editParts.join('\n'),
                              userName, userAvatar: avatarUrl,
                              category: '보드게임 정보등록',
                              images: [
                                ...(selectedWikiGame.imageUrl ? [selectedWikiGame.imageUrl] : []),
                                ...(fd2.images || []),
                              ],
                              linkedGames: [{ id: selectedWikiGame.id, name: gameName, imageUrl: selectedWikiGame.imageUrl || '' }],
                            }),
                          }).catch(() => {});
                          toast.success('보드위키 정보가 수정됐어요!');
                          setShowWikiForm(false);
                          setSelectedWikiGame(null);
                          setWikiFormSubmitting(false);
                          onClose();
                          return;
                        }
                      }

                      // 1) site_game_ 등록
                      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/site-games/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                        body: JSON.stringify({ game: selectedWikiGame }),
                      }).catch(() => {});

                      // 2) 보드위키 등록 (customs API - gameId는 body에)
                      const wikiRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                        body: JSON.stringify({
                          gameId,
                          gameName: selectedWikiGame.koreanName || selectedWikiGame.name,
                          category: 'overview',
                          postType: 'info',
                          title: '게임 설명',
                          description: formData.data?.description || formData.description || '',
                          images: formData.data?.images || formData.images || [],
                          data: formData.data || formData,
                          status: 'approved',
                        }),
                      });
                      if (!wikiRes.ok) {
                        const errData = await wikiRes.json().catch(() => ({}));
                        throw new Error('보드위키 등록 실패: ' + (errData.error || wikiRes.status));
                      }

                      // 3) 표지 이미지 저장 (coverImageUrl 있을 때)
                      const coverUrl = formData.coverImageUrl || selectedWikiGame.imageUrl;
                      if (coverUrl) {
                        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/update-image`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                          body: JSON.stringify({ gameId: selectedWikiGame.id, bggId: selectedWikiGame.bggId || '', koreanName: selectedWikiGame.koreanName || selectedWikiGame.name, newImageUrl: coverUrl }),
                        }).catch(() => {});
                      }

                      // 3) 피드에 요약 게시글 등록
                      const fd = formData.data || formData;
                      const playerInfo = [fd.playerCount, fd.bestPlayers && `베스트:${fd.bestPlayers}`].filter(Boolean).join(', ');
                      const summaryParts: string[] = [];
                      summaryParts.push('🎲 **' + (selectedWikiGame.koreanName || selectedWikiGame.name) + '** 보드위키 정보가 등록되었어요!');
                      if (fd.bggScore) summaryParts.push('⭐ 게임평점 ' + fd.bggScore + '점');
                      if (fd.difficulty) summaryParts.push('🧠 난이도 ' + fd.difficulty);
                      if (playerInfo) summaryParts.push('👥 ' + playerInfo);
                      if (fd.playTime) summaryParts.push('⏱ ' + fd.playTime);
                      if (fd.designer) summaryParts.push('✏️ 디자이너 ' + fd.designer);
                      if (fd.description) summaryParts.push('\n' + fd.description.slice(0, 200) + (fd.description.length > 200 ? '...' : ''));
                      const summary = summaryParts.join('\n');

                      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
                        body: JSON.stringify({
                          content: summary,
                          userName, userAvatar: avatarUrl,
                          category: '보드게임 정보등록',
                          images: [
                            ...(selectedWikiGame.imageUrl ? [selectedWikiGame.imageUrl] : []),
                            ...(fd.images || []),
                          ],
                          linkedGames: [{ id: selectedWikiGame.id, name: selectedWikiGame.koreanName || selectedWikiGame.name, imageUrl: selectedWikiGame.imageUrl || '' }],
                        }),
                      });

                      toast.success('보드위키에 등록됐어요! 피드에도 공유되었어요 🎉');
                      setShowWikiForm(false);
                      setSelectedWikiGame(null);
                      setCategory('보드게임 정보등록');
                      onClose();
                    } catch (e: any) {
                      toast.error('등록 오류: ' + (e?.message || '알 수 없는 오류'));
                    } finally {
                      setWikiFormSubmitting(false);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 이벤트 참여 안내 (이벤트 진행중 + 이벤트 카테고리 아닌 경우) */}
        {hasActiveEvent && !isEditMode && category !== '이벤트' && (
          <div className="mx-4 sm:mx-5 mt-2.5 rounded-xl px-3 py-2 flex items-center gap-2 flex-shrink-0"
            style={{ background: '#FFF8E1', border: '1px solid #FFE082' }}>
            <span className="text-sm flex-shrink-0">⚠️</span>
            <p className="text-xs text-amber-700 leading-snug">
              현재 <span className="font-bold">마지막 글 이벤트</span>가 진행 중이에요.
              이벤트에 참여하려면 <span className="font-bold text-cyan-600">🎉 이벤트</span> 카테고리를 선택해주세요.
            </p>
          </div>
        )}

        {/* 숙제 가이드라인 */}
        {activeHwCat && activeHwCat.guideline && guideVisible && (
          <div className="mx-4 sm:mx-5 mt-3 rounded-xl bg-orange-50 border border-orange-200 p-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-xs font-bold text-orange-700 mb-1">📋 숙제 가이드</p>
                <p className="text-xs text-orange-600 leading-relaxed whitespace-pre-wrap">{activeHwCat.guideline}</p>
              </div>
              <button onClick={() => setGuideVisible(false)} className="text-orange-300 hover:text-orange-500 flex-shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 작성 영역 */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center text-xs sm:text-sm font-bold text-gray-500 overflow-hidden">
              {avatarUrl 
                ? <img src={avatarUrl} className="w-full h-full object-cover" alt="profile" />
                : userName[0]?.toUpperCase()
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm mb-2">{userName}</p>

              {/* 재능판매 전용 입력 */}
              {category === '재능판매' && (
                <div className="mb-3 space-y-2.5">
                  {/* 재능 카테고리 - 드롭다운 형식으로 변경 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">재능 카테고리</p>
                    <div className="relative">
                      <select
                        value={talentCategory}
                        onChange={(e) => setTalentCategory(e.target.value)}
                        className="w-full h-10 sm:h-11 px-3 sm:px-4 pr-9 sm:pr-10 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00C4CC] focus:border-[#00C4CC] appearance-none cursor-pointer transition-all"
                      >
                        <option value="" disabled>카테고리를 선택하세요</option>
                        {['오거나이저','3D인쇄 대행','번역','아스테이지 작업','인쇄물 인쇄대행','청소','도색','컴포넌트','기타'].map(tc => (
                          <option key={tc} value={tc}>{tc}</option>
                        ))}
                      </select>
                      <div className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M19 9l-7 7-7-7"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  {/* 금액 */}
                  <div className="bg-gray-50 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-.8-1.4-1-2.5-1-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2.2c0 1.2-1.1 2-2.5 2-1.2 0-2.1-.3-2.7-1.2"/><path d="M12 7v1m0 8v1"/></svg>
                      <p className="text-xs font-semibold text-gray-500">금액</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="text" inputMode="numeric" value={talentPrice}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g,'');
                          setTalentPrice(raw ? parseInt(raw).toLocaleString() : '');
                        }}
                        placeholder="0"
                        className="flex-1 text-xl sm:text-2xl font-black text-[#00A3AB] bg-transparent outline-none placeholder-teal-200"
                      />
                      <span className="text-base sm:text-lg font-bold text-gray-400">원</span>
                    </div>
                    {!talentPrice && <p className="text-xs text-gray-400 mt-0.5">비워두면 협의</p>}
                  </div>
                  {/* 지역 */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5"><svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#00A3AB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg><p className="text-xs font-semibold text-[#00A3AB]">지역</p></div>
                    <input value={talentLocation} onChange={e => setTalentLocation(e.target.value)}
                      placeholder="예) 강남구 서초구 잠원동"
                      className="w-full h-10 sm:h-11 px-3 sm:px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#66DBE0] focus:border-[#66DBE0]"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              )}

              {/* 살래말래 게임태그 필수 버튼 */}
              {category === '살래말래' && (
                <div className="mb-3">
                  {linkedGames.length > 0 ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-cyan-400 cursor-pointer"
                      onClick={() => setShowGamePicker(true)}>
                      {linkedGames[0].imageUrl
                        ? <img src={linkedGames[0].imageUrl} className="w-full object-cover" style={{ maxHeight: '180px', minHeight: '100px' }} />
                        : <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-3xl">🎲</div>
                      }
                      <div className="absolute inset-0 bg-black/30 flex items-end p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">🎲 {linkedGames[0].name}</p>
                          <p className="text-white/70 text-xs">탭하면 변경</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setLinkedGames([]); }}
                          className="ml-2 bg-white/20 hover:bg-white/40 rounded-full p-1 transition-colors">
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); sallaePhotoRef.current?.click(); }}
                        className="absolute bottom-10 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full px-2.5 py-1 text-xs font-medium flex items-center gap-1 transition-colors">
                        <ImageIcon className="w-3 h-3" /> 사진 추가
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setShowGamePicker(true)}
                        className="flex-1 py-6 rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50 hover:bg-cyan-100 transition-colors flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-200 flex items-center justify-center">
                          <span className="text-2xl">🎲</span>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-cyan-700 text-sm">게임 태그 (필수)</p>
                          <p className="text-cyan-500 text-xs mt-0.5">어떤 게임인지 선택해주세요</p>
                        </div>
                      </button>
                      <button onClick={() => sallaePhotoRef.current?.click()}
                        className="flex-1 py-6 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-gray-200 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-500" />
                        </div>
                        <p className="text-gray-500 text-xs font-medium">사진 추가</p>
                      </button>
                    </div>
                  )}
                  <input ref={sallaePhotoRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(handleImageUpload); e.target.value = ''; }} />
                </div>
              )}

              <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)}
                onFocus={() => activeHwCat && setGuideVisible(false)}
                placeholder={category === '살래말래' ? '이 게임에 대해 한마디! (선택)' : activeHwCat ? `${activeHwCat.name} 숙제를 작성해주세요...` : category === '재능판매' ? '재능에 대해 설명해주세요...' : '자유롭게 소통하세요.'}
                className="w-full text-sm text-gray-900 placeholder-gray-400 resize-none border-none outline-none bg-transparent min-h-[60px]"
                style={{ fontSize: '16px' }}
                rows={category === '재능판매' ? 2 : 3} />

              {/* 연결된 게임 (살래말래 제외) - 여러개 */}
              {linkedGames.length > 0 && category !== '살래말래' && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {linkedGames.map((g, i) => (
                    <div key={g.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-xl">
                      {g.imageUrl && <img src={g.imageUrl} className="w-6 h-6 rounded-md object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
                      <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{g.name}</span>
                      <button onClick={() => setLinkedGames(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600 ml-0.5"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <button onClick={() => setShowGamePicker(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs text-gray-500 transition-colors">
                    <Plus className="w-3 h-3" /> 추가
                  </button>
                </div>
              )}

              {/* 이미지 프리뷰 - 슬라이더 */}
              {images.length > 0 && (
                <div className="mt-2 sm:mt-3">
                  <div className="relative rounded-xl overflow-hidden bg-gray-50">
                    {/* 현재 이미지 */}
                    <img src={images[previewIndex]} className="w-full object-contain"
                      style={{ maxHeight: '280px', minHeight: '140px' }} />

                    {/* 메인 배지 */}
                    {previewIndex === mainImageIndex && (
                      <div className="absolute top-2 left-2 bg-gray-900 text-white text-[10px] font-bold rounded-lg px-2 py-0.5">
                        대표
                      </div>
                    )}

                    {/* 번호 */}
                    <div className="absolute top-2 right-10 bg-black/50 text-white text-xs rounded-lg px-2 py-0.5">
                      {previewIndex + 1} / {images.length}
                    </div>

                    {/* 삭제 */}
                    <button onClick={() => {
                      const newImages = images.filter((_, j) => j !== previewIndex);
                      setImages(newImages);
                      const newMain = mainImageIndex >= newImages.length ? 0 : mainImageIndex === previewIndex ? 0 : mainImageIndex > previewIndex ? mainImageIndex - 1 : mainImageIndex;
                      setMainImageIndex(newMain);
                      setPreviewIndex(Math.min(previewIndex, newImages.length - 1));
                    }}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* 좌측 화살표 */}
                    {previewIndex > 0 && (
                      <button onClick={() => setPreviewIndex(i => i - 1)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}

                    {/* 우측 화살표 */}
                    {previewIndex < images.length - 1 && (
                      <button onClick={() => setPreviewIndex(i => i + 1)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}

                    {/* 대표 설정 버튼 */}
                    {images.length > 1 && previewIndex !== mainImageIndex && (
                      <button onClick={() => setMainImageIndex(previewIndex)}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 text-gray-900 text-xs font-semibold rounded-full px-3 py-1 shadow">
                        대표 사진으로 설정
                      </button>
                    )}
                  </div>

                  {/* 점 인디케이터 */}
                  {images.length > 1 && (
                    <div className="flex justify-center gap-1.5 mt-2">
                      {images.map((_, i) => (
                        <button key={i} onClick={() => setPreviewIndex(i)}
                          className={`rounded-full transition-all ${i === previewIndex ? 'w-4 h-1.5 bg-gray-900' : 'w-1.5 h-1.5 bg-gray-300'}`} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* 설문조사 */}
              {showPoll && (
                <div className="mt-3 bg-gray-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">설문조사</span>
                    <button onClick={() => setShowPoll(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)}
                    placeholder="질문을 입력하세요"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                    style={{ fontSize: '16px' }}
                  />
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      <input
                        value={opt}
                        onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                        placeholder={`선택지 ${i + 1}`}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                        style={{ fontSize: '16px' }}
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button onClick={() => setPollOptions(prev => [...prev, ''])}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 px-1 py-1">
                      <Plus className="w-3.5 h-3.5" /> 선택지 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 툴바 */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-4 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* 이미지 - 살래말래에서 비활성화 */}
              <button onClick={() => fileRef.current?.click()} disabled={uploadingImg || category === '살래말래'}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-colors ${category === '살래말래' ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                {uploadingImg ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => e.target.files && handleMultipleImageUpload(e.target.files)} />
              {/* 이모지 */}
              <button onClick={() => setShowEmojiPicker(true)}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-colors ${showEmojiPicker ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              {/* 설문조사 - 살래말래에서 비활성화 */}
              <button onClick={() => setShowPoll(p => !p)} disabled={category === '살래말래'}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-colors ${category === '살래말래' ? 'text-gray-200 cursor-not-allowed' : showPoll ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 rotate-90" />
              </button>
              {/* 게임 태그 - 살래말래에서 비활성화 (위에 전용 버튼 있음) */}
              <button onClick={() => setShowGamePicker(true)} disabled={category === '살래말래'}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-colors ${category === '살래말래' ? 'text-gray-200 cursor-not-allowed' : linkedGames.length > 0 ? 'text-cyan-600 bg-cyan-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <button onClick={() => submit(false)} disabled={submitting || !content.trim()}
              className="h-9 sm:h-10 px-5 sm:px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-gray-700 transition-colors">
              {submitting ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : '게시'}
            </button>
          </div>
        </div>
      </div>

      {showEmojiPicker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setShowEmojiPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-full max-w-xs sm:w-72" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-semibold text-gray-400 mb-2 px-1">이모지</p>
            <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { insertEmoji(e); setShowEmojiPicker(false); }}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors">{e}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showGamePicker && (
        <GamePickerModal ownedGames={ownedGames} selectedIds={linkedGames.map(g => g.id)}
          onConfirm={games => {
            if (category === '살래말래') setLinkedGames(games.slice(0, 1));
            else setLinkedGames(prev => {
              const existingIds = new Set(prev.map(x => x.id));
              return [...prev, ...games.filter(g => !existingIds.has(g.id))];
            });
          }}
          onClose={() => setShowGamePicker(false)} accessToken={accessToken} />
      )}

      {/* 임시저장 모달 */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Save className="w-4 h-4" /> 임시저장
              </h3>
              <button onClick={() => setShowDraftModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* 저장하기 버튼 */}
              <button
                onClick={() => { submit(true); setShowDraftModal(false); }}
                disabled={!content.trim()}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors">
                <Save className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-semibold">현재 글 저장하기</p>
                  <p className="text-xs text-gray-400 mt-0.5">작성 중인 내용을 임시저장해요</p>
                </div>
              </button>

              {/* 불러오기 목록 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">저장된 글 불러오기</p>
                {draftLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                ) : draftList.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-400">저장된 임시글이 없어요</div>
                ) : (
                  <div className="space-y-2 overflow-y-auto max-h-48">
                    {draftList.map(draft => (
                      <button key={draft.id} onClick={() => loadDraft(draft)}
                        className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
                        <p className="text-sm text-gray-700 line-clamp-2">{draft.content || '(내용 없음)'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(draft.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {draft.category && draft.category !== '자유' && <span className="ml-2 text-gray-500">{draft.category}</span>}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    {showCardWon && (
      <BonusCardWinOverlay onClose={() => { setShowCardWon(false); onClose(); }} />
    )}
    {showSpamWarning && <SpamWarningModal onClose={() => setShowSpamWarning(false)} />}
    </>
  );
}