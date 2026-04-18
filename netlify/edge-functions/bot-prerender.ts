/**
 * Netlify Edge Function - Bot Prerender
 * 
 * 검색엔진 크롤러(Googlebot, Bingbot 등)가 접속하면
 * Supabase 서버의 /prerender 엔드포인트에서 메타태그가 채워진 HTML을 받아 반환합니다.
 * 일반 사용자는 그대로 SPA를 이용합니다.
 */

const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'slurp',        // Yahoo
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebot',      // Facebook
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'kakaotalk-scrap', // 카카오톡
  'slackbot',
  'telegrambot',
  'discordbot',
  'pinterestbot',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'ia_archiver',  // Alexa
  'rogerbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'vkshare',
  'w3c_validator',
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

const PRERENDER_BASE = 'https://wwpvntmueafieessgnbu.supabase.co/functions/v1/make-server-0b7d3bae/prerender';

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // prerender 대상 경로만 처리 (/game/*, /post/*)
  const shouldPrerender = path.startsWith('/game/') || path.startsWith('/post/');
  if (!shouldPrerender) {
    return; // pass through to SPA
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (!isBot(userAgent)) {
    return; // 일반 사용자 → SPA pass through
  }

  // 크롤러 감지 → prerender HTML 반환
  try {
    const prerenderUrl = `${PRERENDER_BASE}?path=${encodeURIComponent(path)}`;
    const response = await fetch(prerenderUrl, {
      headers: { 'Accept': 'text/html' },
    });

    if (response.ok) {
      const html = await response.text();
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'X-Prerender': 'true',
        },
      });
    }
  } catch (e) {
    // prerender 실패 시 SPA로 fallback
    console.error('Prerender error:', e);
  }

  return; // fallback to SPA
}

export const config = {
  path: ['/game/*', '/post/*'],
};
