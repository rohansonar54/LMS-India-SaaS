'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import SimpleLaundryLoader from '@/components/SimpleLaundryLoader';

interface TabLoadingContextType {
  isTabLoading: boolean;
  setTabLoading: (loading: boolean, text?: string) => void;
  loadingText: string;
}

const TabLoadingContext = createContext<TabLoadingContextType>({
  isTabLoading: false,
  setTabLoading: () => {},
  loadingText: 'Loading Tab...',
});

export function TabLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading Tab...');
  const pathname = usePathname();

  // Reset loading whenever route pathname completes changing
  useEffect(() => {
    setIsTabLoading(false);
  }, [pathname]);

  const setTabLoading = (loading: boolean, text = 'Loading Tab...') => {
    // Strictly exclude Queue Board as requested
    if (pathname === '/queue') return;
    setLoadingText(text);
    setIsTabLoading(loading);
  };

  return (
    <TabLoadingContext.Provider value={{ isTabLoading, setTabLoading, loadingText }}>
      {children}

      {/* Global Tab Switching Overlay with Backdrop Blur (Strictly excludes Queue Board) */}
      {isTabLoading && pathname !== '/queue' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <SimpleLaundryLoader text={loadingText} />
        </div>
      )}
    </TabLoadingContext.Provider>
  );
}

export const useTabLoading = () => useContext(TabLoadingContext);
