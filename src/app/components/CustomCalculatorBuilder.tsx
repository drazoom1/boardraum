import { useState } from 'react';
import { X, Plus, Trash2, ChevronRight, GripVertical, ChevronDown } from 'lucide-react';
import { BoardGame } from '../App';

export interface SubItem {
  id: string;
  name: string;
  description: string;
}

export interface CalcItem {
  id: string;
  name: string;
  description: string;
  subItems?: SubItem[]; // 부가항목
}

export interface CustomCalculator {
  id: string;
  gameId: string;
  gameName: string;
  gameImage?: string;
  title: string;
  items: CalcItem[];
  createdAt: string;
  shareRequested: boolean;
  approved: boolean;
}

interface Props {
  ownedGames: BoardGame[];
  onSave: (calc: CustomCalculator) => void;
  onClose: () => void;
  editCalc?: CustomCalculator;
}

const MAX_ITEMS = 100;
const MAX_SUB_ITEMS = 20;

export function CustomCalculatorBuilder({ ownedGames, onSave, onClose, editCalc }: Props) {
  const baseGames = ownedGames.filter(g => !g.isExpansion);
  const [step, setStep] = useState<'game' | 'build'>(editCalc ? 'build' : 'game');
  const [selectedGame, setSelectedGame] = useState<BoardGame | null>(
    editCalc ? baseGames.find(g => g.id === editCalc.gameId) || null : null
  );
  const [title, setTitle] = useState(editCalc?.title || '');
  const [items, setItems] = useState<CalcItem[]>(
    editCalc?.items || [{ id: '1', name: '', description: '', subItems: [] }]
  );
  const [shareRequested, setShareRequested] = useState(editCalc?.shareRequested || false);
  const [search, setSearch] = useState('');
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const filteredGames = baseGames.filter(g =>
    !search.trim() ||
    (g.koreanName || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.englishName || '').toLowerCase().includes(search.toLowerCase())
  );

  // 메인 항목
  const addItem = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems(p => [...p, { id: Date.now().toString(), name: '', description: '', subItems: [] }]);
  };
  const removeItem = (id: string) => {
    if (items.length > 1) setItems(p => p.filter(i => i.id !== id));
  };
  const updateItem = (id: string, field: 'name' | 'description', value: string) =>
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i));

  // 부가항목
  const toggleSubs = (id: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const addSubItem = (parentId: string) => {
    setItems(p => p.map(item => {
      if (item.id !== parentId) return item;
      const subs = item.subItems || [];
      if (subs.length >= MAX_SUB_ITEMS) return item;
      return { ...item, subItems: [...subs, { id: Date.now().toString(), name: '', description: '' }] };
    }));
  };
  const removeSubItem = (parentId: string, subId: string) => {
    setItems(p => p.map(item =>
      item.id !== parentId ? item
        : { ...item, subItems: (item.subItems || []).filter(s => s.id !== subId) }
    ));
  };
  const updateSubItem = (parentId: string, subId: string, field: 'name' | 'description', value: string) => {
    setItems(p => p.map(item =>
      item.id !== parentId ? item
        : { ...item, subItems: (item.subItems || []).map(s => s.id === subId ? { ...s, [field]: value } : s) }
    ));
  };

  const handleSelectGame = (game: BoardGame) => {
    setSelectedGame(game);
    if (!title) setTitle(`${game.koreanName || game.englishName} 계산기`);
    setStep('build');
  };

  const handleSave = () => {
    if (!selectedGame) return;
    const validItems = items.filter(i => i.name.trim()).map(i => ({
      ...i,
      subItems: (i.subItems || []).filter(s => s.name.trim()),
    }));
    if (!validItems.length) return;
    onSave({
      id: editCalc?.id || Date.now().toString(),
      gameId: selectedGame.id,
      gameName: selectedGame.koreanName || selectedGame.englishName || '',
      gameImage: selectedGame.imageUrl,
      title: title.trim() || `${selectedGame.koreanName} 계산기`,
      items: validItems,
      createdAt: editCalc?.createdAt || new Date().toISOString(),
      shareRequested,
      approved: editCalc?.approved || false,
    });
  };

  const validCount = items.filter(i => i.name.trim()).length;

  // ── STEP 1: 게임 선택 ──
  if (step === 'game') {
    return (
      <div className="fixed inset-0 bg-black/70 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-base font-bold text-gray-900">어떤 게임의 계산기를 만들까요?</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 flex-shrink-0">
            <input type="text" placeholder="게임 검색..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-cyan-400" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
            {filteredGames.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">검색 결과가 없어요</p>
              : filteredGames.map(g => (
                <button key={g.id} onClick={() => handleSelectGame(g)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-cyan-50 rounded-xl border border-transparent hover:border-cyan-200 transition-colors text-left">
                  {g.imageUrl
                    ? <img src={g.imageUrl} alt={g.koreanName} className="w-11 h-11 object-cover rounded-lg flex-shrink-0" />
                    : <div className="w-11 h-11 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">🎲</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-sm">{g.koreanName}</p>
                    {g.englishName && <p className="text-xs text-gray-400 truncate">{g.englishName}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))
            }
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: 빌드 ──
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto pb-28">
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm z-10">
            <button onClick={() => setStep('game')} className="text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {selectedGame?.imageUrl && <img src={selectedGame.imageUrl} className="w-7 h-7 rounded-md object-cover flex-shrink-0" />}
              <span className="text-sm font-bold text-gray-900 truncate">{selectedGame?.koreanName}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
          </div>

          <div className="px-4 pt-5 space-y-4">
            {/* 계산기 이름 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">계산기 이름</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="예: 아그리콜라 점수 계산기"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
            </div>

            {/* 점수 항목 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">점수 항목</label>
                <span className={`text-xs font-medium ${items.length >= MAX_ITEMS ? 'text-red-400' : 'text-gray-400'}`}>
                  {validCount} / {MAX_ITEMS}개
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => {
                  const subsOpen = expandedSubs.has(item.id);
                  const subCount = (item.subItems || []).filter(s => s.name.trim()).length;
                  return (
                    <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* 메인 항목 행 */}
                      <div className="flex items-center gap-2 p-2.5 bg-gray-50">
                        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                          placeholder={`항목 ${idx + 1}`}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-400 bg-white" />
                        {/* 설명 버튼 */}
                        <button onClick={() => setEditingDesc(editingDesc === item.id ? null : item.id)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs transition-colors ${
                            item.description.trim() ? 'bg-cyan-100 text-cyan-600' : 'bg-white border border-gray-200 text-gray-400 hover:bg-cyan-50 hover:text-cyan-500'
                          }`} title="설명">?</button>
                        {/* 부가항목 토글 */}
                        <button onClick={() => { toggleSubs(item.id); if (!subsOpen) { /* 처음 열 때 자동 추가 안함 */ } }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs transition-colors ${
                            subCount > 0 ? 'bg-purple-100 text-purple-600' : 'bg-white border border-gray-200 text-gray-400 hover:bg-purple-50 hover:text-purple-500'
                          }`} title="부가항목">
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${subsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(item.id)}
                            className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-red-300 hover:bg-red-50 hover:text-red-400 flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 설명 입력 */}
                      {editingDesc === item.id && (
                        <div className="px-3 pb-2.5 pt-1 bg-gray-50">
                          <input type="text" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                            placeholder="설명 (예: 개당 1점씩)" autoFocus
                            className="w-full border border-cyan-200 bg-cyan-50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-400" />
                        </div>
                      )}

                      {/* 부가항목 영역 */}
                      {subsOpen && (
                        <div className="border-t border-gray-100 bg-white px-3 py-2.5 space-y-2">
                          <p className="text-xs font-semibold text-purple-500">부가항목 <span className="text-gray-400 font-normal">({subCount}/{MAX_SUB_ITEMS})</span></p>
                          {(item.subItems || []).map((sub, si) => (
                            <div key={sub.id} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-300" />
                                </div>
                                <input type="text" value={sub.name} onChange={e => updateSubItem(item.id, sub.id, 'name', e.target.value)}
                                  placeholder={`부가항목 ${si + 1}`}
                                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400" />
                                <button onClick={() => setEditingDesc(`${item.id}-${sub.id}`)}
                                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0 transition-colors ${
                                    sub.description.trim() ? 'bg-cyan-100 text-cyan-600' : 'bg-gray-100 text-gray-400 hover:bg-cyan-50'
                                  }`}>?</button>
                                <button onClick={() => removeSubItem(item.id, sub.id)}
                                  className="w-6 h-6 rounded-md bg-gray-100 text-red-300 hover:bg-red-50 hover:text-red-400 flex items-center justify-center flex-shrink-0">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              {editingDesc === `${item.id}-${sub.id}` && (
                                <div className="ml-5">
                                  <input type="text" value={sub.description} onChange={e => updateSubItem(item.id, sub.id, 'description', e.target.value)}
                                    placeholder="설명" autoFocus
                                    className="w-full border border-cyan-200 bg-cyan-50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-400" />
                                </div>
                              )}
                            </div>
                          ))}
                          {(item.subItems || []).length < MAX_SUB_ITEMS && (
                            <button onClick={() => addSubItem(item.id)}
                              className="w-full py-1.5 border border-dashed border-purple-200 rounded-lg text-xs text-purple-400 hover:border-purple-400 hover:text-purple-500 flex items-center justify-center gap-1 transition-colors">
                              <Plus className="w-3 h-3" /> 부가항목 추가
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {items.length < MAX_ITEMS ? (
                <button onClick={addItem}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-cyan-300 hover:text-cyan-500 flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" /> 항목 추가
                </button>
              ) : (
                <p className="text-center text-xs text-red-400 py-2">최대 {MAX_ITEMS}개까지 추가할 수 있어요</p>
              )}
            </div>

            {/* 공개 요청 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={shareRequested} onChange={e => setShareRequested(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-cyan-500" />
                <div>
                  <p className="text-sm font-medium text-gray-800">공개 요청</p>
                  <p className="text-xs text-gray-400 mt-0.5">관리자 검수 후 모든 사용자에게 공개될 수 있어요</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-3 shadow-lg">
        <button onClick={handleSave}
          disabled={!selectedGame || !validCount}
          className="w-full py-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-base rounded-xl flex items-center justify-center gap-2 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          계산기 저장
        </button>
      </div>
    </div>
  );
}