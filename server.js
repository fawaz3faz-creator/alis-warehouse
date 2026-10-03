const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function normalizeUrl(baseUrl, raw) {
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

function looksLikeMedia(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov|m4v|avi|m3u8|mpd)(\?.*)?$/i.test(lower)
    || /(image|video)/i.test(lower)
    || lower.includes('video')
    || lower.includes('img');
}

function extractFromHtml(html, baseUrl) {
  const urls = new Set();

  const patterns = [
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-lazy=["']([^"']+)["'][^>]*>/gi,
    /<video[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<source[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["'](og:image|twitter:image|twitter:image:src)["'][^>]*>/gi,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+property=["']og:video["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /(?:src|data-src|data-lazy|content)=["']([^"']+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v|avi|m3u8|mpd)(?:\?[^"']*)?)["']/gi
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const value = match[1] || '';
      const adj = value.trim();
      const resolved = normalizeUrl(baseUrl, adj);
      if (resolved && looksLikeMedia(resolved)) urls.add(resolved);
    }
  }

  const srcsetMatches = html.matchAll(/srcset=["']([^"']+)["']/gi);
  for (const match of srcsetMatches) {
    const value = match[1] || '';
    const candidates = value.split(',');
    for (const candidate of candidates) {
      const urlPart = candidate.trim().split(/\s+/)[0];
      if (!urlPart) continue;
      const resolved = normalizeUrl(baseUrl, urlPart);
      if (resolved && looksLikeMedia(resolved)) urls.add(resolved);
    }
  }

  const ldJsonMatches = html.matchAll(/\{[^]*?\}/g);
  for (const match of ldJsonMatches) {
    const raw = match[0];
    try {
      const json = JSON.parse(raw);
      const stack = [json];
      while (stack.length) {
        const item = stack.pop();
        if (!item || typeof item !== 'object') continue;
        for (const [key, value] of Object.entries(item)) {
          if (key === 'url' || key === 'image' || key === 'video' || key === 'thumbnail' || key === 'contentUrl') {
            if (typeof value === 'string') {
              const resolved = normalizeUrl(baseUrl, value);
              if (resolved && looksLikeMedia(resolved)) urls.add(resolved);
            } else if (Array.isArray(value)) {
              for (const v of value) {
                if (typeof v === 'string') {
                  const resolved = normalizeUrl(baseUrl, v);
                  if (resolved && looksLikeMedia(resolved)) urls.add(resolved);
                } else if (v && typeof v === 'object') stack.push(v);
              }
            } else if (value && typeof value === 'object') stack.push(value);
          } else if (value && typeof value === 'object') {
            stack.push(value);
          }
        }
      }
    } catch {
      // ignore invalid JSON fragments
    }
  }

  return [...urls];
}

async function fetchUrl(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new Error('Target URL did not return HTML content.');
  }

  return response.text();
}

async function handleExtract(req, res) {
  const { url } = req.query;

  if (!url) {
    return sendJson(res, 400, { error: 'Missing url query parameter.' });
  }

  try {
    const pageHtml = await fetchUrl(url);
    const images = extractFromHtml(pageHtml, url);

    if (!images.length) {
      return sendJson(res, 200, {
        source: url,
        media: [],
        message: 'No image or video links were found in the page HTML.'
      });
    }

    return sendJson(res, 200, {
      source: url,
      media: images.map((item, index) => ({
        id: `media-${index + 1}`,
        url: item,
        name: `media-${index + 1}`,
        kind: item.toLowerCase().includes('.mp4') || item.toLowerCase().includes('.webm') || item.toLowerCase().includes('.mov') ? 'video' : 'image'
      }))
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Failed to extract media from the URL.',
      detail: error.message
    });
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml'
    };

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (urlObj.pathname === '/api/extract') {
    handleExtract({ query: Object.fromEntries(urlObj.searchParams) }, res);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, urlObj.pathname === '/' ? 'index.html' : urlObj.pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }

    serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
