import type { VercelRequest, VercelResponse } from '@vercel/node';

// 진단용 최소 버전 — 함수가 빌드/배포되는지 확인
export default function handler(req: VercelRequest, res: VercelResponse) {
  const type = String(req.query.type || '');
  const slug = String(req.query.slug || req.query.id || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><head><title>SSR OK ${type} ${slug}</title></head><body>render function works</body></html>`);
}
