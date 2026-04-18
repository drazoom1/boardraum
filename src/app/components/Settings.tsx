import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { X, ExternalLink, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { KeyInspector } from './KeyInspector';

function PrivacySection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-6 border-t border-gray-200">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left">
        <h3 className="text-base font-semibold text-gray-900">🔒 개인정보 처리방침</h3>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="mt-3 text-xs text-gray-700 space-y-3 leading-relaxed bg-gray-50 rounded-xl p-4">
          <p className="text-gray-400 text-[11px]">시행일: 2026년 4월 6일</p>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제1조 (개인정보의 수집·이용 목적)</h4>
            <p>보드라움은 회원 가입·본인 확인, 서비스 제공·운영, 고객 문의 처리, 서비스 개선을 위해 개인정보를 수집·이용합니다.</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제2조 (수집하는 개인정보 항목)</h4>
            <p><b>필수:</b> 이름, 이메일, 비밀번호, 전화번호</p>
            <p><b>자동수집:</b> 서비스 이용 기록, 접속 로그, IP 주소</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제3조 (보유·이용 기간)</h4>
            <p>회원 탈퇴 시까지. 단, 전자상거래 기록 5년, 접속 로그 3개월은 법령에 따라 보관.</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제4조 (제3자 제공)</h4>
            <p>이용자 동의 없이 제3자에게 제공하지 않습니다. 법령·수사기관 요청 시 예외.</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제5조 (이용자의 권리)</h4>
            <p>열람·정정·삭제·처리정지 요구 가능. 문의: sityplanner2@naver.com</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제6조 (개인정보 보호책임자)</h4>
            <p>보드라움 운영팀 · sityplanner2@naver.com</p>
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-1">제7조 (침해 신고·상담)</h4>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>개인정보 침해신고센터: privacy.kisa.or.kr / 118</li>
              <li>개인정보 분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
              <li>대검찰청 사이버수사과: 1301</li>
              <li>경찰청 사이버수사국: 182</li>
            </ul>
          </section>
          <section>
                    <h3 className="font-bold text-gray-900 mb-1">제9조 (광고성 정보 수신 동의)</h3>
                    <p>이벤트·혜택·신규 서비스 안내 등 광고성 정보는 이용자가 별도로 동의한 경우에만 발송합니다.</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>수신 동의: 가입 시 또는 마이페이지 설정에서 선택 가능</li>
                      <li>수신 거부: 언제든지 sityplanner2@naver.com으로 요청하거나 메일 하단 수신거부 링크를 이용</li>
                      <li>광고성 메일 제목에는 반드시 <b>(광고)</b> 표시를 포함합니다</li>
                    </ul>
                  </section>
        </div>
      )}
    </div>
  );
}

interface SettingsProps {
  apiKey: string;
  spreadsheetId: string;
  onApiKeyChange: (key: string) => void;
  onSpreadsheetIdChange: (id: string) => void;
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e && e.parameter ? e.parameter.action : null;
  
  if (action === 'read') {
    return readData(ss);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Invalid action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'No data provided'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = JSON.parse(e.postData.contents);
  
  if (data.action === 'write') {
    return writeData(ss, data);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Invalid action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function readData(ss) {
  try {
    const ownedSheet = ss.getSheetByName('보유 리스트') || ss.insertSheet('보유 리스트');
    const wishlistSheet = ss.getSheetByName('구매 예정 리스트') || ss.insertSheet('구매 예정 리스트');
    
    const ownedData = ownedSheet.getDataRange().getValues();
    const wishlistData = wishlistSheet.getDataRange().getValues();
    
    const ownedGames = parseSheetData(ownedData, 'owned');
    const wishlistGames = parseSheetData(wishlistData, 'wishlist');
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      ownedGames: ownedGames,
      wishlistGames: wishlistGames
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseSheetData(data, type) {
  if (data.length <= 1) return [];
  
  const games = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Skip empty rows
    
    games.push({
      id: type + '-' + i,
      imageUrl: '',
      koreanName: row[0] || '',
      englishName: row[1] || '',
      recommendedPlayers: row[2] || '',
      playTime: row[3] || '',
      difficulty: row[4] || '',
      videoUrl: row[5] || ''
    });
  }
  
  return games;
}

function writeData(ss, data) {
  try {
    const ownedSheet = ss.getSheetByName('보유 리스트') || ss.insertSheet('보유 리스트');
    const wishlistSheet = ss.getSheetByName('구매 예정 리스트') || ss.insertSheet('구매 예정 리스트');
    
    // Clear existing data
    ownedSheet.clear();
    wishlistSheet.clear();
    
    // Write headers
    const headers = [['한국어명', '영문명', '추천인원', '플레이시간', '난이도', '게임설명영상']];
    
    // Write owned games
    const ownedData = data.ownedGames.map(game => [
      game.koreanName,
      game.englishName,
      game.recommendedPlayers,
      game.playTime,
      game.difficulty,
      game.videoUrl
    ]);
    ownedSheet.getRange(1, 1, 1, 6).setValues(headers);
    if (ownedData.length > 0) {
      const dataRange = ownedSheet.getRange(2, 1, ownedData.length, 6);
      dataRange.setValues(ownedData);
      // 모든 데이터를 텍스트로 강제 설정
      dataRange.setNumberFormat('@');
    }
    
    // Format owned sheet
    formatSheet(ownedSheet, ownedData.length);
    
    // Write wishlist games
    const wishlistData = data.wishlistGames.map(game => [
      game.koreanName,
      game.englishName,
      game.recommendedPlayers,
      game.playTime,
      game.difficulty,
      game.videoUrl
    ]);
    wishlistSheet.getRange(1, 1, 1, 6).setValues(headers);
    if (wishlistData.length > 0) {
      const dataRange = wishlistSheet.getRange(2, 1, wishlistData.length, 6);
      dataRange.setValues(wishlistData);
      // 모든 데이터를 텍스트로 강제 설정
      dataRange.setNumberFormat('@');
    }
    
    // Format wishlist sheet
    formatSheet(wishlistSheet, wishlistData.length);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data written successfully'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function formatSheet(sheet, dataRowCount) {
  // 헤더 서식 (1행)
  const headerRange = sheet.getRange(1, 1, 1, 6);
  headerRange.setBackground('#4285F4'); // 파란색 배경
  headerRange.setFontColor('#FFFFFF'); // 흰색 텍스트
  headerRange.setFontWeight('bold'); // 굵게
  headerRange.setFontSize(12); // 글씨 크기
  headerRange.setHorizontalAlignment('center'); // 가운데 정렬
  headerRange.setVerticalAlignment('middle'); // 세로 가운데 정렬
  
  // 헤더 행 높이
  sheet.setRowHeight(1, 40);
  
  // 데이터 행 서식 (2행부터)
  if (dataRowCount > 0) {
    const dataRange = sheet.getRange(2, 1, dataRowCount, 6);
    dataRange.setVerticalAlignment('middle'); // 세로 가운데 정렬
    dataRange.setFontSize(11); // 데이터 글씨 크기
    
    // 데이터 행 높이
    for (let i = 0; i < dataRowCount; i++) {
      sheet.setRowHeight(i + 2, 35);
    }
    
    // 교차 행 배경색 (zebra striping)
    for (let i = 0; i < dataRowCount; i++) {
      const rowRange = sheet.getRange(i + 2, 1, 1, 6);
      if (i % 2 === 0) {
        rowRange.setBackground('#F8F9FA'); // 연한 회색
      } else {
        rowRange.setBackground('#FFFFFF'); // 흰색
      }
    }
  }
  
  // 전체 테두리
  const allRange = sheet.getRange(1, 1, dataRowCount + 1, 6);
  allRange.setBorder(true, true, true, true, true, true, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
  
  // 열 너비 자동 조정
  sheet.autoResizeColumns(1, 6);
  
  // 최소 열 너비 설정 (더 넓게)
  for (let col = 1; col <= 6; col++) {
    const currentWidth = sheet.getColumnWidth(col);
    if (currentWidth < 150) {
      sheet.setColumnWidth(col, 150);
    }
  }
  
  // 헤더 행 고정 (스크롤 시 항상 보이게)
  sheet.setFrozenRows(1);
}`;

export function Settings({
  apiKey,
  spreadsheetId,
  onApiKeyChange,
  onSpreadsheetIdChange,
  onClose,
}: SettingsProps) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleApiKeyChange = (value: string) => {
    onApiKeyChange(value);
    localStorage.setItem('googleApiKey', value);
  };

  const handleSpreadsheetIdChange = (value: string) => {
    onSpreadsheetIdChange(value);
    localStorage.setItem('spreadsheetId', value);
  };

  const testConnection = async () => {
    if (!apiKey) {
      toast.error('Apps Script URL을 먼저 입력하세요!');
      return;
    }

    setTesting(true);
    try {
      console.log('Testing connection to:', apiKey);
      
      const response = await fetch(`${apiKey}?action=read`, {
        method: 'GET',
        redirect: 'follow',
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      const text = await response.text();
      console.log('Response body:', text);
      
      const result = JSON.parse(text);
      
      if (result.status === 'success') {
        toast.success('✅ 연결 성공! Apps Script가 정상 작동합니다.');
      } else {
        toast.error(`❌ 연결 실패: ${result.message}`);
      }
    } catch (error: any) {
      console.error('Connection test error:', error);
      toast.error(`❌ 연결 테스트 실패: ${error.message}. 브라우저 콘솔(F12)에서 자세한 에러를 확인하세요.`);
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = () => {
    // Fallback method for clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = APPS_SCRIPT_CODE;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      textArea.remove();
      setCopied(true);
      toast.success('코드가 클립보드에 복사되었습니다!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      textArea.remove();
      toast.error('복사에 실패했습니다. 수동으로 복사해주세요.');
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Google Sheets Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">구글 시트 연동</h3>
        <div className="space-y-2">
          <Label htmlFor="apiKey">Apps Script 웹 앱 URL</Label>
          <Input
            id="apiKey"
            type="text"
            placeholder="https://script.google.com/macros/s/..."
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={testConnection}
          disabled={testing}
        >
          {testing ? '테스트 중...' : '연결 테스트'}
        </Button>

        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <summary className="font-semibold text-gray-900 cursor-pointer">📋 구글 시트 설정 방법 보기</summary>
          <div className="mt-4 space-y-4">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>
                <a
                  href="https://sheets.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  구글 시트 <ExternalLink className="w-3 h-3 inline" />
                </a>
                에서 새 스프레드시트 생성
              </li>
              <li>상단 메뉴 → 확장 프로그램 → Apps Script 클릭</li>
              <li>기본 코드를 모두 지우고 아래 코드 복사 붙여넣기</li>
              <li>저장 (💾 또는 Ctrl+S)</li>
              <li>배포 → 새 배포 → 유형: 웹 앱</li>
              <li>
                <strong>액세스 권한: "모든 사용자"</strong> 선택 ⚠️
              </li>
              <li>생성된 웹 앱 URL을 위에 입력</li>
            </ol>

            <div className="bg-gray-100 border border-gray-300 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm">Apps Script 코드</h4>
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="text-xs bg-white border rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                <code>{APPS_SCRIPT_CODE}</code>
              </pre>
            </div>
          </div>
        </details>
      </div>

      {/* Key Inspector */}
      <div className="pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🔍 데이터 검사 (관리자용)</h3>
        <KeyInspector />
      </div>

      {/* 개인정보 처리방침 */}
      <PrivacySection />
    </div>
  );
}