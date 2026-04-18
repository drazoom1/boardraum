import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { KeyInspector } from './components/KeyInspector';

export default function KeyInspectorApp() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster position="top-center" />
      
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔍 BOARDRAUM KV Store 검사 도구
          </h1>
          <p className="text-gray-600">
            전체 키를 조회하여 데이터 구조를 파악합니다
          </p>
        </div>

        <KeyInspector />
      </div>
    </div>
  );
}
