import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BannerProps {
  imageUrl?: string;
}

export function Banner({ imageUrl }: BannerProps) {
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!imageUrl || imageError) return null;

  return (
    <div className="mb-6 rounded-lg shadow-lg overflow-hidden">
      <div
        className="relative overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? '600px' : '80px' }}
      >
        <img
          src={imageUrl}
          alt="Banner"
          className="w-full h-auto object-cover object-top"
          onError={() => setImageError(true)}
        />
        {/* 접혔을 때 하단 페이드 */}
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        )}
      </div>
      {/* 화살표 버튼 */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-center py-1.5 bg-black/5 hover:bg-black/10 transition-colors"
      >
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-500" />
          : <ChevronDown className="w-4 h-4 text-gray-500" />
        }
      </button>
    </div>
  );
}
