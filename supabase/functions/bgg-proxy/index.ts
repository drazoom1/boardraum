// BGG API Proxy Edge Function
// Proxies requests to BoardGameGeek XML API2 and converts to JSON

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // GET /hot → BGG 실시간 순위
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('hot') === '1') {
      const hotUrl = 'https://api.geekdo.com/xmlapi2/hot?type=boardgame';
      const response = await fetch(hotUrl);
      if (!response.ok) throw new Error(`BGG hot error: ${response.status}`);
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const items = xmlDoc.querySelectorAll('item');
      const results = [];
      for (const item of items) {
        const id = item.getAttribute('id');
        const rank = item.getAttribute('rank');
        const nameEl = item.querySelector('name');
        const name = nameEl?.getAttribute('value');
        // thumbnail은 textContent로 가져옴 (속성이 아닌 텍스트 노드)
        const thumbEl = item.querySelector('thumbnail');
        const thumbnail = thumbEl?.textContent?.trim() || thumbEl?.getAttribute('value') || '';
        const yearEl = item.querySelector('yearpublished');
        const year = yearEl?.getAttribute('value') || '';
        if (id && name) {
          results.push({ id, rank: parseInt(rank || '0'), name, thumbnail, year });
        }
      }
      // 최대 20개 반환
      return new Response(JSON.stringify({ hot: results.slice(0, 20) }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { query, id, collection } = await req.json();

    // collection 불러오기
    if (collection) {
      const colUrl = `https://api.geekdo.com/xmlapi2/collection?username=${encodeURIComponent(collection)}&own=1&excludesubtype=boardgameexpansion`;
      let xmlText = '';
      for (let i = 0; i < 5; i++) {
        const res = await fetch(colUrl);
        if (res.status === 202) { await new Promise(r => setTimeout(r, 2000)); continue; }
        if (res.status === 401) return new Response(JSON.stringify({ error: 'BGG API 인증 오류' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        if (!res.ok) return new Response(JSON.stringify({ error: `BGG 오류: ${res.status}` }), { status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        xmlText = await res.text();
        break;
      }
      if (!xmlText) return new Response(JSON.stringify({ error: 'BGG 응답 없음' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      if (xmlText.includes('<errors>')) {
        const msgMatch = xmlText.match(/<message>(.*?)<\/message>/);
        return new Response(JSON.stringify({ error: msgMatch ? msgMatch[1] : 'BGG 오류' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const games: any[] = [];
      const itemMatches = xmlText.matchAll(/<item[^>]*objecttype="thing"[^>]*objectid="(\d+)"[^>]*subtype="boardgame"[\s\S]*?<\/item>/g);
      for (const match of itemMatches) {
        const block = match[0];
        const bggId = match[1];
        const nameMatch = block.match(/<name[^>]*sortindex="1"[^>]*>([\s\S]*?)<\/name>/);
        const yearMatch = block.match(/<yearpublished>([\s\S]*?)<\/yearpublished>/);
        const thumbMatch = block.match(/<thumbnail>([\s\S]*?)<\/thumbnail>/);
        if (nameMatch) {
          const raw = thumbMatch ? thumbMatch[1].trim() : '';
          const thumbnail = raw.startsWith('//') ? 'https:' + raw : raw;
          games.push({ bggId, name: nameMatch[1].trim(), yearPublished: yearMatch ? yearMatch[1].trim() : '', thumbnail });
        }
      }
      return new Response(JSON.stringify({ games, totalCount: games.length }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    let apiUrl = '';
    let isSearch = false;
    
    if (query) {
      apiUrl = `https://api.geekdo.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`;
      isSearch = true;
    } else if (id) {
      apiUrl = `https://api.geekdo.com/xmlapi2/thing?id=${id}&stats=1`;
      isSearch = false;
    } else {
      return new Response(JSON.stringify({ error: 'Query or ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const response = await fetch(apiUrl);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `BGG API error: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    let jsonData;

    if (isSearch) {
      const items = xmlDoc.querySelectorAll('item');
      const results = [];
      for (const item of items) {
        const id = item.getAttribute('id');
        const nameElement = item.querySelector('name');
        const name = nameElement?.getAttribute('value');
        const yearElement = item.querySelector('yearpublished');
        const year = yearElement?.getAttribute('value');
        if (id && name) results.push({ id, name, yearpublished: year || '' });
      }
      jsonData = { items: results };
    } else {
      const item = xmlDoc.querySelector('item');
      if (!item) {
        return new Response(JSON.stringify({ error: 'Game not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const nameElements = item.querySelectorAll('name');
      const names = [];
      for (const nameEl of nameElements) {
        const type = nameEl.getAttribute('type');
        const value = nameEl.getAttribute('value');
        if (value) names.push({ type, value });
      }
      const image = item.querySelector('image')?.textContent || '';
      const thumbnail = item.querySelector('thumbnail')?.textContent || '';
      const minplayers = item.querySelector('minplayers')?.getAttribute('value') || '1';
      const maxplayers = item.querySelector('maxplayers')?.getAttribute('value') || '4';
      const minplaytime = item.querySelector('minplaytime')?.getAttribute('value') || '0';
      const maxplaytime = item.querySelector('maxplaytime')?.getAttribute('value') || '0';
      const averageweight = item.querySelector('averageweight')?.getAttribute('value') || '0';
      const averagerating = item.querySelector('average')?.getAttribute('value') || '0';
      const usersrated = item.querySelector('usersrated')?.getAttribute('value') || '0';
      jsonData = {
        item: {
          names,
          image,
          thumbnail,
          minplayers: parseInt(minplayers),
          maxplayers: parseInt(maxplayers),
          minplaytime: parseInt(minplaytime),
          maxplaytime: parseInt(maxplaytime),
          averageweight: parseFloat(averageweight),
          averagerating: parseFloat(averagerating),
          usersrated: parseInt(usersrated),
        }
      };
    }

    return new Response(JSON.stringify(jsonData), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});