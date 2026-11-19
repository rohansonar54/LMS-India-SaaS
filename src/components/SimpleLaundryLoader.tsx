'use client';

import React from 'react';

interface SimpleLaundryLoaderProps {
  text?: string;
  subtext?: string;
  className?: string;
  compact?: boolean;
}

export default function SimpleLaundryLoader({
  text = 'Loading...',
  className = '',
}: SimpleLaundryLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-white/95 backdrop-blur-md px-6 py-4 rounded-2xl shadow-xl border border-slate-200/90 space-y-2.5 select-none min-w-[130px] animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* Clean, minimalist Laundry Iron with Spinner Ring */}
      <div className="relative w-10 h-10 flex items-center justify-center">
        {/* Subtle high-tech spin ring */}
        <div className="w-10 h-10 rounded-full border-2 border-blue-100 border-t-blue-600 animate-spin" />

        {/* Minimalist Laundry Steam Iron Vector */}
        <svg
          className="w-4 h-4 text-blue-600 absolute"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Iron Base & Wedge */}
          <path d="M4 18h14a3 3 0 0 0 3-3c0-2-1.5-3.5-3.5-4L6 11a3 3 0 0 0-2 2.8V18z" />
          {/* Iron Handle */}
          <path d="M7 11V7a2 2 0 0 1 2-2h5" />
          {/* Temperature Dial */}
          <circle cx="12" cy="14" r="1" fill="currentColor" />
        </svg>
      </div>

      {/* Clean text */}
      <span className="text-xs font-semibold text-slate-700 tracking-wide">
        {text}
      </span>
    </div>
  );
}
