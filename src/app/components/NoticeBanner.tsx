import { useState, useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface NoticeItem {
  type: 'sponsor' | 'feedback';
  name: string;
  amount?: string;
  content?: string;
}

export function NoticeBanner({ accessToken }: { accessToken?: string | null }) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [fade, setFade] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = accessToken || publicAnonKey;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/notices`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.notices) && d.notices.length) setNotices(d.notices); })
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (notices.length < 2) return;
    intervalRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrent(i => (i + 1) % notices.length);
        setFade(true);
      }, 250);
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [notices.length]);

  if (notices.length === 0) return null;

  const item = notices[current];

  return (
    <div className="w-full bg-cyan-500 border-b border-cyan-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-10 gap-3">
          {/* 타입 뱃지 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold text-cyan-900 bg-white px-2 py-1 rounded">
              {item.type === 'sponsor' ? '후원' : '피드백'}
            </span>
          </div>

          {/* 내용 */}
          <div
            style={{ transition: 'opacity 0.25s', opacity: fade ? 1 : 0 }}
            className="flex-1 flex items-center gap-2 min-w-0"
          >
            <span className="text-sm font-semibold text-white truncate">{item.name}</span>
            {item.amount && (
              <span className="text-sm font-bold text-white flex-shrink-0">{item.amount}</span>
            )}
            {item.content && (
              <>
                <span className="text-white/60 flex-shrink-0">|</span>
                <span className="text-sm text-white/90 truncate">{item.content}</span>
              </>
            )}
          </div>

          {/* 인디케이터 */}
          {notices.length > 1 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {notices.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrent(i); setFade(true); }}
                  className={`rounded-full transition-all ${i === current ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}