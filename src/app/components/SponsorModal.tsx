import { X, ExternalLink } from 'lucide-react';
import sponsorQR from 'figma:asset/231cd455892355a3afe7c103b70b835878036b37.png';

interface Props {
  onClose: () => void;
}

export function SponsorModal({ onClose }: Props) {
  const sponsorUrl = 'https://qr.kakaopay.com/Ej70dAkrd5dc05654';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">후원하기</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          <p className="text-sm text-gray-600 text-center mb-6">
            BOARDRAUM의 개발과 운영을 위해<br />
            커피 한 잔의 후원 부탁드립니다 ☕️
          </p>

          {/* QR Code Image */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <img 
              src={sponsorQR} 
              alt="카카오페이 후원 QR 코드" 
              className="w-64 h-64 object-contain"
            />
          </div>

          {/* Link Button */}
          <a
            href={sponsorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl transition-colors shadow-md hover:shadow-lg w-full justify-center"
          >
            <span>카카오페이로 후원하기</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          <p className="text-xs text-gray-400 mt-4 text-center">
            QR 코드를 스캔하거나 버튼을 클릭해주세요
          </p>
        </div>
      </div>
    </div>
  );
}