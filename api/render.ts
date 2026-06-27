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
    '<meta property="og:site_name" content="보드라움" />',
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
        const en = g.englishName && g.englishName !== gameName ? g.englishName : '';
        const title = gameName + ' 보드게임 정보';
        const url = SITE + '/game/' + encodeURIComponent(slug);
        const image = g.imageUrl || '';

        // 별점/평가수 (BGG)
        const rating = g.averageRating > 0 ? Math.round(g.averageRating * 10) / 10 : 0;
        const ratingCount = g.usersRated > 0 ? g.usersRated : 0;

        // 사실 기반 설명문 구성 (보드라이프식)
        const players = (g.minPlayers && g.maxPlayers)
          ? (g.minPlayers === g.maxPlayers ? g.minPlayers + '명' : g.minPlayers + '-' + g.maxPlayers + '명') : '';
        const ptime = (g.minPlayTime && g.maxPlayTime)
          ? (g.minPlayTime === g.maxPlayTime ? g.maxPlayTime + '분' : g.minPlayTime + '-' + g.maxPlayTime + '분')
          : (g.maxPlayTime ? g.maxPlayTime + '분' : '');
        const descParts: string[] = [];
        descParts.push(gameName + (en ? '(' + en + ')' : '') + '의 보드게임 정보입니다.');
        const facts: string[] = [];
        if (players) facts.push('인원 ' + players);
        if (ptime) facts.push('플레이타임 ' + ptime);
        if (g.complexity > 0) facts.push('난이도 ' + (Math.round(g.complexity * 100) / 100) + '/5');
        if (rating > 0) facts.push('BGG 평점 ' + rating.toFixed(1) + '/10' + (ratingCount ? ' (' + ratingCount + '명 평가)' : ''));
        if (facts.length) descParts.push(facts.join(', ') + '.');
        if (Array.isArray(g.designers) && g.designers.length) descParts.push('디자이너: ' + g.designers.slice(0, 3).join(', ') + '.');
        const description = descParts.join(' ').slice(0, 200);

        // 화면에 보이는 본문 (구조화 데이터와 일치하도록 평점도 노출)
        const contentHtml =
          '<article><h1>' + esc(title) + '</h1>' +
          (en ? '<p>' + esc(en) + '</p>' : '') +
          (image ? '<img src="' + esc(image) + '" alt="' + esc(gameName) + '" />' : '') +
          '<p>' + esc(description) + '</p>' +
          (rating > 0 ? '<p>BGG 평점 <strong>' + rating.toFixed(1) + '</strong>/10' + (ratingCount ? ' (' + ratingCount + '명 평가)' : '') + '</p>' : '') +
          '</article>';

        // 구조화 데이터: Product(별점) + BreadcrumbList(경로)
        const product: any = {
          '@type': 'Product',
          name: title,
          category: '보드게임',
          url: url,
        };
        if (image) product.image = image;
        if (en) product.alternateName = en;
        if (description) product.description = description;
        if (Array.isArray(g.publishers) && g.publishers.length) product.brand = { '@type': 'Brand', name: g.publishers[0] };
        if (rating > 0 && ratingCount > 0) {
          product.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: rating.toFixed(1),
            bestRating: '10',
            worstRating: '1',
            ratingCount: String(ratingCount),
          };
        }
        const breadcrumb = {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '보드라움', item: SITE },
            { '@type': 'ListItem', position: 2, name: '보드위키', item: SITE + '/wiki' },
            { '@type': 'ListItem', position: 3, name: gameName, item: url },
          ],
        };
        const ld = { '@context': 'https://schema.org', '@graph': [product, breadcrumb] };
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
