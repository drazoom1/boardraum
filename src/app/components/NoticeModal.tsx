import { useState, useEffect } from 'react';
import { X, MoreHorizontal } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface PostNotice {
  postId: string;
  title: string;
  content: string;
  showInFeed: boolean;
  createdAt: string;
}

export function NoticeModal({ accessToken, onClose, onRead, isAdmin, onNoticeChange }: {
  accessToken: string;
  onClose: () => void;
  onRead?: () => void;
  isAdmin?: boolean;
  onNoticeChange?: () => void;
}) {
  const [notices, setNotices] = useState<PostNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/post-notices`,
        { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setNotices(data.notices || []);
        setAnnouncementActive(data.announcementActive || false);
        const allIds = (data.notices || []).map((n: PostNotice) => n.postId);
        if (allIds.length > 0) {
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/post-notices/read`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
              body: JSON.stringify({ readIds: allIds }),
            }
          ).then(() => onRead?.());
        }
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [accessToken]);

  const handleToggleFeed = async (postId: string, showInFeed: boolean) => {
    setMenuOpenId(null);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/post-notices/${postId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ showInFeed }) }
      );
      if (res.ok) { await load(); onNoticeChange?.(); }
    } catch {}
  };

  const handleUpdateTitle = async (postId: string, title: string) => {
    setEditingTitleId(null);
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/post-notices/${postId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ title }) }
      );
      await load();
    } catch {}
  };

  const handleAnnounce = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/post-notices/announce`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setAnnouncementActive(data.active);
        onNoticeChange?.();
      }
    } catch {}
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center p-4 pt-16"
      onClick={onClose}>
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        style={{ maxHeight: '75vh' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <img src="/notice-icon.webp" alt="공지" style={{width:'20px',height:'20px'}} />
            <h3 className="font-bold text-gray-900">공지사항</h3>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={handleAnnounce}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  announcementActive
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}>
                {announcementActive ? 'N 알림 끄기' : 'N 알림 켜기'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : notices.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">공지사항이 없어요</div>
          ) : (
            notices.map(n => (
              <div key={n.postId} className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                {/* 카드 헤더 */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    {editingTitleId === n.postId ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingTitleValue}
                        onChange={e => setEditingTitleValue(e.target.value)}
                        className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm font-semibold outline-none focus:border-indigo-500"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdateTitle(n.postId, editingTitleValue);
                          if (e.key === 'Escape') setEditingTitleId(null);
                        }}
                        onBlur={() => handleUpdateTitle(n.postId, editingTitleValue)}
                      />
                    ) : (
                      <p className="font-semibold text-sm text-gray-900 leading-snug">{n.title || '(제목 없음)'}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === n.postId ? null : n.postId)}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuOpenId === n.postId && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                            <button
                              onClick={() => { setMenuOpenId(null); setEditingTitleId(n.postId); setEditingTitleValue(n.title || ''); }}
                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                              ✏️ 제목 수정
                            </button>
                            <button
                              onClick={() => handleToggleFeed(n.postId, !n.showInFeed)}
                              className="w-full px-4 py-2.5 text-left text-sm text-indigo-600 hover:bg-indigo-50 transition-colors">
                              {n.showInFeed ? '👁 홈피드에서 숨기기' : '👁 홈피드에 올리기'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 날짜 + 숨김 뱃지 */}
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-gray-400">{fmt(n.createdAt)}</p>
                  {!n.showInFeed && isAdmin && (
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">홈피드 숨김</span>
                  )}
                </div>

                {/* 본문 */}
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
