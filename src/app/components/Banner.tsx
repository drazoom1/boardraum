import { useState } from 'react';

interface BannerProps {
  imageUrl?: string;
}

export function Banner({ imageUrl }: BannerProps) {
  const [imageError, setImageError] = useState(false);

  // Custom image banner mode
  if (imageUrl && !imageError) {
    return (
      <div className="mb-6 overflow-hidden rounded-lg shadow-lg">
        <img
          src={imageUrl}
          alt="Banner"
          className="w-full h-auto max-h-64 object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // No banner to show
  return null;
}
