import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BoardGame } from '../App';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Search, Loader2, Check, Upload, X, Minus, Plus, FileSpreadsheet, Library } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// Get singleton Supabase client
const supabase = getSupabaseClient();
// 본판 게임 검색 컴포넌트
function ParentGameSearch({ games, selectedId, onSelect, initialQuery }: {
  games: import('../App').BoardGame[];
  selectedId: string;
  onSelect: (id: string) => void;
  initialQuery?: string;
}) {
  const [q, setQ] = useState('');
  const bases = games.filter(g => !g.isExpansion);
  const filtered = q.trim()
    ? bases.filter(g =>
        (g.koreanName || '').toLowerCase().includes(q.toLowerCase()) ||
        (g.englishName || '').toLowerCase().includes(q.toLowerCase())
      )
    : bases;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="내 게임 목록에서 검색..."
          className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        />
      </div>
      <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-4">게임을 찾을 수 없어요</p>
        ) : (
          filtered.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-gray-50 flex items-center justify-between gap-2 ${
                selectedId === g.id ? 'bg-gray-900 text-white hover:bg-gray-800' : 'text-gray-800'
              }`}
            >
              <span className="truncate">{g.koreanName || g.englishName}</span>
              {selectedId === g.id && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}


interface BGGSearchResult {
  id: string;
  name: string;
  yearPublished: string;
  thumbnail?: string;
  bggId?: string | null;
  koreanName?: string | null;
  englishName?: string | null;
  source?: string;
}

interface BGGGameDetails {
  imageUrl: string;
  minPlayers: number;
  maxPlayers: number;
  playTime: number;
  minPlayTime: number;
  maxPlayTime: number;
  complexity: number;
  bestPlayerCount: string;
}

interface AddGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddGame: (game: BoardGame) => void;
  onAddGames?: (games: BoardGame[]) => void;
  existingGames?: BoardGame[];
  initialQuery?: string;        // 열릴 때 미리 채워질 검색어 (확장 추가 시)
  initialParentGameId?: string; // 열릴 때 미리 선택될 본판 ID
}

export function AddGameDialog({ open, onOpenChange, onAddGame, onAddGames, existingGames = [], initialQuery = '', initialParentGameId = '' }: AddGameDialogProps) {
  const [step, setStep] = useState(1); // 1: 검색, 2: 정보 확인, 3: 영상 입력
  const [isManualEntry, setIsManualEntry] = useState(false); // 직접 등록 모드
  const [formData, setFormData] = useState({
    imageUrl: '',
    koreanName: '',
    englishName: '',
    recommendedPlayers: '',
    playTime: '',
    difficulty: '',
    videoUrl: '',
    isExpansion: false,
    expansionType: '' as '' | 'expansion' | 'series' | 'legacy',
    parentGameId: '',
    languageEdition: undefined as 'korean' | 'english' | 'multilingual' | undefined,
    quantity: 1,
    bggId: '',
  });

  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<BGGSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [allRegisteredGames, setAllRegisteredGames] = useState<BoardGame[]>([]); // 모든 등록 게임
  // bulk 등록
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  // 선택된 게임 정보 보존 (검색어 달라져도 유지)
  const [selectedGameMap, setSelectedGameMap] = useState<Map<string, { name: string; thumbnail: string; yearPublished?: string }>>(new Map());
  const [bulkStep, setBulkStep] = useState<'select' | 'confirm'>('select');
  const [bulkItems, setBulkItems] = useState<Array<{
    id: string; name: string; yearPublished?: string;
    registeredGame?: BoardGame;
    expansionType?: 'expansion' | 'series' | 'legacy';
    parentGameId?: string;
  }>>([]);
  const [loadingBulk, setLoadingBulk] = useState(false);

  // BGG 컬렉션 불러오기
  const [showBggImport, setShowBggImport] = useState(false);
  const [bggUsername, setBggUsername] = useState('');
  const [bggCollection, setBggCollection] = useState<{bggId:string;name:string;yearPublished:string;thumbnail:string}[]>([]);
  const [bggImportLoading, setBggImportLoading] = useState(false);
  const [bggImportSelected, setBggImportSelected] = useState<Set<string>>(new Set());
  const [bggImportProgress, setBggImportProgress] = useState<{done:number;total:number;current:string} | null>(null);

  // 엑셀 일괄등록
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelGames, setExcelGames] = useState<{name:string;matched?:{id:string;name:string};status:'pending'|'searching'|'found'|'notfound'|'owned'}[]>([]);
  const [excelImportProgress, setExcelImportProgress] = useState<{done:number;total:number;phase:'search'|'register'} | null>(null);

  // Reset when dialog closes / init when opens
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      setFormData({
        imageUrl: '',
        koreanName: '',
        englishName: '',
        recommendedPlayers: '',
        playTime: '',
        difficulty: '',
        videoUrl: '',
        isExpansion: false,
        parentGameId: '',
        languageEdition: undefined,
        quantity: 1,
        bggId: '',
      });
      setIsManualEntry(false);
      setBulkMode(false); setSelectedBulkIds(new Set()); setSelectedGameMap(new Map()); setBulkStep('select'); setBulkItems([]);
    } else if (initialQuery) {
      // 확장 추가 모드: 검색어 미리 채우기, 본판만 미리 선택 (isExpansion 체크 안 함)
      setSearchQuery(initialQuery);
      if (initialParentGameId) {
        setFormData(prev => ({ ...prev, parentGameId: initialParentGameId }));
      }
    }
  }, [open]);

  // Load all registered games when dialog opens
  useEffect(() => {
    if (open) {
      loadAllRegisteredGames();
    }
  }, [open]);

  const loadAllRegisteredGames = async () => {
    try {
      console.log('🎮 [AddGame] Loading all registered games...');
      
      // Public endpoint - no authentication needed
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/all-games`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      console.log('📡 [AddGame] Response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [AddGame] Loaded:', data.games?.length || 0, 'games');
        console.log('📋 [AddGame] All games:', data.games?.map((g: BoardGame) => ({
          id: g.id,
          korean: g.koreanName,
          english: g.englishName
        })));
        
        if (data.error) {
          console.error('Server error:', data.error);
        }
        
        setAllRegisteredGames(data.games || []);
      } else {
        const errorData = await response.json();
        console.error('❌ [AddGame] Failed:', response.status, errorData);
      }
    } catch (error) {
      console.error('❌ [AddGame] Error:', error);
    }
  };

  // Auto-search when search query changes
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (searchQuery.length >= 1) {
      const timeout = setTimeout(() => {
        searchBGG(searchQuery);
      }, 500);
      setSearchTimeout(timeout);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchQuery]);

  // ─── BGG 컬렉션 불러오기 ───
  const fetchBggCollection = async () => {
    if (!bggUsername.trim()) { toast.error('BGG 사용자명을 입력해주세요'); return; }
    setBggImportLoading(true);
    setBggCollection([]);
    setBggImportSelected(new Set());
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg/collection/${encodeURIComponent(bggUsername.trim())}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'BGG 컬렉션 로드 실패');
      const existing = new Set(existingGames.map((g: any) => g.bggId).filter(Boolean));
      const filtered = (data.games || []).filter((g: any) => !existing.has(g.bggId));
      setBggCollection(filtered);
      if (filtered.length === 0) toast.info('새로 추가할 게임이 없어요 (이미 모두 등록됨)');
      else toast.success(`${filtered.length}개 게임을 불러왔어요`);
    } catch (e: any) { toast.error(e.message); }
    setBggImportLoading(false);
  };

  const bggImportSelectAll = () => {
    if (bggImportSelected.size === bggCollection.length) setBggImportSelected(new Set());
    else setBggImportSelected(new Set(bggCollection.map(g => g.bggId)));
  };

  const runBggImport = async () => {
    const selected = bggCollection.filter(g => bggImportSelected.has(g.bggId));
    if (selected.length === 0) { toast.error('게임을 선택해주세요'); return; }
    setBggImportProgress({ done: 0, total: selected.length, current: '' });
    const added: any[] = [];
    for (let i = 0; i < selected.length; i++) {
      const g = selected[i];
      setBggImportProgress({ done: i, total: selected.length, current: g.name });
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ id: g.bggId }),
        });
        if (res.ok) {
          const d = await res.json();
          added.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(7)}_${g.bggId}`,
            koreanName: '',
            englishName: d.name || g.name,
            imageUrl: d.imageUrl || g.thumbnail || '',
            bggId: g.bggId,
            recommendedPlayers: d.minPlayers && d.maxPlayers ? `${d.minPlayers}-${d.maxPlayers}명` : '',
            playTime: d.maxPlayTime ? `${d.maxPlayTime}분` : '',
            difficulty: d.complexity > 0 ? `${d.complexity.toFixed(1)}` : '',
            rating: d.rating || undefined,
            videoUrl: '',
            isExpansion: false,
            quantity: 1,
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    setBggImportProgress({ done: selected.length, total: selected.length, current: '' });
    if (added.length > 0) {
      if (onAddGames) onAddGames(added);
      else added.forEach((g: any) => onAddGame(g));
      toast.success(`${added.length}개 게임이 추가됐어요!`);
    }
    setBggImportProgress(null);
    setShowBggImport(false);
    onOpenChange(false);
  };

  // ─── 엑셀 일괄등록 ───
  const handleExcelFile = async (file: File) => {
    try {
      // xlsx 없이 직접 파싱 (CSV + 텍스트 파일 지원)
      const text = await file.text();
      const names: string[] = [];

      if (file.name.endsWith('.csv') || file.type === 'text/csv' || !file.name.match(/\.xlsx?$/i)) {
        // CSV / 텍스트 파일: 줄 단위로 파싱
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const cell = line.split(',')[0].replace(/^"|"$/g, '').trim();
          if (cell && cell.length > 0 && cell !== '게임명' && cell !== '제목' && cell !== 'name' && cell !== 'Name') names.push(cell);
        }
      } else {
        // xlsx/xls 파일: SheetJS CDN으로 로드
        const XLSX: any = await new Promise((resolve, reject) => {
          if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = () => resolve((window as any).XLSX);
          s.onerror = () => reject(new Error('SheetJS 로드 실패'));
          document.head.appendChild(s);
        });
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        for (const row of rows) {
          const cell = (row[0] || row[1] || '').toString().trim();
          if (cell && cell.length > 0 && cell !== '게임명' && cell !== '제목') names.push(cell);
        }
      }
      if (names.length === 0) { toast.error('게임 이름을 찾을 수 없어요. A열에 게임명을 입력해주세요'); return; }

      // ★ 보유 중인 게임 빠른 조회용 Set (bggId + 이름 모두 등록)
      const ownedBggIds  = new Set(existingGames.map((g: any) => g.bggId).filter(Boolean));
      const ownedNames   = new Set(existingGames.map((g: any) => (g.koreanName || g.englishName || '').toLowerCase()));

      // ★ 중복 이름 제거만 하고 보유 여부는 배지로 표시 (필터링 X)
      const uniqueNames = [...new Set(names)];
      const updated = uniqueNames.map(name => ({ name, status: 'pending' as const }));
      setExcelGames(updated);
      setShowExcelImport(true);
      setExcelImportProgress({ done: 0, total: updated.length, phase: 'search' });

      // ★ 배치 병렬 처리 (3개씩 동시 검색)
      const BATCH = 3;
      let doneCount = 0;
      for (let i = 0; i < updated.length; i += BATCH) {
        const batch = updated.slice(i, i + BATCH);
        await Promise.all(batch.map(async (item, bi) => {
          const idx = i + bi;
          updated[idx] = { ...updated[idx], status: 'searching' };
          try {
            const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
              body: JSON.stringify({ query: item.name }),
            });
            if (res.ok) {
              const results = await res.json();
              if (results.length > 0) {
                const match = results[0];
                // ★ 매칭 후 보유 여부 판단: bggId 일치 OR 이름(대소문자 무시) 일치
                const isOwned = ownedBggIds.has(match.id) || ownedNames.has(item.name.toLowerCase());
                updated[idx] = { ...updated[idx], status: isOwned ? 'owned' : 'found', matched: match };
              } else {
                updated[idx] = { ...updated[idx], status: 'notfound' };
              }
            } else { updated[idx] = { ...updated[idx], status: 'notfound' }; }
          } catch { updated[idx] = { ...updated[idx], status: 'notfound' }; }
          doneCount++;
        }));
        setExcelGames([...updated]);
        setExcelImportProgress({ done: doneCount, total: updated.length, phase: 'search' });
        if (i + BATCH < updated.length) await new Promise(r => setTimeout(r, 200));
      }
      setExcelImportProgress(null);
    } catch (e: any) { toast.error('파일 읽기 실패: ' + e.message); }
  };

  // 미매칭 목록 CSV 다운로드
  const downloadUnmatchedCSV = () => {
    const notfound = excelGames.filter(g => g.status === 'notfound');
    if (notfound.length === 0) { toast.error('미매칭 게임이 없어요'); return; }
    const csv = '게임명\n' + notfound.map(g => `"${g.name.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `미매칭_게임목록_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runExcelImport = async () => {
    const found = excelGames.filter(g => g.status === 'found' && g.matched);
    if (found.length === 0) { toast.error('매칭된 게임이 없어요'); return; }
    setExcelImportProgress({ done: 0, total: found.length, phase: 'register' });
    const added: any[] = [];
    for (let i = 0; i < found.length; i++) {
      const g = found[i];
      setExcelImportProgress({ done: i, total: found.length, phase: 'register' });
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ id: g.matched!.id }),
        });
        if (res.ok) {
          const d = await res.json();
          added.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(7)}_${g.matched!.id}`,
            koreanName: '',
            englishName: d.name || g.name,
            imageUrl: d.imageUrl || '',
            bggId: g.matched!.id,
            recommendedPlayers: d.minPlayers && d.maxPlayers ? `${d.minPlayers}-${d.maxPlayers}명` : '',
            playTime: d.maxPlayTime ? `${d.maxPlayTime}분` : '',
            difficulty: d.complexity > 0 ? `${d.complexity.toFixed(1)}` : '',
            rating: d.rating || undefined,
            videoUrl: '',
            isExpansion: false,
            quantity: 1,
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    setExcelImportProgress({ done: found.length, total: found.length, phase: 'register' });
    if (added.length > 0) {
      if (onAddGames) onAddGames(added);
      else added.forEach((g: any) => onAddGame(g));
      toast.success(`${added.length}개 게임이 추가됐어요!`);
    }
    setExcelImportProgress(null);
    setShowExcelImport(false);
    setExcelGames([]);
    onOpenChange(false);
  };

  const searchBGG = async (query: string) => {
    setSearching(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'BGG 검색 실패');
      }

      const results: BGGSearchResult[] = await response.json();

      // site 게임(source==='site')은 filteredRegisteredGames 섹션에서 이미 표시되므로 제외
      // bggId 또는 이름으로 allRegisteredGames와 겹치는 것도 제외
      const filteredResults = results.filter(bggGame => {
        if (bggGame.source === 'site') return false;
        const bggName = (bggGame.koreanName || bggGame.name || '').toLowerCase().trim();
        const bggEn = (bggGame.englishName || bggGame.name || '').toLowerCase().trim();
        return !allRegisteredGames.some(registered => {
          const rKo = (registered.koreanName || '').toLowerCase().trim();
          const rEn = (registered.englishName || '').toLowerCase().trim();
          return (
            (registered.bggId && (registered.bggId === bggGame.id || registered.bggId === bggGame.bggId)) ||
            (rKo && (bggName === rKo || bggEn === rKo)) ||
            (rEn && (bggName === rEn || bggEn === rEn))
          );
        });
      });

      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      const seenIds = new Set<string>(), seenNames = new Set<string>();
      const dedupedResults = filteredResults.filter(g => {
        if (seenIds.has(g.id)) return false;
        const nKo = norm(g.koreanName || (g.source !== 'bgg' ? g.name : '') || '');
        const nEn = norm(g.englishName || (g.source === 'bgg' ? g.name : '') || '');
        const nameKey = nKo || nEn;
        if (nameKey && seenNames.has(nameKey)) { seenIds.add(g.id); return false; }
        seenIds.add(g.id);
        if (nKo) seenNames.add(nKo);
        if (nEn) seenNames.add(nEn);
        return true;
      });

      setSearchResults(dedupedResults.slice(0, 20));
      setShowResults(dedupedResults.length > 0);
    } catch (error) {
      console.error('BGG search error:', error);
      toast.error(`BGG 검색 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setSearching(false);
    }
  };

  // 등록된 게임에서 검색 (서버 전체 목록 + 현재 유저 보유 게임 합산)
  const getFilteredRegisteredGames = () => {
    if (!searchQuery || searchQuery.length === 0) return [];

    // 현재 유저 보유 게임을 합산 (직접등록 게임 포함 보장)
    const combined = [...allRegisteredGames];
    for (const g of existingGames) {
      const alreadyIn = combined.some(r => r.id === g.id || (r.bggId && g.bggId && r.bggId === g.bggId));
      if (!alreadyIn) combined.push(g);
    }

    const query = searchQuery.toLowerCase();
    const filtered = combined.filter(game => {
      const koreanMatch = game.koreanName?.toLowerCase().includes(query);
      const englishMatch = game.englishName?.toLowerCase().includes(query);
      const nameMatch = (game as any).name?.toLowerCase().includes(query);
      return koreanMatch || englishMatch || nameMatch;
    });

    // 중복 제거: 한국어명이 같으면 영문명이 있는 버전 우선
    const uniqueGamesMap = new Map();
    for (const game of filtered) {
      const uniqueKey = (game.koreanName || game.englishName || '').toLowerCase().trim();
      if (!uniqueKey) continue;
      const existing = uniqueGamesMap.get(uniqueKey);
      if (!existing) {
        uniqueGamesMap.set(uniqueKey, game);
      } else {
        const existingHasEnglish = !!(existing.englishName && existing.englishName.trim());
        const newHasEnglish = !!(game.englishName && game.englishName.trim());
        if (newHasEnglish && !existingHasEnglish) uniqueGamesMap.set(uniqueKey, game);
      }
    }

    return Array.from(uniqueGamesMap.values()).slice(0, 15);
  };

  const filteredRegisteredGames = getFilteredRegisteredGames();

  // 등록된 게임 선택 시 정보 복사
  const handleSelectRegisteredGame = (game: BoardGame) => {
    setFormData({
      imageUrl: game.imageUrl || '',
      koreanName: game.koreanName || '',
      englishName: game.englishName || '',
      recommendedPlayers: game.recommendedPlayers || '',
      playTime: game.playTime || '',
      difficulty: game.difficulty || '',
      videoUrl: game.videoUrl || '',
      isExpansion: game.isExpansion || false,
      expansionType: (game as any).expansionType || '' as '' | 'expansion' | 'series' | 'legacy',
      parentGameId: game.parentGameId || initialParentGameId || '',
      languageEdition: game.languageEdition,
      quantity: 1,
      bggId: game.bggId || '',
    });
    
    setShowResults(false);
    toast.success('등록된 게임 정보를 가져왔습니다! 📋');
    setStep(2);
  };

  const handleSelectGame = async (result: BGGSearchResult) => {
    setLoadingDetails(true);
    setShowResults(false);
    
    try {
      // 새로운 서버 API로 상세 정보 가져오기
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ id: result.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '게임 상세 정보를 불러오는데 실패했습니다');
      }

      const details: BGGGameDetails = await response.json();
      console.log('Game details:', details);

      // 인원수 포맷팅 — 가능 인원(min-max) 기준
      let recommendedPlayers = '';
      if (details.minPlayers && details.maxPlayers) {
        if (details.minPlayers === details.maxPlayers) {
          recommendedPlayers = `${details.minPlayers}명`;
        } else {
          recommendedPlayers = `${details.minPlayers}-${details.maxPlayers}명`;
        }
      } else if (details.bestPlayerCount) {
        // min/max 없을 때만 fallback으로 best 사용
        recommendedPlayers = details.bestPlayerCount + '명';
      }

      // 플레이 시간 포맷팅
      let playTime = '';
      if (details.minPlayTime && details.maxPlayTime) {
        if (details.minPlayTime === details.maxPlayTime) {
          playTime = `${details.minPlayTime}분`;
        } else {
          playTime = `${details.minPlayTime}-${details.maxPlayTime}분`;
        }
      } else if (details.maxPlayTime) {
        playTime = `${details.maxPlayTime}분`;
      }

      // 난이도 포맷팅 (1-5 스케일)
      let difficulty = '';
      if (details.complexity > 0) {
        if (details.complexity < 2) {
          difficulty = '초급';
        } else if (details.complexity < 3) {
          difficulty = '중급';
        } else if (details.complexity < 4) {
          difficulty = '중상급';
        } else {
          difficulty = '고급';
        }
        difficulty += ` (${details.complexity.toFixed(1)}/5)`;
      }

      // 검색한 이름을 한국어명에 넣고, 나머지 정보는 BGG에서 가져온 값으로 자동 채우기
      setFormData({
        ...formData,
        koreanName: result.name,
        englishName: '',
        imageUrl: details.imageUrl || '',
        recommendedPlayers: recommendedPlayers,
        playTime: playTime,
        difficulty: difficulty,
        quantity: 1, // 수량 기본값
        bggId: result.id, // BGG ID 저장
      });
      
      toast.success('게임 정보를 자동으로 불러왔습니다! 📋');
      setStep(2);
    } catch (error) {
      console.error('Failed to fetch game details:', error);
      toast.error(`게임 정보 불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      // 실패하면 검색 결과의 이름만이라도 사용
      setFormData({
        ...formData,
        koreanName: result.name,
        englishName: '',
        imageUrl: '',
        quantity: 1, // 수량 기본값
      });
      setStep(2);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('JPEG, PNG, WebP 형식의 이미지만 업로드 가능합니다.');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '이미지 업로드 실패');
      }

      const data = await response.json();
      setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));
      toast.success('이미지가 업로드되었습니다!');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error(`이미지 업로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleBulkNext = () => {
    // selectedGameMap 기반으로 — 현재 검색 결과에 없는 게임도 포함
    const items: typeof bulkItems = [];
    for (const id of Array.from(selectedBulkIds)) {
      if (id.startsWith('reg_')) {
        // 보드라움 등록 게임: filteredRegisteredGames 또는 allRegisteredGames에서 찾기
        const realId = id.slice(4);
        const game = filteredRegisteredGames.find(g => g.id === realId)
          || allRegisteredGames.find(g => g.id === realId);
        if (game) {
          items.push({ id, name: game.koreanName || game.englishName || '', registeredGame: game });
        } else {
          // 현재 결과에 없어도 selectedGameMap에서 이름이라도 사용
          const info = selectedGameMap.get(id);
          if (info) items.push({ id, name: info.name });
        }
      } else {
        // BGG 게임: searchResults에 있으면 사용, 없으면 selectedGameMap에서
        const r = searchResults.find(r => r.id === id);
        if (r) {
          items.push({ id: r.id, name: r.name, yearPublished: r.yearPublished });
        } else {
          const info = selectedGameMap.get(id);
          if (info) items.push({ id, name: info.name, yearPublished: info.yearPublished });
        }
      }
    }
    setBulkItems(items);
    setBulkStep('confirm');
  };
  const handleBulkRegister = async () => {
    setLoadingBulk(true);
    const newGames: BoardGame[] = [];
    for (const item of bulkItems) {
      try {
        let newGame: BoardGame;
        if (item.registeredGame) {
          newGame = { ...item.registeredGame, id: Date.now() + '_' + Math.random().toString(36).slice(2), isExpansion: !!item.expansionType, expansionType: item.expansionType || undefined, parentGameId: item.expansionType ? item.parentGameId : undefined, createdAt: new Date().toISOString() };
        } else {
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` }, body: JSON.stringify({ id: item.id }) });
          const d = res.ok ? await res.json() : {};
          const rp = d.minPlayers && d.maxPlayers ? (d.minPlayers === d.maxPlayers ? d.minPlayers + '명' : d.minPlayers + '-' + d.maxPlayers + '명') : (d.bestPlayerCount ? d.bestPlayerCount + '명' : '');
          newGame = { id: Date.now() + '_' + Math.random().toString(36).slice(2) + '_' + item.id, koreanName: item.name, englishName: item.name, recommendedPlayers: rp, playTime: d.playTime ? d.playTime + '분' : '', difficulty: d.complexity ? String(Math.round(d.complexity * 10) / 10) : '', imageUrl: d.imageUrl || '', videoUrl: '', bggId: item.id, isExpansion: !!item.expansionType, expansionType: item.expansionType || undefined, parentGameId: item.expansionType ? item.parentGameId : undefined, createdAt: new Date().toISOString(), quantity: 1 };
          await new Promise(r => setTimeout(r, 150));
        }
        newGames.push(newGame);
      } catch (e) { toast.error(item.name + ' 등록 실패'); }
    }
    setLoadingBulk(false);
    if (newGames.length > 0) {
      if (onAddGames) { onAddGames(newGames); } else { newGames.forEach(g => onAddGame(g)); }
    }
    toast.success(newGames.length + '개 게임이 등록되었습니다');
    onOpenChange(false);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newGame: BoardGame = {
      id: Date.now().toString(),
      ...formData,
      isExpansion: !!formData.expansionType,
      expansionType: formData.expansionType || undefined,
      parentGameId: formData.expansionType ? formData.parentGameId : undefined,
      createdAt: new Date().toISOString(),
    };

    onAddGame(newGame);
    onOpenChange(false);
    
    // Reset form
    setFormData({
      imageUrl: '',
      koreanName: '',
      englishName: '',
      recommendedPlayers: '',
      playTime: '',
      difficulty: '',
      videoUrl: '',
      isExpansion: false,
      expansionType: '' as '' | 'expansion' | 'series' | 'legacy',
      parentGameId: '',
      languageEdition: undefined,
      quantity: 1, // 수량 초기화
      bggId: '', // BGG ID 초기화
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }}
        onInteractOutside={(e) => { if (showBggImport || showExcelImport) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (showBggImport || showExcelImport) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>게임 추가 {step === 1 ? '(1/3)' : step === 2 ? '(2/3)' : '(3/3)'}</DialogTitle>
          <DialogDescription>
            {step === 1 && 'BoardGameGeek에서 게임을 검색하세요'}
            {step === 2 && '게임 정보를 확인하세요'}
            {step === 3 && '규칙 영상 URL을 입력하세요'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: 검색 */}
        {step === 1 && (
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* BGG 컬렉션 + 엑셀 등록 버튼 */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setShowBggImport(true); setBggCollection([]); setBggImportSelected(new Set()); }}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-900 hover:bg-gray-50 transition-all group">
                <Library className="w-4 h-4 text-gray-400 group-hover:text-gray-700" />
                <span className="text-sm font-semibold text-gray-600 group-hover:text-gray-900">BGG 컬렉션</span>
              </button>
              <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-900 hover:bg-gray-50 transition-all group cursor-pointer">
                <FileSpreadsheet className="w-4 h-4 text-gray-400 group-hover:text-gray-700" />
                <span className="text-sm font-semibold text-gray-600 group-hover:text-gray-900">엑셀 등록</span>
                <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e => { if (e.target.files?.[0]) handleExcelFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
            </div>

            {/* 직접 등록 버튼 - 상단에 눈에 띄게 배치 */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">BGG에 없는 게임인가요?</h4>
                  <p className="text-sm text-blue-700">
                    직접 게임 정보를 입력하여 등록할 수 있습니다
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setIsManualEntry(true);
                    setStep(2);
                    toast.info('직접 등록 모드로 전환되었습니다');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  직접 등록
                </Button>
              </div>
            </div>

            {/* 구분선 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">또는 BGG에서 검색</span>
              </div>
            </div>
            
            <div className="space-y-2 relative">
              <Label htmlFor="search">게임 검색</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="search"
                  placeholder="게임 이름을 입력하세요 (예: Catan)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
              
              <p className="text-sm text-gray-500">
                💡 1글자만 입력해도 BoardGameGeek에서 검색됩니다
              </p>
            </div>

            {/* 선택 대기열 */}
            {selectedBulkIds.size > 0 && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-700">📋 등록 대기열 ({selectedBulkIds.size}개)</span>
                  <button type="button" onClick={() => { setSelectedBulkIds(new Set()); setSelectedGameMap(new Map()); setBulkMode(false); }}
                    className="text-xs text-gray-400 hover:text-gray-600">전체 취소</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedBulkIds).map(id => {
                    const info = selectedGameMap.get(id);
                    if (!info) return null;
                    return (
                      <div key={id} className="flex items-center gap-1 bg-white border border-cyan-200 rounded-full pl-1 pr-2 py-0.5">
                        {info.thumbnail && <img src={info.thumbnail.startsWith('//') ? 'https:' + info.thumbnail : info.thumbnail} className="w-5 h-5 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
                        <span className="text-xs font-medium text-gray-800 max-w-[80px] truncate">{info.name}</span>
                        <button type="button" onClick={() => {
                          const s = new Set(selectedBulkIds); s.delete(id);
                          const m = new Map(selectedGameMap); m.delete(id);
                          setSelectedBulkIds(s); setSelectedGameMap(m);
                          if (s.size === 0) setBulkMode(false);
                        }} className="text-gray-400 hover:text-red-500 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 통합 검색 결과 - 보드라움 등록 게임 + BGG 결과 */}
            {(filteredRegisteredGames.length > 0 || searchResults.length > 0) && (
              <div className="space-y-2">
                <Label>검색 결과</Label>
                <div className="border border-gray-200 rounded-lg divide-y max-h-72 overflow-y-auto">
                  {/* 보드라움 등록 게임 먼저 */}
                  {filteredRegisteredGames.map((game) => {
                    const isSelected = selectedBulkIds.has("reg_" + game.id);
                    return (
                      <div key={"reg_" + game.id} className="px-4 py-3 flex items-center gap-3 hover:bg-cyan-50 transition-colors">
                        {game.imageUrl
                          ? <img src={game.imageUrl} className="w-10 h-10 object-cover rounded-xl flex-shrink-0" />
                          : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSelectRegisteredGame(game)}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-900">{game.koreanName || game.englishName}</span>
                            <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full flex-shrink-0">보드라움</span>
                          </div>
                          {game.koreanName && game.englishName && <div className="text-sm text-gray-500">{game.englishName}</div>}
                        </div>
                        <button type="button"
                          onClick={() => {
                            const s = new Set(selectedBulkIds); const m = new Map(selectedGameMap);
                            const key = "reg_" + game.id;
                            if (isSelected) { s.delete(key); m.delete(key); }
                            else { s.add(key); m.set(key, { name: game.koreanName || game.englishName, thumbnail: game.imageUrl || '' }); }
                            setSelectedBulkIds(s); setSelectedGameMap(m); if (!bulkMode) setBulkMode(true);
                          }}
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-cyan-500 hover:text-white'}`}>
                          {isSelected ? <span className="text-xs font-bold">✓</span> : <Plus className="w-4 h-4" />}
                        </button>
                      </div>
                    );
                  })}
                  {/* BGG 결과 */}
                  {searchResults.map((result) => {
                    const isSelected = selectedBulkIds.has(result.id);
                    const thumb = result.thumbnail ? (result.thumbnail.startsWith('//') ? 'https:' + result.thumbnail : result.thumbnail) : '';
                    return (
                      <div key={result.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        {thumb
                          ? <img src={thumb} className="w-10 h-10 object-cover rounded-xl flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSelectGame(result)}>
                          <div className="font-medium text-gray-900">{result.name}</div>
                          {result.yearPublished && <div className="text-sm text-gray-500">({result.yearPublished})</div>}
                        </div>
                        <button type="button"
                          onClick={() => {
                            const s = new Set(selectedBulkIds); const m = new Map(selectedGameMap);
                            if (isSelected) { s.delete(result.id); m.delete(result.id); }
                            else { s.add(result.id); m.set(result.id, { name: result.name, thumbnail: thumb, yearPublished: result.yearPublished }); }
                            setSelectedBulkIds(s); setSelectedGameMap(m); if (!bulkMode) setBulkMode(true);
                          }}
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-cyan-500 hover:text-white'}`}>
                          {isSelected ? <span className="text-xs font-bold">✓</span> : <Plus className="w-4 h-4" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400">💡 게임 이름 클릭 → 정보 확인 후 등록 / + 버튼 → 여러 개 선택 후 일괄 등록</p>
              </div>
            )}

            {searching && searchResults.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>검색 중...</p>
              </div>
            )}

            {loadingDetails && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>게임 정보를 불러오는 중...</p>
              </div>
            )}

            {!searching && searchQuery.length > 0 && searchResults.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>검색 결과가 없습니다</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setIsManualEntry(true);
                    setFormData({ ...formData, koreanName: searchQuery });
                    setStep(2);
                    toast.info('직접 등록 모드로 전환되었습니다');
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  "{searchQuery}" 직접 등록하기
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: 정보 확인 */}
        {step === 2 && (
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="koreanName">한국어명 *</Label>
              <Input
                id="koreanName"
                placeholder="예: 카탄"
                value={formData.koreanName}
                onChange={(e) => setFormData({ ...formData, koreanName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="englishName">영문명</Label>
              <Input
                id="englishName"
                placeholder="예: Catan"
                value={formData.englishName}
                onChange={(e) => setFormData({ ...formData, englishName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">게임 이미지</Label>
              
              {/* 이미지 업로드 버튼 */}
              <div className="flex gap-2">
                <Input
                  id="imageFile"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('imageFile')?.click()}
                  disabled={uploading}
                  className="flex-shrink-0"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      이미지 업로드
                    </>
                  )}
                </Button>
                <span className="text-sm text-gray-500 self-center">또는</span>
                <Input
                  placeholder="이미지 URL 입력"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="flex-1"
                />
              </div>
              
              <p className="text-xs text-gray-500">
                💡 게임 박스 사진을 업로드하거나 URL을 입력하세요 (JPEG, PNG, WebP, 최대 5MB)
              </p>
              
              {formData.imageUrl && (
                <div className="relative inline-block">
                  <img 
                    src={formData.imageUrl} 
                    alt="Game cover" 
                    className="w-full max-w-xs h-auto object-cover rounded border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recommendedPlayers">인원</Label>
                <Input
                  id="recommendedPlayers"
                  placeholder="예: 2-4명"
                  value={formData.recommendedPlayers}
                  onChange={(e) => setFormData({ ...formData, recommendedPlayers: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="playTime">플레이시간</Label>
                <Input
                  id="playTime"
                  placeholder="예: 60-90분"
                  value={formData.playTime}
                  onChange={(e) => setFormData({ ...formData, playTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty">난이도</Label>
                <Input
                  id="difficulty"
                  placeholder="예: 중급"
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                />
              </div>
            </div>

            {/* 확장/시리즈/레거시 옵션 */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium text-gray-700">게임 종류</Label>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: '', label: '일반 게임' },
                  { value: 'expansion', label: '확장판' },
                  { value: 'series', label: '시리즈' },
                  { value: 'legacy', label: '레거시' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData({ ...formData, expansionType: value, parentGameId: value ? formData.parentGameId : '' })}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      formData.expansionType === value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {formData.expansionType && (
                <div className="space-y-2">
                  <Label className="text-sm">본판 게임 선택
                    {formData.parentGameId ? (
                      <span className="ml-2 text-green-600 font-medium text-xs">
                        ✓ {existingGames.find(g => g.id === formData.parentGameId)?.koreanName || '선택됨'}
                      </span>
                    ) : (
                      <span className="ml-1 text-gray-400 text-xs">(선택 안 됨)</span>
                    )}
                  </Label>
                  <ParentGameSearch
                    games={existingGames}
                    selectedId={formData.parentGameId}
                    onSelect={(id) => setFormData({ ...formData, parentGameId: id })}
                    initialQuery={initialQuery}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button 
                type="button" 
                onClick={() => {
                  if (!formData.koreanName) {
                    toast.error('한국어명을 입력해주세요');
                    return;
                  }
                  setStep(3);
                }}
              >
                다음
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: 영상 입력 */}
        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="videoUrl">규칙 설명 영상 URL</Label>
                <Input
                  id="videoUrl"
                  placeholder="https://youtube.com/... (선택사항)"
                  value={formData.videoUrl}
                  onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                />
                <p className="text-sm text-gray-500">
                  💡 유튜브 영상 URL을 입력하면 나중에 바로 확인할 수 있습니다
                </p>
              </div>

              <div className="space-y-2">
                <Label>언어판 (선택사항)</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'korean', label: '한글판' },
                    { value: 'english', label: '영문판' },
                    { value: 'multilingual', label: '다국어판' }
                  ].map((edition) => (
                    <button
                      key={edition.value}
                      type="button"
                      onClick={() => {
                        const newEdition = formData.languageEdition === edition.value 
                          ? undefined 
                          : edition.value as 'korean' | 'english' | 'multilingual';
                        setFormData({ ...formData, languageEdition: newEdition });
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        formData.languageEdition === edition.value
                          ? edition.value === 'korean'
                            ? 'bg-cyan-500 text-white shadow-md'
                            : edition.value === 'english'
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-purple-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {edition.label}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500">
                  💡 게임의 언어판을 선택하세요 (나중에 변경 가능)
                </p>
              </div>

              <div className="space-y-2">
                <Label>보유 수량</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newQuantity = Math.max(1, (formData.quantity || 1) - 1);
                      setFormData({ ...formData, quantity: newQuantity });
                    }}
                    className="h-10 w-10 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={formData.quantity || 1}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setFormData({ ...formData, quantity: Math.min(99, Math.max(1, value)) });
                    }}
                    className="text-center font-semibold text-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newQuantity = Math.min(99, (formData.quantity || 1) + 1);
                      setFormData({ ...formData, quantity: newQuantity });
                    }}
                    className="h-10 w-10 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  💡 같은 게임을 여러 개 보유하고 계신가요? 수량을 설정하세요
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                이전
              </Button>
              <Button type="submit">완료</Button>
            </DialogFooter>
          </form>
        )}
        {/* Step 1 footer */}
        {step === 1 && (!bulkMode || bulkStep === "select") && (
          <DialogFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            {bulkMode && selectedBulkIds.size > 0 && (
              <Button type="button" onClick={handleBulkNext} className="bg-gray-900 text-white hover:bg-gray-700">{selectedBulkIds.size}개 선택 → 다음</Button>
            )}
          </DialogFooter>
        )}

        {/* Bulk 확인 단계 */}
        {step === 1 && bulkMode && bulkStep === "confirm" && (
          <div className="py-4 space-y-4">
            <div><h3 className="font-semibold text-gray-900 mb-1">선택한 게임 {bulkItems.length}개</h3><p className="text-sm text-gray-500">확장판/시리즈/레거시 여부를 선택하고 일괄 등록하세요</p></div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {bulkItems.map((item, idx) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {item.registeredGame?.imageUrl && <img src={item.registeredGame.imageUrl} alt={item.name} className="w-8 h-8 object-cover rounded" />}
                    <div className="font-medium text-gray-900">{item.name}{item.yearPublished && <span className="text-sm text-gray-400 ml-1">({item.yearPublished})</span>}{item.registeredGame && <span className="text-xs text-cyan-600 ml-1">보드라움</span>}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(["none", "expansion", "series", "legacy"] as const).map(type => (
                      <button key={type} type="button" onClick={() => setBulkItems(prev => prev.map((g, i) => i === idx ? { ...g, expansionType: type === "none" ? undefined : type, parentGameId: type === "none" ? undefined : g.parentGameId } : g))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${(type === "none" ? !item.expansionType : item.expansionType === type) ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                        {type === "none" ? "일반" : type === "expansion" ? "확장판" : type === "series" ? "시리즈" : "레거시"}
                      </button>
                    ))}
                  </div>
                  {item.expansionType && (
                    <div><p className="text-xs text-gray-500 mb-1">본판 게임 선택</p><ParentGameSearch games={existingGames} selectedId={item.parentGameId || ""} onSelect={(id) => setBulkItems(prev => prev.map((g, i) => i === idx ? { ...g, parentGameId: id } : g))} /></div>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkStep("select")}>이전</Button>
              <Button type="button" onClick={handleBulkRegister} disabled={loadingBulk} className="bg-gray-900 text-white hover:bg-gray-700">
                {loadingBulk ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" />등록 중...</> : `${bulkItems.length}개 일괄 등록`}
              </Button>
            </DialogFooter>
          </div>
        )}

      {/* ─── BGG 컬렉션 불러오기 모달 (포털로 body에 렌더 → DialogContent transform에 의한 잘림 방지) ─── */}
      {showBggImport && createPortal((
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Library className="w-4 h-4" /> BGG 컬렉션 불러오기</h3>
              <button onClick={() => { setShowBggImport(false); setBggCollection([]); }} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <p className="text-xs text-gray-500 mb-2">BGG 사용자명을 입력하면 보유 컬렉션을 가져와요</p>
              <div className="flex gap-2">
                <input value={bggUsername} onChange={e => setBggUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchBggCollection()}
                  placeholder="BGG 사용자명 (예: Rahdo)"
                  className="flex-1 h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
                <button onClick={fetchBggCollection} disabled={bggImportLoading}
                  className="px-4 h-9 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1.5">
                  {bggImportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  불러오기
                </button>
              </div>
            </div>
            {bggCollection.length > 0 && (
              <>
                <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 flex-shrink-0">
                  <span className="text-xs text-gray-500">{bggImportSelected.size}/{bggCollection.length}개 선택</span>
                  <button onClick={bggImportSelectAll} className="text-xs font-semibold text-gray-700 hover:text-gray-900">
                    {bggImportSelected.size === bggCollection.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {bggCollection.map(g => (
                    <button key={g.bggId} onClick={() => setBggImportSelected(prev => {
                      const next = new Set(prev);
                      next.has(g.bggId) ? next.delete(g.bggId) : next.add(g.bggId);
                      return next;
                    })} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 border-b border-gray-50 transition-colors">
                      {g.thumbnail
                        ? <img src={g.thumbnail} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>
                      }
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{g.name}</p>
                        {g.yearPublished && <p className="text-xs text-gray-400">{g.yearPublished}</p>}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${bggImportSelected.has(g.bggId) ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                        {bggImportSelected.has(g.bggId) && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {bggImportProgress && (
              <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50">
                <div className="flex items-center gap-2 mb-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                  <span className="text-xs text-gray-600 truncate">{bggImportProgress.current || '처리 중...'}</span>
                  <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{bggImportProgress.done}/{bggImportProgress.total}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${(bggImportProgress.done/bggImportProgress.total)*100}%` }} />
                </div>
              </div>
            )}
            <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end gap-2">
              <button onClick={() => { setShowBggImport(false); setBggCollection([]); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">취소</button>
              {bggCollection.length > 0 && (
                <button onClick={runBggImport} disabled={bggImportSelected.size === 0 || !!bggImportProgress}
                  className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50">
                  {bggImportSelected.size > 0 ? `${bggImportSelected.size}개 추가` : '선택 없음'}
                </button>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── 엑셀 일괄등록 모달 ─── */}
      {showExcelImport && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] relative overflow-hidden">

            {/* ── 로딩 오버레이 (검색/등록 중) ── */}
            {excelImportProgress && (
              <div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center gap-5 px-8">
                {/* 아이콘 */}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#F0FDFF' }}>
                  {excelImportProgress.phase === 'search'
                    ? <FileSpreadsheet className="w-8 h-8" style={{ color: '#00BCD4' }} />
                    : <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#00BCD4' }} />
                  }
                </div>
                {/* 제목 */}
                <div className="text-center">
                  <p className="font-bold text-gray-900 text-base mb-1">
                    {excelImportProgress.phase === 'search' ? 'BGG에서 게임 검색 중...' : 'BGG 정보 불러오는 중...'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {excelImportProgress.phase === 'search'
                      ? '3개씩 병렬로 검색하고 있어요'
                      : '게임 상세 정보를 가져오고 있어요'}
                  </p>
                </div>
                {/* 프로그레스 바 */}
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>
                      {excelImportProgress.phase === 'search'
                        ? `${excelImportProgress.done}개 검색됨`
                        : `${excelImportProgress.done}개 등록됨`}
                    </span>
                    <span className="font-semibold" style={{ color: '#00BCD4' }}>
                      {excelImportProgress.done}/{excelImportProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(excelImportProgress.done / excelImportProgress.total) * 100}%`,
                        background: '#00BCD4',
                      }}
                    />
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    {Math.round((excelImportProgress.done / excelImportProgress.total) * 100)}% 완료
                  </p>
                </div>
                {/* 예상 시간 안내 */}
                {excelImportProgress.phase === 'search' && excelImportProgress.total > 50 && (
                  <p className="text-xs text-gray-400 text-center">
                    💡 수량이 많아 시간이 걸릴 수 있어요. 창을 닫지 마세요.
                  </p>
                )}
              </div>
            )}

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" style={{ color: '#00BCD4' }} /> 엑셀 일괄등록
              </h3>
              <button
                onClick={() => { if (!excelImportProgress) { setShowExcelImport(false); setExcelGames([]); } }}
                disabled={!!excelImportProgress}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto">
              {excelGames.map((g, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{g.name}</p>
                    {g.matched && <p className="text-xs text-gray-400 truncate">→ {g.matched.name}</p>}
                  </div>
                  <div className="flex-shrink-0">
                    {g.status === 'searching' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {g.status === 'found'    && <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">매칭됨</span>}
                    {g.status === 'owned'    && <span className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">보유중</span>}
                    {g.status === 'notfound' && <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">미매칭</span>}
                    {g.status === 'pending'  && <span className="text-xs text-gray-400">대기</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* 하단 버튼 */}
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    매칭 {excelGames.filter(g=>g.status==='found').length}개
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#00BCD4' }} />
                    보유중 {excelGames.filter(g=>g.status==='owned').length}개
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    미매칭 {excelGames.filter(g=>g.status==='notfound').length}개
                  </span>
                </div>
                {/* 미매칭 CSV 다운로드 */}
                {excelGames.filter(g=>g.status==='notfound').length > 0 && !excelImportProgress && (
                  <button
                    onClick={downloadUnmatchedCSV}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: '#B2EBF2', color: '#00BCD4', background: '#F0FDFF' }}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    미매칭 목록 다운로드
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { if (!excelImportProgress) { setShowExcelImport(false); setExcelGames([]); } }}
                  disabled={!!excelImportProgress}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl disabled:opacity-30"
                >
                  취소
                </button>
                <button
                  onClick={runExcelImport}
                  disabled={excelGames.filter(g=>g.status==='found').length === 0 || !!excelImportProgress}
                  className="flex-1 px-5 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors"
                  style={{ background: '#00BCD4' }}
                >
                  신규 {excelGames.filter(g=>g.status==='found').length}개 등록하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </DialogContent>
    </Dialog>
  );
}