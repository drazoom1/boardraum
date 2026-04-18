/**
 * 동적 SEO 메타태그 업데이트 유틸리티
 * SPA에서 페이지 전환 시 document.title, meta description, OG 태그, canonical, JSON-LD를 업데이트
 */

const DEFAULT_TITLE = '보드라움 - 보드게임 컬렉션 관리 커뮤니티';
const DEFAULT_DESC = '보드게임 컬렉션을 관리하고, 위시리스트를 만들고, 보드게이머들과 소통하는 커뮤니티. 보드라움에서 내 보드게임을 정리해보세요.';
const SITE_URL = 'https://boardraum.site';
const DEFAULT_IMAGE = `${SITE_URL}/icon.png`;

function setMetaContent(selector: string, content: string, attr = 'content') {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, content);
}

/** 게임 위키 페이지용 SEO 메타태그 업데이트 */
export function updateGameSEO(gameName: string, imageUrl?: string, description?: string) {
  const title = `${gameName} - 보드게임 정보 | 보드라움`;
  const desc = description || `${gameName} 보드게임 정보, 리뷰, 평점, 게시물을 보드라움에서 확인하세요.`;
  const url = `${SITE_URL}/game/${encodeURIComponent(gameName)}`;
  const image = imageUrl || DEFAULT_IMAGE;

  document.title = title;
  setMetaContent('meta[name="description"]', desc);
  setMetaContent('link[rel="canonical"]', url, 'href');

  // Open Graph
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', desc);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[property="og:image"]', image);

  // Twitter
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', desc);
  setMetaContent('meta[name="twitter:image"]', image);

  // JSON-LD for game
  let ldScript = document.getElementById('dynamic-jsonld');
  if (!ldScript) {
    ldScript = document.createElement('script');
    ldScript.id = 'dynamic-jsonld';
    ldScript.setAttribute('type', 'application/ld+json');
    document.head.appendChild(ldScript);
  }
  ldScript.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Game',
    name: gameName,
    description: desc,
    image: image,
    url: url,
    publisher: { '@type': 'Organization', name: '보드라움', url: SITE_URL },
  });
}

/** 기본 메인 페이지 SEO로 복원 */
export function resetSEO() {
  document.title = DEFAULT_TITLE;
  setMetaContent('meta[name="description"]', DEFAULT_DESC);
  setMetaContent('link[rel="canonical"]', SITE_URL, 'href');
  setMetaContent('meta[property="og:title"]', DEFAULT_TITLE);
  setMetaContent('meta[property="og:description"]', DEFAULT_DESC.slice(0, 100));
  setMetaContent('meta[property="og:url"]', SITE_URL);
  setMetaContent('meta[property="og:image"]', DEFAULT_IMAGE);
  setMetaContent('meta[name="twitter:title"]', DEFAULT_TITLE);
  setMetaContent('meta[name="twitter:description"]', DEFAULT_DESC.slice(0, 100));
  setMetaContent('meta[name="twitter:image"]', DEFAULT_IMAGE);

  const ldScript = document.getElementById('dynamic-jsonld');
  if (ldScript) ldScript.remove();
}

/** 게시물 페이지용 SEO 메타태그 업데이트 */
export function updatePostSEO(postId: string, content: string, gameName?: string, imageUrl?: string) {
  const truncated = content.replace(/\n/g, ' ').slice(0, 50);
  const title = gameName
    ? `${gameName} - ${truncated} | 보드라움`
    : `${truncated} | 보드라움`;
  const desc = content.slice(0, 150).replace(/\n/g, ' ');
  const url = `${SITE_URL}/post/${postId}`;
  const image = imageUrl || DEFAULT_IMAGE;

  document.title = title;
  setMetaContent('meta[name="description"]', desc);
  setMetaContent('link[rel="canonical"]', url, 'href');

  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', desc);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[property="og:image"]', image);

  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', desc);
  setMetaContent('meta[name="twitter:image"]', image);

  let ldScript = document.getElementById('dynamic-jsonld');
  if (!ldScript) {
    ldScript = document.createElement('script');
    ldScript.id = 'dynamic-jsonld';
    ldScript.setAttribute('type', 'application/ld+json');
    document.head.appendChild(ldScript);
  }
  ldScript.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: title,
    description: desc,
    image: image,
    url: url,
    publisher: { '@type': 'Organization', name: '보드라움', url: SITE_URL },
  });
}