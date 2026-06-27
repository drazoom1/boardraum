import type { VercelRequest, VercelResponse } from '@vercel/node';

// 게임/글 상세 URL을 봇이 읽을 수 있도록 서버에서 제목·본문·메타·JSON-LD가 채워진 HTML을 반환한다.
// 사람은 그대로 SPA(React)가 #root를 다시 렌더하므로 동작에는 영향 없음.

const SUPA = 'https://wwpvntmueafieessgnbu.supabase.co/functions/v1/make-server-0b7d3bae';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cHZudG11ZWFmaWVlc3NnbmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDczMjUsImV4cCI6MjA3MDI4MzMyNX0.KG4yuo02jACcVOlG7av3bMFmRcfHK6lzu0x78RMhz0c';
const SITE = 'https://www.boardraum.site';

function esc(s: any): string {
  return String(s == null ? '' : s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

async function fetchJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + ANON_KEY } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function fetchShell(host: string): Promise<string> {
  const r = await fetch('https://' + host + '/index.html');
  return await r.text();
}

function buildHead(title: string, description: string, image: string, url: string, ldJson: string): string {
  const tags = [
    '<meta property="og:title" content="' + esc(title) + '" />',
    '<meta property="og:description" content="' + esc(description) + '" />',
    image ? '<meta property="og:image" content="' + esc(image) + '" />' : '',
    '<meta property="og:url" content="' + esc(url) + '" />',
    '<meta property="og:type" content="article" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(title) + '" />',
    '<meta name="twitter:description" content="' + esc(description) + '" />',
    image ? '<meta name="twitter:image" content="' + esc(image) + '" />' : '',
    '<link rel="canonical" href="' + esc(url) + '" />',
    ldJson ? ('<script type="application/ld+json">' + ldJson + '</scr' + 'ipt>') : '',
  ];
  return tags.join('\n    ');
}

function inject(html: string, title: string, description: string, image: string, url: string, ldJson: string, contentHtml: string): string {
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(title) + '</title>');
  out = out.replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + esc(description) + '" />');
  out = out.replace(/<link\s+rel="canonical"[^>]*>/i, '');
  out = out.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  out = out.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  out = out.replace('</head>', '    ' + buildHead(title, description, image, url, ldJson) + '\n  </head>');
  out = out.replace('<div id="root"></div>', '<div id="root">' + contentHtml + '</div>');
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = (req.headers.host as string) || 'www.boardraum.site';
  const type = String(req.query.type || '');

  let html = '';
  try {
    html = await fetchShell(host);
  } catch (e) {
    res.status(502).send('shell fetch failed');
    return;
  }

  try {
    if (type === 'post') {
      const id = String(req.query.id || req.query.slug || '');
      const data = await fetchJson(SUPA + '/community/posts/' + encodeURIComponent(id));
      const post = data && data.post;
      if (post && !post.isPrivate && !post.isDraft) {
        const body = String(post.content || '').replace(/\s+/g, ' ').trim();
        const title = (post.title && String(post.title).trim()) || body.slice(0, 40) || '보드라움 게시물';
        const description = (body || title).slice(0, 160);
        const image = (Array.isArray(post.images) && post.images[0]) || (post.linkedGame && post.linkedGame.imageUrl) || '';
        const url = SITE + '/post/' + encodeURIComponent(id);
        const contentHtml =
          '<article><h1>' + esc(title) + '</h1>' +
          (post.userName ? '<p>' + esc(post.userName) + '</p>' : '') +
          '<div>' + esc(post.content || '').split('\n').join('<br>') + '</div>' +
          (image ? '<img src="' + esc(image) + '" alt="' + esc(title) + '" />' : '') +
          '</article>';
        const ld: any = { '@context': 'https://schema.org', '@type': 'SocialMediaPosting', headline: title, articleBody: body, url: url };
        if (post.createdAt) ld.datePublished = post.createdAt;
        if (post.userName) ld.author = { '@type': 'Person', name: post.userName };
        if (image) ld.image = image;
        html = inject(html, title + ' | 보드라움', description, image, url, JSON.stringify(ld).split('<').join('\\u003c'), contentHtml);
      }
    } else if (type === 'game') {
      const slug = String(req.query.slug || req.query.id || '');
      let name = slug;
      try { name = decodeURIComponent(slug); } catch (e) { /* keep */ }
      const g = await fetchJson(SUPA + '/game/info?name=' + encodeURIComponent(name));
      if (g && (g.koreanName || g.id)) {
        const gameName = g.koreanName || g.englishName || name;
        const title = gameName + ' — 보드라움';
        const en = g.englishName && g.englishName !== gameName ? ' (' + g.englishName + ')' : '';
        const yr = g.yearPublished ? ' ' + g.yearPublished + '년' : '';
        const description = (gameName + en + yr + ' 보드게임 정보·플레이 인원·후기를 보드라움에서 확인하세요.').slice(0, 160);
        const image = g.imageUrl || '';
        const url = SITE + '/game/' + encodeURIComponent(slug);
        const contentHtml =
          '<article><h1>' + esc(gameName) + '</h1>' +
          (g.englishName ? '<p>' + esc(g.englishName) + '</p>' : '') +
          '<p>' + esc(description) + '</p>' +
          (image ? '<img src="' + esc(image) + '" alt="' + esc(gameName) + '" />' : '') +
          '</article>';
        const ld: any = { '@context': 'https://schema.org', '@type': 'Game', name: gameName, url: url };
        if (g.englishName) ld.alternateName = g.englishName;
        if (image) ld.image = image;
        if (g.yearPublished) ld.datePublished = String(g.yearPublished);
        html = inject(html, title, description, image, url, JSON.stringify(ld).split('<').join('\\u003c'), contentHtml);
      }
    }
  } catch (e) {
    // 데이터 주입 실패 시 원본 SPA 셸을 그대로 반환
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
