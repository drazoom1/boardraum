import { useState, useRef } from 'react';
import { X, Plus, Trash2, Info, ChevronRight, Check } from 'lucide-react';
import { PlayRecord } from '../App';
import { CustomCalculator } from './CustomCalculatorBuilder';

interface PlayerData {
  id: string;
  name: string;
  scores: { [itemId: string]: number };
}

interface Props {
  calc: CustomCalculator;
  onSavePlayRecord: (record: PlayRecord) => void;
  onClose: () => void;
}

type Step = 'confirm' | 'time' | 'expansion' | 'location' | 'rating' | 'done';

const STEPS: Step[] = ['confirm', 'time', 'expansion', 'location', 'rating'];

export function CustomCalculatorPlayer({ calc, onSavePlayRecord, onClose }: Props) {
  const itemIds = calc.items.map(i => i.id);
  const makePlayer = (id: string): PlayerData => {
    const scores: { [key: string]: number } = {};
    calc.items.forEach(item => {
      scores[item.id] = 0;
      (item.subItems || []).forEach(sub => { scores[`${item.id}_${sub.id}`] = 0; });
    });
    return { id, name: '', scores };
  };

  const [players, setPlayers] = useState<PlayerData[]>([makePlayer('1')]);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [playTime, setPlayTime] = useState('');
  const [expansion, setExpansion] = useState('');
  const [location, setLocation] = useState('');
  const [rating, setRating] = useState(0);
  const playerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const calcTotal = (p: PlayerData) => Object.values(p.scores).reduce((s, v) => s + v, 0);
  const sorted = [...players].sort((a, b) => calcTotal(b) - calcTotal(a));
  const isDrawn = sorted.length > 1 && calcTotal(sorted[0]) === calcTotal(sorted[1]);

  const addPlayer = () => setPlayers(p => [...p, makePlayer(Date.now().toString())]);
  const removePlayer = (id: string) => { if (players.length > 1) setPlayers(p => p.filter(x => x.id !== id)); };
  const updateName = (id: string, name: string) => setPlayers(p => p.map(x => x.id === id ? { ...x, name } : x));
  const updateScore = (id: string, itemId: string, val: string) => {
    const n = val === '' ? 0 : parseInt(val) || 0;
    setPlayers(p => p.map(x => x.id === id ? { ...x, scores: { ...x.scores, [itemId]: n } } : x));
  };

  const handleSave = () => {
    const record: PlayRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      players: players.map((p, i) => ({ name: p.name || `플레이어 ${i+1}`, score: calcTotal(p) })),
      winner: isDrawn ? '무승부' : (sorted[0]?.name || '플레이어 1'),
      totalTime: parseInt(playTime) || 0,
      expansionsUsed: expansion.trim() ? [expansion.trim()] : [],
      location: location.trim() || undefined,
      playerCountRating: rating || undefined,
      createdAt: new Date().toISOString(),
      memo: '',
    };
    onSavePlayRecord(record);
    setStep('done');
  };

  // 질문 모달
  if (step !== null && step !== 'done') {
    return (
      <div className="fixed inset-0 bg-black/70 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:w-[min(100vw-2rem,440px)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex gap-1 p-4 pb-0">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${STEPS.indexOf(step) >= i ? 'bg-cyan-500' : 'bg-gray-200'}`} />
            ))}
          </div>
          <div className="p-6 space-y-5">
            {step === 'confirm' && (
              <>
                <div className="text-center space-y-3">
                  <p className="text-2xl">🏆</p>
                  <h3 className="text-lg font-bold text-gray-900">이대로 플레이 기록을 남기시겠습니까?</h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-left">
                    {sorted.map((p, i) => (
                      <div key={p.id} className={`flex justify-between ${i===0?'font-bold text-cyan-700':'text-gray-600'}`}>
                        <span>{i===0&&!isDrawn?'🥇 ':''}{p.name||`플레이어 ${players.indexOf(p)+1}`}</span>
                        <span>{calcTotal(p)}점</span>
                      </div>
                    ))}
                    {isDrawn && <p className="text-center text-xs text-gray-500 mt-1">무승부</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">취소</button>
                  <button onClick={() => setStep('time')} className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold flex items-center justify-center gap-1">
                    예, 기록할게요 <ChevronRight className="w-4 h-4"/>
                  </button>
                </div>
              </>
            )}
            {step === 'time' && (
              <>
                <div className="text-center space-y-2"><p className="text-2xl">⏱️</p><h3 className="text-lg font-bold text-gray-900">플레이 시간을 알려주세요</h3><p className="text-sm text-gray-400">분 단위로 입력해주세요</p></div>
                <input type="number" placeholder="예: 90" value={playTime} onChange={e => setPlayTime(e.target.value)} autoFocus className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-xl focus:outline-none focus:border-cyan-400" />
                <div className="flex gap-3">
                  <button onClick={() => setStep('confirm')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">이전</button>
                  <button onClick={() => setStep('expansion')} className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold flex items-center justify-center gap-1">다음 <ChevronRight className="w-4 h-4"/></button>
                </div>
              </>
            )}
            {step === 'expansion' && (
              <>
                <div className="text-center space-y-2"><p className="text-2xl">📦</p><h3 className="text-lg font-bold text-gray-900">사용한 확장판이 있습니까?</h3><p className="text-sm text-gray-400">없으면 건너뛰세요</p></div>
                <input type="text" placeholder="예: 유럽의 날개" value={expansion} onChange={e => setExpansion(e.target.value)} autoFocus className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center focus:outline-none focus:border-cyan-400" />
                <div className="flex gap-3">
                  <button onClick={() => setStep('time')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">이전</button>
                  <button onClick={() => setStep('location')} className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold flex items-center justify-center gap-1">{expansion.trim()?'다음':'건너뛰기'} <ChevronRight className="w-4 h-4"/></button>
                </div>
              </>
            )}
            {step === 'location' && (
              <>
                <div className="text-center space-y-2"><p className="text-2xl">📍</p><h3 className="text-lg font-bold text-gray-900">플레이한 장소를 기재해주세요</h3><p className="text-sm text-gray-400">없으면 건너뛰세요</p></div>
                <input type="text" placeholder="예: 집, 보드게임 카페" value={location} onChange={e => setLocation(e.target.value)} autoFocus className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center focus:outline-none focus:border-cyan-400" />
                <div className="flex gap-3">
                  <button onClick={() => setStep('expansion')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">이전</button>
                  <button onClick={() => setStep('rating')} className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold flex items-center justify-center gap-1">{location.trim()?'다음':'건너뛰기'} <ChevronRight className="w-4 h-4"/></button>
                </div>
              </>
            )}
            {step === 'rating' && (
              <>
                <div className="text-center space-y-2"><p className="text-2xl">⭐</p><h3 className="text-lg font-bold text-gray-900">이번 플레이 경험은 몇 점인가요?</h3><p className="text-sm text-gray-400">{players.length}인 플레이 기준</p></div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={() => setRating(n)} className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${rating===n?'bg-cyan-500 text-white scale-110':'bg-gray-100 text-gray-700 hover:bg-cyan-100'}`}>{n}</button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('location')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">이전</button>
                  <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold flex items-center justify-center gap-1">
                    <Check className="w-4 h-4"/> 기록 완료
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center space-y-4 w-full max-w-sm shadow-2xl">
          <p className="text-5xl">🎉</p>
          <h3 className="text-xl font-black text-gray-900">플레이 기록 완료!</h3>
          <p className="text-sm text-gray-500">보유 리스트의 플레이 기록에서 확인할 수 있어요</p>
          <button onClick={onClose} className="w-full py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600">확인</button>
        </div>
      </div>
    );
  }

  // 계산기 메인
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto pb-24">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10 shadow-sm">
            <div>
              <p className="text-xs text-gray-400">커스텀 계산기</p>
              <h2 className="text-base font-bold text-gray-900">{calc.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
          </div>

          {/* 플레이어 탭 - sticky */}
          <div className="sticky top-[60px] bg-white border-b border-gray-100 px-4 py-2 flex gap-1.5 overflow-x-auto z-10 shadow-sm">
            {players.map((p, i) => (
              <button
                key={p.id}
                onClick={() => playerRefs.current[p.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="flex-shrink-0 bg-white border-2 border-cyan-400 rounded-lg px-2 py-1.5 min-w-[70px] text-center hover:bg-cyan-50 transition-colors"
              >
                <p className="text-[10px] text-gray-600 truncate">{p.name || `플레이어 ${i+1}`}</p>
                <p className="text-sm font-bold text-cyan-600">{calcTotal(p)}</p>
              </button>
            ))}
          </div>

          {/* 플레이어 카드 */}
          <div className="px-4 space-y-4 pt-4">
            {players.map((p, idx) => (
              <div 
                key={p.id} 
                ref={(el) => playerRefs.current[p.id] = el}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <div className="bg-cyan-400 px-4 py-3 flex items-center gap-2">
                  <input type="text" placeholder={`플레이어 ${idx+1}`} value={p.name} onChange={e => updateName(p.id, e.target.value)}
                    className="flex-1 bg-white/90 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none" />
                  {players.length > 1 && (
                    <button onClick={() => removePlayer(p.id)} className="text-white/80 hover:text-white p-1"><Trash2 className="w-4 h-4"/></button>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  {calc.items.map(item => {
                    const subs = (item as any).subItems || [];
                    const itemTotal = p.scores[item.id] || 0;
                    const subTotal = subs.reduce((sum: number, sub: any) => sum + (p.scores[`${item.id}_${sub.id}`] || 0), 0);
                    return (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-700">{item.name}</span>
                          {item.description.trim() && (
                            <button onClick={() => setExpandedInfo(expandedInfo === `${p.id}-${item.id}` ? null : `${p.id}-${item.id}`)}
                              className="text-cyan-400 hover:text-cyan-600">
                              <Info className="w-3.5 h-3.5"/>
                            </button>
                          )}
                          {subs.length > 0 && (
                            <span className="text-xs text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded-full">{subTotal}점</span>
                          )}
                        </div>
                        {subs.length === 0 ? (
                          <input type="number" value={p.scores[item.id] || ''}
                            onChange={e => updateScore(p.id, item.id, e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-400" min="0" />
                        ) : (
                          <span className="text-sm font-bold text-gray-600 w-20 text-center">{subTotal}</span>
                        )}
                      </div>
                      {expandedInfo === `${p.id}-${item.id}` && item.description.trim() && (
                        <p className="text-xs text-cyan-700 bg-cyan-50 px-3 py-1.5 rounded-md">{item.description}</p>
                      )}
                      {subs.length > 0 && subs.map((sub: any) => (
                        <div key={sub.id} className="flex items-center justify-between py-1 pl-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-300 flex-shrink-0" />
                            <span className="text-xs text-gray-600">{sub.name}</span>
                            {sub.description?.trim() && (
                              <button onClick={() => setExpandedInfo(expandedInfo === `${p.id}-${item.id}-${sub.id}` ? null : `${p.id}-${item.id}-${sub.id}`)}
                                className="text-cyan-400 hover:text-cyan-600">
                                <Info className="w-3 h-3"/>
                              </button>
                            )}
                          </div>
                          <input type="number" value={p.scores[`${item.id}_${sub.id}`] || ''}
                            onChange={e => updateScore(p.id, `${item.id}_${sub.id}`, e.target.value)}
                            className="w-16 border border-gray-200 rounded-lg px-2 py-0.5 text-center text-xs focus:outline-none focus:border-purple-400" min="0" />
                          {expandedInfo === `${p.id}-${item.id}-${sub.id}` && sub.description?.trim() && (
                            <p className="text-xs text-cyan-700 bg-cyan-50 px-3 py-1 rounded-md col-span-2">{sub.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    );
                  })}
                  <div className="pt-2 border-t-2 border-cyan-400 flex justify-between items-center">
                    <span className="font-bold text-gray-900">합계</span>
                    <span className="text-xl font-black text-cyan-600 bg-cyan-50 px-4 py-1.5 rounded-lg">{calcTotal(p)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 pt-3">
            <button onClick={addPlayer} className="w-full py-4 border-2 border-dashed border-cyan-300 rounded-xl text-cyan-500 font-medium flex items-center justify-center gap-2 hover:bg-cyan-50">
              <Plus className="w-4 h-4"/> 플레이어 추가
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-3 shadow-lg">
        <button onClick={() => setStep('confirm')} className="w-full py-4 bg-cyan-500 hover:bg-cyan-600 text-white font-black text-lg rounded-xl flex items-center justify-center gap-2">
          점수 확정 및 플레이 기록 남기기 <ChevronRight className="w-5 h-5"/>
        </button>
      </div>
    </div>
  );
}