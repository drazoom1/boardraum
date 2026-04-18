import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { Send, Loader2, Trash2, ChevronDown, Image as ImageIcon, X } from 'lucide-react';
import { Button } from './ui/button';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface Message {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  imageUrl?: string;
}

interface BetaCommunityProps {
  accessToken: string;
  userEmail: string;
  isModal?: boolean;
  onMarkAsRead?: () => void;
}

export function BetaCommunity({ accessToken, userEmail, isModal = false, onMarkAsRead }: BetaCommunityProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageIdsRef = useRef<Set<string>>(new Set());
  const isAtBottomRef = useRef<boolean>(true);
  const isInitialLoadRef = useRef<boolean>(true);
  const markAsReadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasMarkedAsReadRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = userEmail === 'sityplanner2@naver.com';

  // 스크롤이 맨 아래 근처인지 감지 (100px 이내면 "맨 아래")
  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= threshold;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setHasNewMessages(false);
    setNewMessageCount(0);
    isAtBottomRef.current = true;
  }, []);

  // 스크롤 이벤트 핸들러
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setHasNewMessages(false);
      setNewMessageCount(0);
    }
  }, [checkIfAtBottom]);

  useEffect(() => {
    if (!accessToken) return;
    loadUserInfo();
    loadMessages();

    const interval = setInterval(() => {
      loadMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [accessToken]);

  // 읽음 처리
  useEffect(() => {
    if (markAsReadTimerRef.current) clearTimeout(markAsReadTimerRef.current);

    if (messages.length > 0 && currentUserId && !hasMarkedAsReadRef.current) {
      markAsReadTimerRef.current = setTimeout(() => {
        const lastReadKey = `lastReadMessage_${currentUserId}`;
        const lastMessageTime = messages[messages.length - 1]?.createdAt;
        if (lastMessageTime) {
          localStorage.setItem(lastReadKey, lastMessageTime);
          hasMarkedAsReadRef.current = true;
          if (onMarkAsRead) onMarkAsRead();
        }
      }, 2000);
    }

    return () => {
      if (markAsReadTimerRef.current) clearTimeout(markAsReadTimerRef.current);
    };
  }, [messages, currentUserId, onMarkAsRead]);

  const loadUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      if (user) {
        setCurrentUserId(user.id);
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/beta-user/${user.id}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (response.ok) {
          const userData = await response.json();
          setUserName(userData.name || '익명');
        }
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const validMessages = (data.posts || []).filter((msg: any) =>
          msg && msg.id && msg.userId && msg.content && msg.createdAt
        );

        // 새 메시지 감지 (다른 사용자 것만)
        if (!loading && currentUserId) {
          const newMsgs = validMessages.filter((msg: Message) =>
            !previousMessageIdsRef.current.has(msg.id) &&
            msg.userId !== currentUserId
          );

          if (newMsgs.length > 0) {
            newMsgs.forEach((msg: Message) => {
              toast.info(`💬 ${msg.userName}: ${msg.content.substring(0, 30)}${msg.content.length > 30 ? '...' : ''}`, {
                duration: 4000,
              });
            });

            // 맨 아래에 있으면 자동 스크롤, 아니면 "새 메시지" 버튼 표시
            if (isAtBottomRef.current) {
              setTimeout(() => scrollToBottom(), 50);
            } else {
              setHasNewMessages(true);
              setNewMessageCount(prev => prev + newMsgs.length);
            }
          }
        }

        previousMessageIdsRef.current = new Set(validMessages.map((msg: Message) => msg.id));
        setMessages(validMessages);

        // 최초 로드: 무조건 맨 아래로 (instant)
        if (isInitialLoadRef.current && validMessages.length > 0) {
          isInitialLoadRef.current = false;
          setTimeout(() => scrollToBottom('instant'), 50);
        }
      } else {
        if (response.status === 403) toast.error('승인된 베타 테스터만 사용 가능합니다');
        else if (response.status === 401) toast.error('로그인이 필요합니다');
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('5MB 이하의 이미지만 업로드 가능합니다');
      return;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return data.imageUrl;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !selectedImage) {
      toast.error('메시지나 이미지를 입력해주세요');
      return;
    }
    if (newMessage.length > 500) {
      toast.error('최대 500자까지 입력 가능합니다');
      return;
    }

    setSending(true);
    try {
      let imageUrl: string | undefined;

      if (selectedImage) {
        const url = await uploadImage(selectedImage);
        if (url) imageUrl = url;
        else toast.error('이미지 업로드에 실패했습니다. 텍스트만 전송합니다.');
      }

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: newMessage || ' ',
          userName: userName || '익명',
          imageUrl,
        }),
      });

      if (response.ok) {
        setNewMessage('');
        removeSelectedImage();
        // 내가 보낸 메시지는 항상 맨 아래로
        isAtBottomRef.current = true;
        await loadMessages();
        setTimeout(() => scrollToBottom(), 50);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      } else {
        const error = await response.json();
        toast.error(error.error || '메시지 전송에 실패했습니다');
      }
    } catch (error) {
      toast.error('메시지 전송에 실패했습니다');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (postId: string) => {
    if (!isAdmin) { toast.error('관리자만 삭제할 수 있습니다'); return; }
    if (!confirm('이 메시지를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        toast.success('메시지가 삭제되었습니다');
        await loadMessages();
      } else {
        const error = await response.json();
        toast.error(error.error || '메시지 삭제에 실패했습니다');
      }
    } catch {
      toast.error('메시지 삭제에 실패했습니다');
    }
  };

  // textarea 자동 높이 조절
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  // 날짜 구분선 표시 여부
  const shouldShowDateDivider = (current: Message, previous?: Message) => {
    if (!previous) return true;
    const curr = new Date(current.createdAt).toDateString();
    const prev = new Date(previous.createdAt).toDateString();
    return curr !== prev;
  };

  const formatDateDivider = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-500" />
          <p className="text-gray-500 text-sm">메시지 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isModal ? 'h-full' : 'h-[600px]'} relative`}>
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-gray-50"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-5xl mb-2">💬</div>
              <p className="text-gray-500 text-sm">아직 메시지가 없습니다</p>
              <p className="text-gray-400 text-xs mt-1">첫 메시지를 보내보세요!</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isMyMessage = message.userId === currentUserId;
            const prevMessage = index > 0 ? messages[index - 1] : undefined;
            const showDateDivider = shouldShowDateDivider(message, prevMessage);
            // 같은 사람이 연속으로 보낸 메시지면 이름 숨김
            const showName = !isMyMessage && (!prevMessage || prevMessage.userId !== message.userId || showDateDivider);

            return (
              <div key={message.id}>
                {/* 날짜 구분선 */}
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateDivider(message.createdAt)}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}

                <div className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} group mb-0.5`}>
                  <div className={`flex flex-col max-w-[72%] ${isMyMessage ? 'items-end' : 'items-start'}`}>
                    {/* 이름 (상대방, 처음 메시지만) */}
                    {showName && (
                      <span className="text-xs text-gray-500 mb-1 px-1 font-medium">{message.userName}</span>
                    )}

                    <div className="flex items-end gap-1.5">
                      {/* 내 메시지: 시간 왼쪽 */}
                      {isMyMessage && (
                        <span className="text-[10px] text-gray-400 mb-1 whitespace-nowrap shrink-0">
                          {formatTime(message.createdAt)}
                        </span>
                      )}

                      <div className="flex items-start gap-1">
                        {/* 말풍선 */}
                        <div
                          className={`px-3.5 py-2 rounded-2xl break-words max-w-full ${
                            isMyMessage
                              ? 'bg-cyan-500 text-white rounded-br-md'
                              : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
                          }`}
                        >
                          {/* 이미지 */}
                          {message.imageUrl && (
                            <img
                              src={message.imageUrl}
                              alt="첨부 이미지"
                              className="rounded-lg max-w-[200px] max-h-[200px] object-cover mb-1 cursor-pointer"
                              onClick={() => window.open(message.imageUrl, '_blank')}
                            />
                          )}
                          {/* 텍스트 (공백만이면 숨김) */}
                          {message.content.trim() && (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          )}
                        </div>

                        {/* 삭제 버튼 (관리자) */}
                        {isAdmin && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        )}
                      </div>

                      {/* 상대 메시지: 시간 오른쪽 */}
                      {!isMyMessage && (
                        <span className="text-[10px] text-gray-400 mb-1 whitespace-nowrap shrink-0">
                          {formatTime(message.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 새 메시지 알림 버튼 (카카오톡 스타일) */}
      {hasNewMessages && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-cyan-500 text-white text-xs px-4 py-2 rounded-full shadow-lg hover:bg-cyan-600 transition-all animate-bounce z-10"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          새 메시지 {newMessageCount}개
        </button>
      )}

      {/* 이미지 미리보기 */}
      {imagePreview && (
        <div className="px-4 pt-2 bg-white border-t border-gray-100">
          <div className="relative inline-block">
            <img src={imagePreview} alt="미리보기" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
            <button
              onClick={removeSelectedImage}
              className="absolute -top-1.5 -right-1.5 bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-gray-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          {/* 이미지 업로드 버튼 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 transition-colors mb-0.5"
            title="이미지 첨부"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* 텍스트 입력 */}
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            className="flex-1 px-3 py-2 bg-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"
            style={{ height: '38px', maxHeight: '120px' }}
            maxLength={500}
          />

          {/* 전송 버튼 */}
          <button
            onClick={sendMessage}
            disabled={(!newMessage.trim() && !selectedImage) || sending || uploadingImage}
            className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all mb-0.5 ${
              (newMessage.trim() || selectedImage) && !sending
                ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {sending || uploadingImage
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>

        {/* 글자수 + 안내 */}
        <div className="flex justify-between items-center mt-1 px-1">
          <span className="text-[10px] text-gray-400">Shift+Enter로 줄바꿈</span>
          <span className={`text-[10px] ${newMessage.length > 450 ? 'text-orange-400' : 'text-gray-400'}`}>
            {newMessage.length} / 500
          </span>
        </div>
      </div>
    </div>
  );
}