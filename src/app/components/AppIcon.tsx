import React from 'react';
import iconImage from 'figma:asset/1d2da99221780c018fbc2b913241cabdb54e5b9f.png';

// This component exports the app icon for use in public assets
export const AppIcon: React.FC = () => {
  return (
    <img 
      src={iconImage} 
      alt="보드라움 아이콘" 
      style={{ width: '100%', height: '100%' }}
    />
  );
};

// Export the image URL for direct use
export const iconUrl = iconImage;
