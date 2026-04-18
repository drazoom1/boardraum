# 📦 BOARDRAUM 백업 가이드

## ✅ 백업 시스템 현황

### 🗄️ 저장 위치
- **데이터베이스**: Supabase Postgres
- **테이블**: `kv_store_0b7d3bae`
- **백업 키 패턴**: `backup_user_{유저ID}_{타임스탬프}`

### 🔧 백업 기능

#### 1️⃣ 개인 사용자 백업 (자동)
- **자동 백업**: 게임 추가/삭제 시 자동으로 백업 생성
- **보관 개수**: 유저당 최대 3개 백업 유지
- **저장 내용**: 
  - 보유 게임 목록
  - 위시리스트 게임 목록
  - 플레이 기록

#### 2️⃣ 관리자 전용 전체 백업
- **위치**: 관리자 페이지 → "전체 회원 데이터 백업" 버튼
- **기능**: 모든 승인된 베타 테스터의 데이터를 한 번에 백업
- **엔드포인트**: `POST /make-server-0b7d3bae/data/admin-backup-all`

---

## 🔍 백업 데이터 확인하기

### SQL Editor에서 백업 조회

Supabase Dashboard → SQL Editor → New Query

#### 1. 모든 백업 보기
```sql
SELECT 
  key,
  (value->>'created_at') as created_at,
  (value->>'user_id') as user_id,
  (value->>'game_count') as game_count
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
ORDER BY (value->>'created_at') DESC;
```

#### 2. 특정 사용자의 백업 찾기
```sql
-- 사용자 ID를 알아야 함 (예: '12345678-1234-1234-1234-123456789abc')
SELECT 
  key,
  (value->>'created_at') as created_at,
  (value->'backup_data'->'ownedGames') as owned_count,
  (value->'backup_data'->'wishlistGames') as wishlist_count
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_user_YOUR_USER_ID_%'
ORDER BY key DESC;
```

#### 3. 백업 통계
```sql
SELECT 
  COUNT(*) as total_backups,
  COUNT(DISTINCT (value->>'user_id')) as users_with_backups
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%';
```

#### 4. 최근 백업 10개
```sql
SELECT 
  key,
  (value->>'created_at') as backup_time,
  (value->>'user_id') as user_id,
  (value->>'game_count') as total_games
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
ORDER BY (value->>'created_at') DESC
LIMIT 10;
```

---

## 🚀 백업 생성 방법

### 방법 1: 자동 백업 (권장)
게임을 추가하거나 삭제하면 자동으로 백업이 생성됩니다.

### 방법 2: 수동 백업 (개발자용)
브라우저 콘솔에서:
```javascript
const token = localStorage.getItem('supabaseAccessToken');
const projectId = 'YOUR_PROJECT_ID';

fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/auto-backup`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => console.log('✅ Backup created:', data))
.catch(err => console.error('❌ Backup failed:', err));
```

### 방법 3: 관리자 전체 백업
1. 관리자 계정으로 로그인 (sityplanner2@naver.com)
2. 우측 하단 "관리자" 버튼 클릭
3. "전체 회원 데이터 백업" 버튼 클릭

---

## 🔄 백업 복구 방법

### API 호출 (개발자용)
```javascript
const token = localStorage.getItem('supabaseAccessToken');
const projectId = 'YOUR_PROJECT_ID';
const backupKey = 'backup_user_12345_1234567890';

fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/restore-backup`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ key: backupKey })
})
.then(res => res.json())
.then(data => console.log('✅ Restored:', data))
.catch(err => console.error('❌ Restore failed:', err));
```

---

## ⚠️ 주의사항

### Figma Make 환경 제약
- ❌ 별도 백업 테이블 생성 불가
- ❌ 마이그레이션 파일 실행 불가
- ❌ DDL 문장 직접 실행 불가
- ✅ `kv_store_0b7d3bae` 테이블만 사용 가능

### 백업 제한
- 유저당 최대 3개 백업만 유지
- 오래된 백업은 자동 삭제됨
- 백업 크기는 개별 게임 데이터 크기에 따라 다름

### 데이터 안전성
- 백업은 동일한 KV 테이블에 저장됨
- DB 자체에 문제가 생기면 백업도 손실될 수 있음
- **중요**: 정기적으로 Supabase 대시보드에서 직접 확인 권장

---

## 📊 백업 모니터링

### 헬스 체크
```sql
-- 최근 24시간 내 백업 생성 여부
SELECT COUNT(*) as recent_backups
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp > NOW() - INTERVAL '24 hours';
```

### 백업 누락 확인
```sql
-- 백업이 없는 유저 찾기
SELECT DISTINCT 
  SUBSTRING(key FROM 'user_([^_]+)_') as user_id
FROM kv_store_0b7d3bae
WHERE key LIKE 'user_%_owned'
  AND NOT EXISTS (
    SELECT 1 FROM kv_store_0b7d3bae b
    WHERE b.key LIKE 'backup_user_' || SUBSTRING(key FROM 'user_([^_]+)_') || '_%'
  );
```

---

## 🛠️ 문제 해결

### 백업이 생성되지 않는 경우
1. **로그인 확인**: 유효한 세션이 있는지 확인
2. **서버 로그 확인**: Supabase → Edge Functions → Logs
3. **브라우저 콘솔 확인**: F12 → Console 탭

### 백업 목록이 안 보이는 경우
1. SQL Editor에서 직접 조회
2. 키 패턴 확인: `backup_user_{유저ID}_`
3. 사용자 ID 확인: `SELECT auth.uid()`

---

## 📞 지원

문제가 지속되면:
1. Supabase Edge Functions 로그 확인
2. 브라우저 개발자 도구 Network 탭 확인
3. 이 가이드의 SQL 쿼리로 수동 확인

---

**마지막 업데이트**: 2025-03-01
**버전**: 1.0
