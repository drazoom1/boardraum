import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Plus, X, Upload, Star } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface CardSize {
  name: string;
  width: number;
  height: number;
  quantity: number;
}

interface PurchaseLink {
  name: string;  // 상품명
  url: string;   // 링크 URL
}

interface SleeveFormData {
  cards: CardSize[];
  recommendedProduct?: string;
  purchaseLinks?: PurchaseLink[];
}

// 슬리브 카테고리 - 카드 사이즈 시각화
export function SleeveForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [cards, setCards] = useState<CardSize[]>(
    initialData?.data?.cards || [{ name: '', width: 0, height: 0, quantity: 0 }]
  );
  const [recommendedProduct, setRecommendedProduct] = useState(initialData?.data?.recommendedProduct || '');
  const [purchaseLinks, setPurchaseLinks] = useState<PurchaseLink[]>(
    initialData?.data?.purchaseLinks || [{ name: '', url: '' }]
  );

  const addCard = () => {
    setCards([...cards, { name: '', width: 0, height: 0, quantity: 0 }]);
  };

  const removeCard = (index: number) => {
    if (cards.length > 1) {
      setCards(cards.filter((_, i) => i !== index));
    }
  };

  const updateCard = (index: number, field: keyof CardSize, value: any) => {
    const newCards = [...cards];
    newCards[index] = { ...newCards[index], [field]: value };
    setCards(newCards);
  };

  const addPurchaseLink = () => {
    setPurchaseLinks([...purchaseLinks, { name: '', url: '' }]);
  };

  const removePurchaseLink = (index: number) => {
    if (purchaseLinks.length > 1) {
      setPurchaseLinks(purchaseLinks.filter((_, i) => i !== index));
    }
  };

  const updatePurchaseLink = (index: number, field: keyof PurchaseLink, value: string) => {
    const newLinks = [...purchaseLinks];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setPurchaseLinks(newLinks);
  };

  const handleSubmit = () => {
    const filledCards = cards.filter(card => card.name && card.width > 0 && card.height > 0);
    if (filledCards.length === 0) {
      toast.error('최소 1개 이상의 카드 정보를 입력해주세요');
      return;
    }

    const filledLinks = purchaseLinks.filter(link => link.name && link.url);

    const data = {
      postType: 'info',
      title: '슬리브 크기',
      data: {
        cards: filledCards,
        recommendedProduct,
        purchaseLinks: filledLinks,
      }
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">슬리브 크기 등록</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {cards.map((card, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-medium text-gray-900">카드 #{index + 1}</h4>
              {cards.length > 1 && (
                <button
                  onClick={() => removeCard(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  카드 종류 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={card.name}
                  onChange={(e) => updateCard(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="예: 일반 카드, 큰 카드, 타로 카드"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  가로 (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={card.width || ''}
                  onChange={(e) => updateCard(index, 'width', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="63.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  세로 (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={card.height || ''}
                  onChange={(e) => updateCard(index, 'height', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="88"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  수량
                </label>
                <input
                  type="number"
                  value={card.quantity || ''}
                  onChange={(e) => updateCard(index, 'quantity', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="54"
                />
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          onClick={addCard}
          variant="outline"
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          카드 종류 추가
        </Button>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            추천 슬리브 제품
          </label>
          <input
            type="text"
            value={recommendedProduct}
            onChange={(e) => setRecommendedProduct(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="예: 펀퍼블 스탠다드 슬리브 (63.5x88mm)"
          />
        </div>

        <div className="border-t pt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            구매 링크
          </label>
          {purchaseLinks.map((link, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={link.name}
                  onChange={(e) => updatePurchaseLink(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="상품명 (예: 쿠팡 펀퍼블 슬리브)"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updatePurchaseLink(index, 'url', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="https://"
                />
              </div>
              {purchaseLinks.length > 1 && (
                <button
                  onClick={() => removePurchaseLink(index)}
                  className="text-red-500 hover:text-red-700 p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
          <Button
            type="button"
            onClick={addPurchaseLink}
            variant="outline"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            링크 추가
          </Button>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 오거나이저/인서트 카테고리 (현재 비활성화)
export function OrganizerForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [organizerType, setOrganizerType] = useState(initialData?.data?.organizerType || '');
  const [brand, setBrand] = useState(initialData?.data?.brand || '');
  const [purchaseLink, setPurchaseLink] = useState(initialData?.data?.purchaseLink || '');
  const [printFileLink, setPrintFileLink] = useState(initialData?.data?.printFileLink || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [images, setImages] = useState<string[]>(initialData?.images || initialData?.data?.images || []);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          }
        );

        if (response.ok) {
          const data = await response.json();
          setImages(prev => [...prev, data.imageUrl]);
        }
      }
      toast.success('이미지가 업로드되었습니다');
    } catch (error) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!organizerType.trim()) {
      toast.error('오거나이저 종류를 입력해주세요');
      return;
    }

    const data = {
      postType: 'info',
      title: '오거나이저/인서트',
      description,
      images,
      data: {
        organizerType,
        brand,
        purchaseLink,
        printFileLink,
      }
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">오거나이저/인서트 등록</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          오거나이저 종류 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={organizerType}
          onChange={(e) => setOrganizerType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="예: 공식 인서트, 3D프린트 인서트, 아크릴 오거나이저"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          브랜드/제작자
        </label>
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="예: e-Raptor, Folded Space, 직접제작"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          구매 링크
        </label>
        <input
          type="url"
          value={purchaseLink}
          onChange={(e) => setPurchaseLink(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="https://"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          3D프린트 파일 링크
        </label>
        <input
          type="url"
          value={printFileLink}
          onChange={(e) => setPrintFileLink(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="https://"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          설명
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="오거나이저에 대한 설명을 작성하세요"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이미지 업로드
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          disabled={uploading}
        />
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                <button
                  onClick={() => setImages(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
          disabled={uploading}
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 컴포넌트 업그레이드 카테고리 (현재 비활성화)
export function ComponentUpgradeForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [productName, setProductName] = useState(initialData?.data?.productName || '');
  const [componentType, setComponentType] = useState(initialData?.data?.componentType || '');
  const [brand, setBrand] = useState(initialData?.data?.brand || '');
  const [purchaseLink, setPurchaseLink] = useState(initialData?.data?.purchaseLink || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [images, setImages] = useState<string[]>(initialData?.images || initialData?.data?.images || []);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          }
        );

        if (response.ok) {
          const data = await response.json();
          setImages(prev => [...prev, data.imageUrl]);
        }
      }
      toast.success('이미지가 업로드되었습니다');
    } catch (error) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!productName.trim()) {
      toast.error('제품명을 입력해주세요');
      return;
    }

    const data = {
      postType: 'info',
      title: '컴포넌트 업그레이드',
      description,
      images,
      data: {
        productName,
        componentType,
        brand,
        purchaseLink,
      }
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">컴포넌트 업그레이드 등록</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          제품명 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="예: 메탈 코인, 아크릴 토큰"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          컴포 종류
        </label>
        <input
          type="text"
          value={componentType}
          onChange={(e) => setComponentType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="예: 코인, 토큰, 마커"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          브랜드
        </label>
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="예: TopShelf, Stonemaier Games"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          구매 링크
        </label>
        <input
          type="url"
          value={purchaseLink}
          onChange={(e) => setPurchaseLink(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="https://"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          설명
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="업그레이드 컴포넌트에 대한 설명을 작성하세요"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이미지 업로드
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          disabled={uploading}
        />
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                <button
                  onClick={() => setImages(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
          disabled={uploading}
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 자유 게시물 폼 (커뮤니티형)
export function FreePostForm({ 
  onSubmit, 
  accessToken,
  category,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  category: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.description || '');
  const [images, setImages] = useState<string[]>(initialData?.images || initialData?.data?.images || []);
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState<string[]>(initialData?.data?.tags || []);

  const galleryTags = ['슬리브', '페인팅', '오거나이저', '기타'];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          }
        );

        if (response.ok) {
          const data = await response.json();
          setImages(prev => [...prev, data.imageUrl]);
        }
      }
      toast.success('이미지가 업로드되었습니다');
    } catch (error) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      toast.error('제목과 내용을 입력해주세요');
      return;
    }

    const data = {
      postType: 'post',
      title,
      description: content,
      images,
      data: {
        tags: category === 'gallery' ? tags : [],
      },
    };

    onSubmit(data);
  };

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag));
    } else {
      setTags([...tags, tag]);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">게시물 작성</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          제목 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="제목을 입력하세요"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          내용 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="내용을 입력하세요"
        />
      </div>

      {category === 'gallery' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            작업 종류 태그
          </label>
          <div className="flex flex-wrap gap-2">
            {galleryTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  tags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이미지 업로드
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          disabled={uploading}
        />
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                <button
                  onClick={() => setImages(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
          disabled={uploading}
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 게임 설명(Overview) 카테고리 - 구조화된 폼
export function GameOverviewForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
  selectedGame,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
  selectedGame?: any;
}) {
  const [formData, setFormData] = useState(() => {
    const d = initialData?.data?.data || initialData?.data || {};
    return {
      playerCount: d.playerCount || '',
      bestPlayers: d.bestPlayers || '',
      recommendedPlayers: d.recommendedPlayers || '',
      playTime: d.playTime || '',
      recommendedAge: d.recommendedAge || '',
      difficulty: d.difficulty || '',
      bggScore: d.bggScore || '',
      bggRank: d.bggRank || '',
      description: d.description || '',
      designer: d.designer || '',
      artist: d.artist || '',
      publisher: d.publisher || '',
      expansions: d.expansions || [],
      relatedGames: d.relatedGames || [],
      images: (d.images || []) as string[],
    };
  });

  const [isLoadingBGG, setIsLoadingBGG] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showExpansionSearch, setShowExpansionSearch] = useState(false);
  const [showRelatedSearch, setShowRelatedSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchType, setSearchType] = useState<'expansion' | 'related'>('expansion');

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const loadBGGData = async () => {
    const bggId = selectedGame?.bggId || selectedGame?.id;
    if (!bggId) { toast.error('BGG ID가 없어요'); return; }
    setIsLoadingBGG(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ id: bggId }) }
      );
      if (!response.ok) throw new Error('실패');
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      const minP = data.minPlayers || 0;
      const maxP = data.maxPlayers || 0;
      const players = minP && maxP ? `${minP}-${maxP}명` : '';
      const best = data.bestPlayerCount ? `${data.bestPlayerCount}인` : '';
      const recommended = data.recommendedPlayerCount ? `${data.recommendedPlayerCount}인` : '';
      const score = data.averageRating ? parseFloat(data.averageRating).toFixed(1) : '';
      const weight = data.complexity ? parseFloat(data.complexity).toFixed(2) : '';
      const age = data.minAge ? `${data.minAge}세 이상` : '';
      const minTime = data.minPlayTime || data.maxPlayTime || 0;
      const maxTime = data.maxPlayTime || 0;
      const time = maxTime ? `${minTime}-${maxTime}분` : '';
      const rank = data.rank ? `${data.rank}위` : '';
      const designer = data.designers?.join(', ') || '';
      const artist = data.artists?.join(', ') || '';
      const publisher = data.publishers?.join(', ') || '';

      // 보드라이프 스타일 자동 설명
      const parts = [
        score && `게임평점 ${score}점`,
        weight && `난이도 ${weight}점`,
        age,
        players && `${players}이`,
        time && `${time} 동안 즐길 수 있는 보드게임입니다.`,
      ].filter(Boolean);
      const autoDesc = parts.join(', ');

      // BGG 정보가 충분한지 확인
      const hasData = score || players || time || designer;
      if (!hasData) {
        toast.warning('BGG에 이 게임의 정보가 아직 충분하지 않아요. 직접 입력해주세요.');
      } else {
        toast.success('BGG 정보를 불러왔어요!');
      }

      setFormData(prev => ({
        ...prev,
        playerCount: players || prev.playerCount,
        bestPlayers: best || prev.bestPlayers,
        recommendedPlayers: recommended || prev.recommendedPlayers,
        playTime: time || prev.playTime,
        recommendedAge: age || prev.recommendedAge,
        difficulty: weight || prev.difficulty,
        bggScore: score || prev.bggScore,
        bggRank: rank || prev.bggRank,
        description: prev.description || autoDesc,
        designer: designer || prev.designer,
        artist: artist || prev.artist,
        publisher: publisher || prev.publisher,
      }));
    } catch (e: any) {
      toast.error(`BGG 정보 불러오기 실패: ${e.message || 'BGG에 정보가 없어요'}`);
    } finally {
      setIsLoadingBGG(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
          { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd }
        );
        if (res.ok) {
          const data = await res.json();
          updateFormData('images', [...formData.images, data.imageUrl]);
        }
      }
      toast.success('이미지 업로드 완료');
    } catch { toast.error('이미지 업로드 실패'); }
    setUploading(false);
  };

  const handleSubmit = () => {
    onSubmit({ type: 'info', postType: 'info', data: formData, coverImageUrl: selectedGame?.imageUrl || '' });
  };

  const openSearch = (type: 'expansion' | 'related') => {
    setSearchType(type);
    setSearchQ('');
    if (type === 'expansion') setShowExpansionSearch(true);
    else setShowRelatedSearch(true);
  };

  // 사이트 게임 검색 (보유 게임 목록 기반)
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/all-games`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const q = searchQ.toLowerCase();
          const filtered = (data.games || []).filter((g: any) =>
            (g.koreanName || g.englishName || '').toLowerCase().includes(q)
          ).slice(0, 10);
          setSearchResults(filtered);
        }
      } catch {}
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  const addGame = (game: any) => {
    const item = { id: game.id, name: game.koreanName || game.englishName, imageUrl: game.imageUrl || '' };
    if (searchType === 'expansion') {
      if (!formData.expansions.find((g: any) => g.id === game.id)) {
        updateFormData('expansions', [...formData.expansions, item]);
      }
      setShowExpansionSearch(false);
    } else {
      if (!formData.relatedGames.find((g: any) => g.id === game.id)) {
        updateFormData('relatedGames', [...formData.relatedGames, item]);
      }
      setShowRelatedSearch(false);
    }
  };

  const removeGame = (type: 'expansion' | 'related', id: string) => {
    if (type === 'expansion') updateFormData('expansions', formData.expansions.filter((g: any) => g.id !== id));
    else updateFormData('relatedGames', formData.relatedGames.filter((g: any) => g.id !== id));
  };

  return (
    <div className="space-y-4 p-6 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-white z-10 pb-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">게임 설명 등록</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      </div>

      {/* 표지 이미지 */}
      {selectedGame?.imageUrl && (
        <div className="rounded-xl overflow-hidden">
          <img src={selectedGame.imageUrl} alt={selectedGame.koreanName || selectedGame.englishName || ''}
            className="w-full h-48 object-cover" />
        </div>
      )}

      {/* BGG 정보 불러오기 */}
      {(selectedGame?.bggId || selectedGame?.id) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">BGG 정보 자동 입력</p>
            <p className="text-xs text-blue-700">BoardGameGeek에서 게임 정보를 불러옵니다</p>
          </div>
          <button type="button" onClick={loadBGGData} disabled={isLoadingBGG}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {isLoadingBGG ? '불러오는 중...' : 'BGG 정보 불러오기'}
          </button>
        </div>
      )}

      {/* 기본 정보 */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 border-b pb-2">기본 정보</h4>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">BGG 평점</label>
            <input type="text" value={formData.bggScore} onChange={e => updateFormData('bggScore', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 8.1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">난이도</label>
            <input type="text" value={formData.difficulty} onChange={e => updateFormData('difficulty', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 3.40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">전체 순위</label>
            <input type="text" value={formData.bggRank} onChange={e => updateFormData('bggRank', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 11908위" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">권장 연령</label>
            <input type="text" value={formData.recommendedAge} onChange={e => updateFormData('recommendedAge', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 12세 이상" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">인원</label>
            <input type="text" value={formData.playerCount} onChange={e => updateFormData('playerCount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 2-4명" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">베스트 인원</label>
            <input type="text" value={formData.bestPlayers} onChange={e => updateFormData('bestPlayers', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 4인" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">플레이 시간</label>
            <input type="text" value={formData.playTime} onChange={e => updateFormData('playTime', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: 80-100분" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">디자이너</label>
            <input type="text" value={formData.designer} onChange={e => updateFormData('designer', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: Uwe Rosenberg" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">아트웍</label>
            <input type="text" value={formData.artist} onChange={e => updateFormData('artist', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: Michael Menzel" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">출판사</label>
            <input type="text" value={formData.publisher} onChange={e => updateFormData('publisher', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="예: Lookout Games" />
          </div>
        </div>
      </div>

      {/* 게임 설명 */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 border-b pb-2">게임 설명</h4>
        <textarea value={formData.description} onChange={e => updateFormData('description', e.target.value)}
          rows={5} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
          placeholder="게임에 대한 소개와 설명을 입력해주세요. BGG 불러오기 시 자동으로 채워져요." />
      </div>

      {/* 확장팩 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <h4 className="font-semibold text-gray-900">확장팩</h4>
          <button onClick={() => openSearch('expansion')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600">+ 추가</button>
        </div>
        {formData.expansions.length === 0
          ? <p className="text-xs text-gray-400">등록된 확장팩이 없어요</p>
          : <div className="flex flex-wrap gap-2">
              {formData.expansions.map((g: any) => (
                <div key={g.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1">
                  {g.imageUrl && <img src={g.imageUrl} className="w-5 h-5 rounded object-cover" />}
                  <span className="text-xs text-gray-700">{g.name}</span>
                  <button onClick={() => removeGame('expansion', g.id)} className="text-gray-400 hover:text-gray-600 ml-0.5">✕</button>
                </div>
              ))}
            </div>
        }
      </div>

      {/* 작가의 다른 작품 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <h4 className="font-semibold text-gray-900">작가의 다른 작품</h4>
          <button onClick={() => openSearch('related')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600">+ 추가</button>
        </div>
        {formData.relatedGames.length === 0
          ? <p className="text-xs text-gray-400">등록된 작품이 없어요</p>
          : <div className="flex flex-wrap gap-2">
              {formData.relatedGames.map((g: any) => (
                <div key={g.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1">
                  {g.imageUrl && <img src={g.imageUrl} className="w-5 h-5 rounded object-cover" />}
                  <span className="text-xs text-gray-700">{g.name}</span>
                  <button onClick={() => removeGame('related', g.id)} className="text-gray-400 hover:text-gray-600 ml-0.5">✕</button>
                </div>
              ))}
            </div>
        }
      </div>

      {/* 게임 검색 모달 */}
      {(showExpansionSearch || showRelatedSearch) && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center p-4 pt-16"
          onClick={() => { setShowExpansionSearch(false); setShowRelatedSearch(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-4" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-gray-900 mb-3 text-sm">
              {searchType === 'expansion' ? '확장팩 검색' : '작가의 다른 작품 검색'}
            </h4>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus
              placeholder="보드라움에 등록된 게임 검색..."
              className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none mb-2" />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {searching && <p className="text-center text-sm text-gray-400 py-4">검색 중...</p>}
              {!searching && searchQ && searchResults.length === 0 && <p className="text-center text-sm text-gray-400 py-4">검색 결과 없음</p>}
              {searchResults.map(g => (
                <button key={g.id} onClick={() => addGame(g)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg text-left">
                  {g.imageUrl ? <img src={g.imageUrl} className="w-8 h-8 rounded object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center">🎲</div>}
                  <span className="text-sm text-gray-800">{g.koreanName || g.englishName}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowExpansionSearch(false); setShowRelatedSearch(false); }}
              className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-gray-600">취소</button>
          </div>
        </div>
      )}

      {/* 이미지 업로드 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <h4 className="font-semibold text-gray-900">게임 이미지</h4>
          <label className={`text-xs px-3 py-1 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
            {uploading ? '업로드 중...' : '+ 추가'}
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading}
              onChange={handleImageUpload} />
          </label>
        </div>
        {formData.images.length === 0
          ? <p className="text-xs text-gray-400">등록된 이미지가 없어요</p>
          : <div className="grid grid-cols-3 gap-2">
              {formData.images.map((img: string, idx: number) => (
                <div key={idx} className="relative">
                  <img src={img} className="w-full h-20 object-cover rounded-xl" />
                  <button onClick={() => updateFormData('images', formData.images.filter((_: string, i: number) => i !== idx))}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-500">✕</button>
                </div>
              ))}
            </div>
        }
      </div>

      {/* 하단 버튼 */}
      <div className="sticky bottom-0 bg-white pt-4 border-t flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">취소</button>
        <button onClick={handleSubmit} className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-bold">등록하기</button>
      </div>
    </div>
  );
}

// 게임 구성품 카테고리 - 컴포넌트 정보 폼
export function GameComponentsForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [components, setComponents] = useState<Array<{id: string, type: string, quantity: number, image: string}>>(
    initialData?.data?.components || [{ id: Date.now().toString(), type: '', quantity: 0, image: '' }]
  );
  const [uploading, setUploading] = useState(false);

  const addComponent = () => {
    setComponents([...components, {
      id: Date.now().toString(),
      type: '',
      quantity: 0,
      image: ''
    }]);
  };

  const removeComponent = (id: string) => {
    if (components.length > 1) {
      setComponents(components.filter(c => c.id !== id));
    }
  };

  const updateComponent = (id: string, field: string, value: any) => {
    setComponents(components.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleImageUpload = async (componentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        updateComponent(componentId, 'image', data.imageUrl);
        toast.success('이미지가 업로드되었습니다');
      }
    } catch (error) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    const filledComponents = components.filter(c => c.type.trim());
    if (filledComponents.length === 0) {
      toast.error('최소 1개 이상의 구성품을 입력해주세요');
      return;
    }

    const data = {
      postType: 'info',
      title: '게임 구성품',
      data: {
        components: filledComponents
      }
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4 p-6 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-white z-10 pb-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">게임 구성품 등록</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {components.map((component, index) => (
          <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-start gap-4">
              {/* 이미지 업로드 영역 */}
              <div className="flex-shrink-0">
                {component.image ? (
                  <div className="relative w-32 h-32">
                    <img
                      src={component.image}
                      alt={component.type}
                      className="w-full h-full object-cover rounded-lg border-2 border-gray-300"
                    />
                    <button
                      onClick={() => updateComponent(component.id, 'image', '')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-white hover:border-cyan-500 transition-colors">
                    <label className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500 text-center px-2">이미지 업로드</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(component.id, e)}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* 입력 필드 */}
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    컴포 종류 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="예: 카드, 토큰, 주사위, 타일, 미플 등"
                    value={component.type}
                    onChange={(e) => updateComponent(component.id, 'type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    수량
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={component.quantity}
                    onChange={(e) => updateComponent(component.id, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* 삭제 버튼 */}
              {components.length > 1 && (
                <button
                  onClick={() => removeComponent(component.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* 컴포 인덱스 표시 */}
            <div className="mt-2 text-xs text-gray-500">
              컴포 #{index + 1}
            </div>
          </div>
        ))}

        {/* 컴포 추가 버튼 */}
        <Button
          type="button"
          variant="outline"
          onClick={addComponent}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          컴포 추가
        </Button>
      </div>

      {/* Footer - Sticky */}
      <div className="sticky bottom-0 bg-white pt-4 border-t flex gap-3">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
          disabled={uploading}
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 플레이/규칙 영상 카테고리 - 영상 정보 폼
export function VideoForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [videos, setVideos] = useState<Array<{id: string, title: string, youtubeUrl: string}>>(
    initialData?.data?.videos || []
  );
  const [currentVideo, setCurrentVideo] = useState({ title: '', youtubeUrl: '' });

  const addVideo = () => {
    if (!currentVideo.title.trim() || !currentVideo.youtubeUrl.trim()) {
      toast.error('영상 제목과 유튜브 링크를 입력해주세요');
      return;
    }

    // 유튜브 URL 검증
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
    if (!youtubeRegex.test(currentVideo.youtubeUrl)) {
      toast.error('올바른 유튜브 URL을 입력해주세요');
      return;
    }

    setVideos([...videos, { 
      id: Date.now().toString(), 
      title: currentVideo.title,
      youtubeUrl: currentVideo.youtubeUrl
    }]);
    setCurrentVideo({ title: '', youtubeUrl: '' });
    toast.success('영상이 추가되었습니다');
  };

  const removeVideo = (id: string) => {
    setVideos(videos.filter(v => v.id !== id));
  };

  const handleSubmit = () => {
    if (videos.length === 0) {
      toast.error('최소 1개 이상의 영상을 추가해주세요');
      return;
    }

    const data = {
      postType: 'info',
      title: '플레이/규칙 영상',
      data: {
        videos
      }
    };

    onSubmit(data);
  };

  // 유튜브 URL에서 비디오 ID 추출
  const getYoutubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">플레이/규칙 영상 등록</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 영상 추가 폼 */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <h4 className="font-medium text-gray-900 mb-3">영상 추가</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              영상 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={currentVideo.title}
              onChange={(e) => setCurrentVideo({ ...currentVideo, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="예: 공식 룰 설명 영상, 플레이 영상"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              유튜브 링크 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={currentVideo.youtubeUrl}
              onChange={(e) => setCurrentVideo({ ...currentVideo, youtubeUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <Button
            type="button"
            onClick={addVideo}
            className="w-full bg-cyan-500 hover:bg-cyan-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            영상 추가
          </Button>
        </div>
      </div>

      {/* 추가된 영상 목록 */}
      {videos.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">추가된 영상 ({videos.length}개)</h4>
          {videos.map((video) => {
            const videoId = getYoutubeVideoId(video.youtubeUrl);
            return (
              <div key={video.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900">{video.title}</h5>
                    <a 
                      href={video.youtubeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {video.youtubeUrl}
                    </a>
                  </div>
                  <button
                    onClick={() => removeVideo(video.id)}
                    className="text-red-500 hover:text-red-700 ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {videoId && (
                  <div className="aspect-video">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title={video.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="rounded-lg"
                    ></iframe>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}

// 평가/리뷰 카테고리 - 별점 및 리뷰 폼
export function ReviewForm({ 
  onSubmit, 
  accessToken,
  initialData,
  onCancel,
}: { 
  onSubmit: (data: any) => void;
  accessToken: string;
  initialData?: any;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(initialData?.data?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.description || '');
  const [images, setImages] = useState<string[]>(initialData?.images || []);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          }
        );

        if (response.ok) {
          const data = await response.json();
          setImages(prev => [...prev, data.imageUrl]);
        }
      }
      toast.success('이미지가 업로드되었습니다');
    } catch (error) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error('별점을 선택해주세요');
      return;
    }

    if (!title.trim() || !content.trim()) {
      toast.error('제목과 내용을 입력해주세요');
      return;
    }

    const data = {
      postType: 'post',
      title,
      description: content,
      images,
      data: {
        rating
      },
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">리뷰 작성</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 별점 선택 */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          별점 <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-10 h-10 ${
                  star <= (hoverRating || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
          <span className="ml-3 text-2xl font-bold text-cyan-600">
            {rating > 0 ? `${rating}.0` : '-'}
          </span>
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          리뷰 제목 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="리뷰 제목을 입력하세요"
        />
      </div>

      {/* 내용 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          리뷰 내용 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="게임에 대한 평가와 느낀 점을 작성해주세요"
        />
      </div>

      {/* 이미지 업로드 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이미지 업로드
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          disabled={uploading}
        />
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                <button
                  onClick={() => setImages(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={onCancel} 
          variant="outline"
          className="flex-1"
        >
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600"
          disabled={uploading}
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}