'use client';

import React from 'react';
import SimpleLaundryLoader from './SimpleLaundryLoader';

interface BlurLoaderOverlayProps {
  loading: boolean;
  text?: string;
  subtext?: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export default function BlurLoaderOverlay({
  loading,
  text = 'Loading...',
  children,
  className = '',
}: BlurLoaderOverlayProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Content blurred while processing */}
      <div
        className={`transition-all duration-200 ease-in-out ${
          loading
            ? 'filter blur-[3px] opacity-50 pointer-events-none select-none'
            : 'filter-none opacity-100'
        }`}
      >
        {children}
      </div>

      {/* Fixed Full-Screen Centered Simple Loader (Locked to same exact place for all pages) */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <SimpleLaundryLoader text={text} />
        </div>
      )}
    </div>
  );
}
