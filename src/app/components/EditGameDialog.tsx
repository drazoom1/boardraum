import { useState, useEffect, useRef } from 'react';
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
import { Minus, Plus, Upload, X, Image } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface EditGameDialogProps {
  game: BoardGame;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditGame: (game: BoardGame) => void;
  accessToken?: string | null;
}

export function EditGameDialog({ game, open, onOpenChange, onEditGame, accessToken }: EditGameDialogProps) {
  const [formData, setFormData] = useState(game);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(game);
    setPreviewImage(null);
  }, [game]);

  const handleImageUpload = async (file: File) => {
    if (!accessToken) {
      toast.error('로그인이 필요합니다');
      return;
    }

    // 파일 크기 검사 (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('파일 크기는 5MB 이하여야 합니다');
      return;
    }

    // 파일 타입 검사
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('JPEG, PNG, WebP, GIF 형식만 업로드 가능합니다');
      return;
    }

    setIsUploading(true);
    toast.loading('이미지 업로드 중...', { id: 'image-upload' });

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('image', file);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/image/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formDataToSend,
        }
      );

      toast.dismiss('image-upload');

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Image uploaded:', data.url);
        
        setFormData({ ...formData, imageUrl: data.url });
        setPreviewImage(data.url);
        toast.success('이미지 업로드 완료!');
      } else {
        const error = await response.json();
        console.error('Upload failed:', error);
        toast.error(error.error || '이미지 업로드 실패');
      }
    } catch (error) {
      toast.dismiss('image-upload');
      console.error('Upload error:', error);
      toast.error('이미지 업로드 중 오류 발생');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const clearPreview = () => {
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEditGame(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>게임 수정</DialogTitle>
          <DialogDescription>
            보드게임 정보를 수정하세요
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* 이미지 업로드 섹션 */}
            <div className="space-y-3">
              <Label>게임 이미지</Label>
              
              {/* 현재 이미지 미리보기 */}
              {(previewImage || formData.imageUrl) && (
                <div className="relative w-full aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img
                    src={previewImage || formData.imageUrl}
                    alt="게임 이미지"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/300x200?text=No+Image';
                    }}
                  />
                  {previewImage && (
                    <button
                      type="button"
                      onClick={clearPreview}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* 업로드 버튼 */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      이미지 업로드
                    </>
                  )}
                </Button>
              </div>

              {/* URL 직접 입력 (선택사항) */}
              <div className="space-y-2">
                <Label htmlFor="edit-imageUrl" className="text-xs text-gray-500">
                  또는 이미지 URL 직접 입력 (선택사항)
                </Label>
                <Input
                  id="edit-imageUrl"
                  placeholder="https://example.com/image.jpg"
                  value={formData.imageUrl}
                  onChange={(e) => {
                    setFormData({ ...formData, imageUrl: e.target.value });
                    setPreviewImage(null);
                  }}
                  className="text-sm"
                />
              </div>

              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Image className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-cyan-800 space-y-1">
                    <p className="font-semibold">💡 이미지 업로드 안내</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                      <li>업로드한 이미지는 내 리스트에만 적용됩니다</li>
                      <li>다른 사용자의 게임 카드에는 영향을 주지 않습니다</li>
                      <li>최대 5MB, JPEG/PNG/WebP/GIF 형식 지원</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-koreanName">한국어명 *</Label>
              <Input
                id="edit-koreanName"
                placeholder="예: 카탄"
                value={formData.koreanName}
                onChange={(e) => setFormData({ ...formData, koreanName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-englishName">영문명</Label>
              <Input
                id="edit-englishName"
                placeholder="예: Catan"
                value={formData.englishName}
                onChange={(e) => setFormData({ ...formData, englishName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-recommendedPlayers">추천인원</Label>
              <Input
                id="edit-recommendedPlayers"
                placeholder="예: 3-4명"
                value={formData.recommendedPlayers}
                onChange={(e) => setFormData({ ...formData, recommendedPlayers: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-playTime">플레이시간</Label>
              <Input
                id="edit-playTime"
                placeholder="예: 60-90분"
                value={formData.playTime}
                onChange={(e) => setFormData({ ...formData, playTime: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-difficulty">난이도</Label>
              <Input
                id="edit-difficulty"
                placeholder="예: 중급"
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-videoUrl">게임설명영상 URL</Label>
              <Input
                id="edit-videoUrl"
                placeholder="https://youtube.com/..."
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>언어판</Label>
              <div className="flex gap-2">
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
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit">저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}