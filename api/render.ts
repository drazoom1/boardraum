import type { VercelRequest, VercelResponse } from '@vercel/node';
// SSR: 게임/글 URL을 봇이 읽을 수 있는 HTML로 (rebuild touch)

// 게임/글 상세 URL을 봇이 읽을 수 있도록 서버에서 제목·본문·메타·JSON-LD가 채워진 HTML을 반환한다.
// 사람은 그대로 SPA(React)가 #root를 다시 렌더하므로 동작에는 영향 없음.

const SUPA = 'https://wwpvntmueafieessgnbu.supabase.co/functions/v1/make-server-0b7d3bae';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cHZudG11ZWFmaWVlc3NnbmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDczMjUsImV4cCI6MjA3MDI4MzMyNX0.KG4yuo02jACcVOlG7av3bMFmRcfHK6lzu0x78RMhz0c';
const SITE = 'https://www.boardraum.site';

function esc(s: unknown = ''): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ANON_KEY}` }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchShell(host: string): Promise<string> {
  const r = await fetch(`https://${host}/index.html`);
  return await r.text();
}

type Meta = { title: string; description: string; image?: string; url: string; jsonLd?: unknown };

function injectHead(html: string, m: Meta): string {
  const tags = [
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}" />` : '',
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}" />` : '',
    `<link rel="canonical" href="${esc(m.url)}" />`,
    m.jsonLd ? `<script type="application/ld+json">${jsonLd(m.jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n    ');

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(m.description)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  return out.replace('</head>', `    ${tags}\n  </head>`);
}

function injectBody(html: string, contentHtml: string): string {
  return html.replace('<div id="root"></div>', `<div id="root">${contentHtml}</div>`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = (req.headers.host as string) || 'www.boardraum.site';
  const type = String(req.query.type || '');
  let html = '';
  try {
    html = await fetchShell(host);
  } catch {
    res.status(502).send('shell fetch failed');
    return;
  }

  try {
    if (type === 'post') {
      const id = String(req.query.id || '');
      const data = await fetchJson(`${SUPA}/community/posts/${encodeURIComponent(id)}`);
      const post = data?.post;
      if (post && !post.isPrivate && !post.isDraft) {
        const body = String(post.content || '').replace(/\s+/g, ' ').trim();
        const title = (post.title && String(post.title).trim()) || body.slice(0, 40) || '보드라움 게시물';
        const description = (body || title).slice(0, 160);
        const image = (Array.isArray(post.images) && post.images[0]) || post.linkedGame?.imageUrl || '';
        const url = `${SITE}/post/${encodeURIComponent(id)}`;
        const contentHtml =
          `<article>` +
          `<h1>${esc(title)}</h1>` +
          (post.userName ? `<p>${esc(post.userName)}</p>` : '') +
          `<div>${esc(String(post.content || '')).replace(/\n/g, '<br>')}</div>` +
          (image ? `<img src="${esc(image)}" alt="${esc(title)}" />` : '') +
          `</article>`;
        const ld = {
          '@context': 'https://schema.org',
          '@type': 'SocialMediaPosting',
          headline: title,
          articleBody: body,
          ...(post.createdAt ? { datePublished: post.createdAt } : {}),
          ...(post.userName ? { author: { '@type': 'Person', name: post.userName } } : {}),
          ...(image ? { image } : {}),
          url,
        };
        html = injectHead(html, { title: `${title} | 보드라움`, description, image, url, jsonLd: ld });
        html = injectBody(html, contentHtml);
      }
    } else if (type === 'game') {
      let slug = String(req.query.slug || '');
      let name = slug;
      try { name = decodeURIComponent(slug); } catch { /* keep */ }
      const g = await fetchJson(`${SUPA}/game/info?name=${encodeURIComponent(name)}`);
      if (g && (g.koreanName || g.id)) {
        const gameName = g.koreanName || g.englishName || name;
        const title = `${gameName} — 보드라움`;
        const description = `${gameName}${g.englishName && g.englishName !== gameName ? ` (${g.englishName})` : ''}${g.yearPublished ? ` ${g.yearPublished}년` : ''} 보드게임 정보·플레이 인원·후기를 보드라움에서 확인하세요.`.slice(0, 160);
        const image = g.imageUrl || '';
        const url = `${SITE}/game/${encodeURIComponent(slug)}`;
        const contentHtml =
          `<article>` +
          `<h1>${esc(gameName)}</h1>` +
          (g.englishName ? `<p>${esc(g.englishName)}</p>` : '') +
          `<p>${esc(description)}</p>` +
          (image ? `<img src="${esc(image)}" alt="${esc(gameName)}" />` : '') +
          `</article>`;
        const ld = {
          '@context': 'https://schema.org',
          '@type': 'Game',
          name: gameName,
          ...(g.englishName ? { alternateName: g.englishName } : {}),
          ...(image ? { image } : {}),
          ...(g.yearPublished ? { datePublished: String(g.yearPublished) } : {}),
          url,
        };
        html = injectHead(html, { title, description, image, url, jsonLd: ld });
        html = injectBody(html, contentHtml);
      }
    }
  } catch {
    // 데이터 주입 실패 시 원본 SPA 셸을 그대로 반환 (앱이 클라이언트에서 처리)
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
