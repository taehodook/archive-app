# 유용정보 아카이브

URL 기반 개인 정보 아카이브 PWA. 인스타/유튜브 등에서 본 유용한 콘텐츠를 빠르게 저장하고 검색합니다.

## 주요 기능

- **빠른 저장**: URL 입력 → 카테고리 선택 → 끝 (5초 이내)
- **자동 보강**: 입력한 URL의 제목/썸네일/작성자 자동 추출 (Vercel API + Open Graph)
- **공유시트 통합**: 안드로이드에서 인스타/유튜브 "공유 → 아카이브" 1탭 저장
- **카테고리 관리**: 추가/삭제/순서 변경/이름 수정 가능
- **키워드 태깅**: 자유 입력, 검색 가능
- **검색/필터**: 제목·메모·URL·키워드 전체 검색
- **PWA**: 홈 화면 설치, 오프라인 작동
- **Firebase 동기화**: 여러 기기에서 동일한 데이터 (선택)

## 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000

## Firebase 설정 (선택)

`.env.local` 생성:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Firebase 미설정 시 자동으로 로컬스토리지 모드로 작동.

Realtime DB 사용 노드:
- `archive/` - 아이템 데이터
- `archive_categories` - 카테고리 배열

## Vercel 배포

```bash
vercel
```

또는 GitHub 연결 후 자동 배포. 환경변수는 Vercel 대시보드에서 추가.

## 안드로이드 공유시트 통합

1. Chrome으로 배포된 사이트 방문
2. "홈 화면에 추가" 또는 자동 설치 배너에서 설치
3. 인스타/유튜브에서 공유 → 아카이브 앱이 목록에 나타남
4. 선택하면 URL이 자동 입력된 상태로 앱 실행

## 디렉토리

```
pages/
  index.js          메인 페이지
  _app.js, _document.js  Next.js 기본
  api/preview.js    Open Graph 자동 보강 API
lib/firebase.js     Firebase 초기화
public/
  manifest.json     PWA manifest (share_target 포함)
  sw.js             Service Worker
  icons/            앱 아이콘
styles/globals.css  전역 스타일
```
