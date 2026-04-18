import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Eye, X } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

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

const CATEGORIES: { [key: string]: string } = {
  sleeve: '슬리브',
  organizer: '오거나이저',
  component: '컴포 업그레이드',
  rulebook: '설명서/룰북',
  '3dprint': '3D프린팅',
  storage: '보관/케이스',
  gallery: '커스텀 작업 갤러리',
};

export function AdminApproval({ accessToken: initialToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [pendingPosts, setPendingPosts] = useState<CustomPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const accessToken = initialToken; // Use the token passed from props

  useEffect(() => {
    loadPendingPosts();
  }, []);

  const loadPendingPosts = async () => {
    setIsLoading(true);
    setDebugInfo('시작: 승인 대기 목록 로딩...');
    
    try {
      if (!accessToken) {
        setDebugInfo('에러: 유효한 토큰이 없습니다');
        toast.error('로그인이 필요합니다');
        setIsLoading(false);
        return;
      }
      
      console.log('🔍 [Admin] Loading pending posts...');
      setDebugInfo(`요청 중: GET /customs/pending/all`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/pending/all`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      console.log('← Response status:', response.status, response.statusText);
      setDebugInfo(`응답: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log('✓ Pending posts loaded:', data.posts?.length || 0);
        console.log('Posts data:', data.posts);
        setPendingPosts(data.posts || []);
        setDebugInfo(`성공: ${data.posts?.length || 0}개 게시물 로드됨`);
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to load pending posts:', errorData);
        setDebugInfo(`에러: ${response.status} - ${JSON.stringify(errorData)}`);
        
        // Show detailed error message
        if (response.status === 403) {
          toast.error(`권한 없음: ${errorData.details || errorData.error}`);
        } else if (response.status === 401) {
          toast.error('로그인이 필요합니다. 다시 로그인해주세요.');
        } else {
          toast.error(`승인 대기 목록을 불러오는데 실패했습니다 (${response.status})`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load pending posts - Network error:', error);
      setDebugInfo(`네트워크 에러: ${error}`);
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (postId: string) => {
    try {
      if (!accessToken) {
        toast.error('로그인이 필요합니다');
        return;
      }
      
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
        loadPendingPosts();
        setExpandedPostId(null);
      } else {
        const errorData = await response.json();
        toast.error(`승인 처리에 실패했습니다: ${errorData.error || '알 수 없는 오류'}`);
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
      if (!accessToken) {
        toast.error('로그인이 필요합니다');
        return;
      }
      
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
        loadPendingPosts();
        setExpandedPostId(null);
      } else {
        const errorData = await response.json();
        toast.error(`반려 처리에 실패했습니다: ${errorData.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('반려 처리 중 오류가 발생했습니다');
    }
  };

  const renderPostPreview = (post: CustomPost) => {
    // 슬리브 정보 특별 렌더링
    if (post.postType === 'info' && post.category === 'sleeve' && post.data?.cards) {
      return (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">슬리브 카드 정보</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {post.data.cards.map((card: any, idx: number) => {
              const maxDimension = Math.max(card.width, card.height);
              const scaleFactor = 120 / maxDimension;
              const scaledWidth = card.width * scaleFactor;
              const scaledHeight = card.height * scaleFactor;

              return (
                <div key={idx} className="flex flex-col items-center p-3 bg-gray-50 rounded-lg">
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
            <p className="text-sm text-gray-700">
              <span className="font-medium">추천 제품:</span> {post.data.recommendedProduct}
            </p>
          )}

          {post.data.purchaseLinks && post.data.purchaseLinks.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">구매 링크:</p>
              {post.data.purchaseLinks.map((link: any, idx: number) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm inline-block ml-2"
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
              className="text-blue-600 hover:underline text-sm inline-block"
            >
              🔗 구매 링크
            </a>
          )}
        </div>
      );
    }

    // 일반 게시물 또는 기타 정보
    return (
      <div className="space-y-4">
        {post.description && (
          <div>
            <h4 className="font-medium text-gray-900 mb-2">내용</h4>
            <p className="text-gray-700 whitespace-pre-wrap">{post.description}</p>
          </div>
        )}

        {/* 정보형 게시물 데이터 */}
        {post.postType === 'info' && post.data && (
          <div className="space-y-2 text-sm">
            {post.data.productName && (
              <p><span className="font-medium">제품명:</span> {post.data.productName}</p>
            )}
            {post.data.brand && (
              <p><span className="font-medium">브랜드:</span> {post.data.brand}</p>
            )}
            {post.data.componentType && (
              <p><span className="font-medium">컴포 종류:</span> {post.data.componentType}</p>
            )}
            {post.data.originalQuantity !== undefined && (
              <p><span className="font-medium">기본 수량:</span> {post.data.originalQuantity}</p>
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
            {post.data.notes && (
              <p><span className="font-medium">특이사항:</span> {post.data.notes}</p>
            )}
            {post.data.review && (
              <p><span className="font-medium">후기:</span> {post.data.review}</p>
            )}
          </div>
        )}

        {/* 태그 */}
        {post.data?.tags && post.data.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.data.tags.map((tag: string, idx: number) => (
              <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* 이미지 */}
        {((post.images && post.images.length > 0) || (post.data?.images && post.data.images.length > 0)) && (
          <div>
            <h4 className="font-medium text-gray-900 mb-2">이미지</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(post.images || post.data?.images || []).map((img: string, idx: number) => (
                <img
                  key={idx}
                  src={img}
                  alt={`${post.title} ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🛡️ 관리자 승인</h1>
            <p className="text-gray-600 mt-2">
              승인 대기 중인 게시물: <span className="font-semibold">{pendingPosts.length}개</span>
            </p>
            {debugInfo && (
              <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded font-mono">
                {debugInfo}
              </div>
            )}
          </div>
          <Button variant="outline" onClick={onBack}>
            뒤로 가기
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="text-gray-500">로딩 중...</div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && pendingPosts.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              모든 게시물이 처리되었습니다
            </h2>
            <p className="text-gray-600">
              승인 대기 중인 게시물이 없습니다.
            </p>
          </div>
        )}

        {/* Pending Posts List */}
        {!isLoading && pendingPosts.length > 0 && (
          <div className="grid gap-4">
            {pendingPosts.map(post => {
              const isExpanded = expandedPostId === post.id;
              
              return (
                <div key={post.id} className={`bg-white rounded-lg shadow-sm border transition-all ${
                  isExpanded ? 'border-yellow-400 shadow-md' : 'border-yellow-200'
                }`}>
                  {/* Card Header - Clickable */}
                  <button
                    onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                    className="w-full p-6 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-start gap-4">
                      {/* Left: Post Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                            승인 대기
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                            {CATEGORIES[post.category] || post.category}
                          </span>
                          {post.postType === 'info' && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                              정보
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {post.title}
                        </h3>

                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            <span className="font-medium">게임:</span> {post.gameName || '미지정'}
                          </p>
                          <p>
                            <span className="font-medium">작성자:</span> {post.created_by_email}
                          </p>
                          <p>
                            <span className="font-medium">작성일:</span>{' '}
                            {new Date(post.created_at).toLocaleString('ko-KR')}
                          </p>
                        </div>

                        {!isExpanded && post.description && post.description.length > 0 && (
                          <p className="mt-3 text-gray-700 line-clamp-2">
                            {post.description}
                          </p>
                        )}
                      </div>

                      {/* Expand/Collapse Icon */}
                      <div className={`flex-shrink-0 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}>
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded Post Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200">
                      <div className="p-6">
                        {renderPostPreview(post)}
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="bg-gray-50 border-t border-gray-200 p-4 flex gap-3 justify-end rounded-b-lg">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(post.id);
                          }}
                          className="text-red-600 border-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          반려
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(post.id);
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          승인
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}