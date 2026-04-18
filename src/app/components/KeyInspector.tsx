import { useState } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// KV Store 키 검사 도구
export function KeyInspector() {
  const [keys, setKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterBGG, setFilterBGG] = useState(true);
  const [debugUserId, setDebugUserId] = useState('');
  const [debugResult, setDebugResult] = useState<any>(null);
  const [isDebugging, setIsDebugging] = useState(false);

  const loadAllKeys = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/all-keys`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.error('❌ Error loading keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const debugUser = async () => {
    if (!debugUserId.trim()) {
      alert('User ID를 입력하세요');
      return;
    }

    setIsDebugging(true);
    setDebugResult(null);
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/debug-user/${debugUserId.trim()}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDebugResult(data);
        console.log('🔍 Debug result:', data);
      } else {
        setDebugResult({ error: `HTTP ${response.status}` });
      }
    } catch (error) {
      console.error('❌ Error debugging user:', error);
      setDebugResult({ error: String(error) });
    } finally {
      setIsDebugging(false);
    }
  };

  const displayKeys = filterBGG 
    ? keys.filter(key => !key.startsWith('bgg_') && !key.startsWith('bgg:'))
    : keys;

  const keyStats = {
    total: keys.length,
    bgg: keys.filter(k => k.startsWith('bgg_') || k.startsWith('bgg:')).length,
    user: keys.filter(k => k.startsWith('user_') || k.startsWith('user:')).length,
    beta: keys.filter(k => k.startsWith('beta_') || k.startsWith('beta:')).length,
    admin: keys.filter(k => k.startsWith('admin_') || k.startsWith('admin:')).length,
    other: keys.filter(k => {
      const prefixes = ['bgg_', 'bgg:', 'user_', 'user:', 'beta_', 'beta:', 'admin_', 'admin:'];
      return !prefixes.some(p => k.startsWith(p));
    }).length,
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 KV Store 키 조회</h2>

      <button
        onClick={loadAllKeys}
        disabled={isLoading}
        className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 mb-4"
      >
        {isLoading ? '로딩 중...' : '전체 키 조회'}
      </button>

      {keys.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{keyStats.total}</div>
              <div className="text-xs text-gray-600">전체</div>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{keyStats.bgg}</div>
              <div className="text-xs text-blue-600">BGG 캐시</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{keyStats.user}</div>
              <div className="text-xs text-green-600">사용자</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{keyStats.beta}</div>
              <div className="text-xs text-purple-600">베타</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{keyStats.admin}</div>
              <div className="text-xs text-orange-600">관리자</div>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{keyStats.other}</div>
              <div className="text-xs text-red-600">기타</div>
            </div>
          </div>

          {/* Filter */}
          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={filterBGG}
              onChange={(e) => setFilterBGG(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">BGG 캐시 키 숨기기</span>
          </label>

          {/* Key List */}
          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            <div className="divide-y divide-gray-200">
              {displayKeys.map((key, index) => (
                <div key={index} className="px-4 py-2 hover:bg-gray-50 font-mono text-sm">
                  {key.startsWith('user_') || key.startsWith('user:') ? (
                    <span className="text-green-600">{key}</span>
                  ) : key.startsWith('beta_') || key.startsWith('beta:') ? (
                    <span className="text-purple-600">{key}</span>
                  ) : key.startsWith('admin_') || key.startsWith('admin:') ? (
                    <span className="text-orange-600">{key}</span>
                  ) : key.startsWith('bgg_') || key.startsWith('bgg:') ? (
                    <span className="text-blue-600">{key}</span>
                  ) : (
                    <span className="text-red-600">{key}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            {filterBGG ? `BGG 제외 ${displayKeys.length}개 키 표시 중` : `전체 ${displayKeys.length}개 키 표시 중`}
          </div>
        </>
      )}

      {/* Debug User */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">사용자 디버그</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={debugUserId}
            onChange={(e) => setDebugUserId(e.target.value)}
            placeholder="User ID"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={debugUser}
            disabled={isDebugging}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {isDebugging ? '디버깅 중...' : '디버그'}
          </button>
        </div>
        {debugResult && (
          <div className="mt-4">
            <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono">
              {JSON.stringify(debugResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}