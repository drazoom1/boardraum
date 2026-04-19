import type { VercelRequest, VercelResponse } from '@vercel/node';

const SITEMAP_URL = 'https://wwpvntmueafieessgnbu.supabase.co/functions/v1/make-server-0b7d3bae/sitemap.xml';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cHZudG11ZWFmaWVlc3NnbmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDczMjUsImV4cCI6MjA3MDI4MzMyNX0.KG4yuo02jACcVOlG7av3bMFmRcfHK6lzu0x78RMhz0c';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const response = await fetch(SITEMAP_URL, {
      headers: { Authorization: `Bearer ${ANON_KEY}` },
    });
    const xml = await response.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.status(200).send(xml);
  } catch {
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}
