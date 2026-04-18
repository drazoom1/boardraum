# 🚀 BOARDRAUM 백업 - 5분 안에 시작하기

## ✅ 현재 상태 (이미 구현 완료!)

백업 시스템이 **이미 작동 중**입니다! 아무것도 설정할 필요 없어요.

---

## 📦 백업이 어떻게 작동하나요?

### 자동 백업 (권장)
1. 게임을 추가하면 → 자동 백업 ✅
2. 게임을 삭제하면 → 자동 백업 ✅
3. 최신 3개만 보관 (오래된 건 자동 삭제) ✅

### 수동 백업
1. 우측 상단 프로필 사진 클릭
2. "데이터 백업" 메뉴 선택
3. "💾 지금 백업 생성" 버튼 클릭

---

## 🔍 백업 확인하기 (관리자용)

### 방법 1: SQL Editor (가장 쉬움)
```sql
-- 모든 백업 보기
SELECT 
  key,
  (value->>'created_at') as 백업시간,
  (value->>'game_count') as 게임수
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
ORDER BY (value->>'created_at') DESC
LIMIT 20;
```

### 방법 2: 관리자 디버그 메뉴
1. 관리자 계정으로 로그인
2. 우측 하단 "🔧 디버그" 버튼 클릭
3. "전체 회원 데이터 백업" 클릭

---

## 💡 FAQ

### Q: 백업이 어디에 저장되나요?
**A:** Supabase 데이터베이스 `kv_store_0b7d3bae` 테이블에 저장됩니다.

### Q: 몇 개까지 백업되나요?
**A:** 유저당 최대 3개까지 자동으로 유지됩니다.

### Q: 백업을 수동으로 만들 수 있나요?
**A:** 네! "데이터 백업" 메뉴에서 언제든 가능합니다.

### Q: 복구는 어떻게 하나요?
**A:** "데이터 백업" 메뉴에서 복구하고 싶은 백업의 "복구" 버튼을 누르면 됩니다.

### Q: 관리자가 모든 회원을 백업하려면?
**A:** 관리자 디버그 메뉴에서 "전체 회원 데이터 백업" 버튼 클릭!

---

## 🎯 빠른 테스트

### 1. 백업 생성 테스트
```javascript
// 브라우저 콘솔 (F12)에서 실행
const token = localStorage.getItem('supabaseAccessToken');
fetch('https://YOUR_PROJECT.supabase.co/functions/v1/make-server-0b7d3bae/data/auto-backup', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(d => console.log('✅ 백업 성공:', d));
```

### 2. 백업 조회 테스트
```javascript
fetch('https://YOUR_PROJECT.supabase.co/functions/v1/make-server-0b7d3bae/data/backups', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(d => console.log('📋 백업 목록:', d.backups));
```

---

## ⚡ 핵심 포인트

1. ✅ **설정 필요 없음** - 이미 작동 중
2. ✅ **자동 백업** - 게임 변경 시 자동
3. ✅ **안전한 저장** - Supabase DB에 저장
4. ✅ **쉬운 복구** - 클릭 한 번으로 복구
5. ✅ **관리자 지원** - 전체 회원 백업 가능

---

## 🛠️ 문제 해결

### "백업 생성에 실패했습니다"
1. F12 → Console 탭에서 에러 확인
2. 로그인 상태 확인
3. Supabase Edge Functions 로그 확인

### "백업 목록이 비어있어요"
- 정상입니다! 아직 백업을 안 만들었거나
- SQL로 직접 확인: 위의 SQL 쿼리 사용

---

**준비 끝!** 이제 백업을 사용할 수 있습니다 🎉
