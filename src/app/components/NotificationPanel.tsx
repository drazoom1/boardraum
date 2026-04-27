import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Heart, MessageCircle, UserPlus, Star, Loader2, ChevronRight, AtSign, CornerDownRight } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface Notification {
  id: string;
  type: 'comment' | 'like' | 'follow' | 'points' | 'reply' | 'mention';
  fromUserName: string;
  postId?: string;
  postContent?: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function NotifIcon({ type }: { type: Notification['type'] }) {
  const map: Record<string, { icon: React.ReactNode; bg: string }> = {
    comment: { icon: <MessageCircle className="w-3.5 h-3.5" />, bg: 'bg-blue-100 text-blue-600' },
    like:    { icon: <Heart className="w-3.5 h-3.5" />,          bg: 'bg-red-100 text-red-500' },
    follow:  { icon: <UserPlus className="w-3.5 h-3.5" />,       bg: 'bg-green-100 text-green-600' },
    points:  { icon: <Star className="w-3.5 h-3.5" />,           bg: 'bg-yellow-100 text-yellow-600' },
    reply:   { icon: <CornerDownRight className="w-3.5 h-3.5" />, bg: 'bg-cyan-100 text-cyan-600' },
    mention: { icon: <AtSign className="w-3.5 h-3.5" />,          bg: 'bg-purple-100 text-purple-600' },
  };
  const { icon, bg } = map[type] || map.points;
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
      {icon}
    </div>
  );
}

// ─── 알림 모달 ───
export function NotificationPanel({ accessToken, onClose, onNavigateToPost, visible = true }: {
  accessToken: string;
  onClose: () => void;
  onNavigateToPost?: (postId: string) => void;
  visible?: boolean;
}) {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const everLoadedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/notifications`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setNotifs(data.notifications || []);
      }
    } catch {}
    setLoading(false);
    everLoadedRef.current = true;
  }, [accessToken]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch silently when panel is reopened; also mark all as read
  useEffect(() => {
    if (!visible) return;
    if (everLoadedRef.current) load(true);
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }, [visible]);

  const handleClick = (n: Notification) => {
    if (n.type === 'points') { onClose(); return; }
    if (n.postId && onNavigateToPost) {
      onNavigateToPost(n.postId);
      onClose();
    }
  };

  const isClickable = (n: Notification) => n.type !== 'points' && !!n.postId;

  return (
    <div style={{ display: visible ? undefined : 'none' }}
      className="fixed inset-0 bg-black/50 z-[9990] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[min(100vw-2rem,420px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-4 h-4" /> 알림
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && notifs.length === 0 ? (
            <div className="divide-y divide-gray-50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2 py-0.5">
                    <div className="h-3 bg-gray-200 rounded w-4/5" />
                    <div className="h-2.5 bg-gray-100 rounded w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <div className="text-center py-16">
              <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">아직 알림이 없어요</p>
            </div>
          ) : (
            notifs.map(n => (
              <div key={n.id}
                onClick={() => handleClick(n)}
                className={`flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 transition-colors
                  ${!n.read ? 'bg-blue-50/40' : ''}
                  ${isClickable(n) ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''}`}>
                <NotifIcon type={n.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                  {n.postContent && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">"{n.postContent}..."</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                  {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  {isClickable(n) && <ChevronRight className="w-4 h-4 text-gray-300" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 알림 버튼 (배지 포함) ───
export function NotificationBell({ accessToken, onClick }: {
  accessToken: string;
  onClick: () => void;
}) {
  const [unread, setUnread] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/notifications`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setUnread(data.unreadCount || 0);
      }
    } catch {}
  }, [accessToken]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  return (
    <button onClick={() => { onClick(); setUnread(0); }}
      className="relative w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"
      title="알림">
      <Bell className="w-5 h-5 text-gray-500" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}