/**
 * /api/preview?url=...
 *
 * URL의 메타데이터(제목, 썸네일, 설명, 작성자)를 추출해서 반환합니다.
 * - YouTube: oEmbed API 사용 (가장 안정적)
 * - 그 외: HTML 페이지의 og:* 메타 태그 파싱
 *
 * 인스타그램은 og 태그가 로그인 벽 뒤에 있어서 제목 정도만 추출 가능합니다.
 */

// 간단한 메타 태그 파서 (외부 의존성 없이)
function parseMeta(html) {
  const result = {
    title: '',
    description: '',
    image: '',
    siteName: '',
    author: ''
  };

  // og:* 우선, 없으면 일반 태그
  const patterns = {
    title: [
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ],
    description: [
      /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    ],
    image: [
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i
    ],
    siteName: [
      /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i
    ],
    author: [
      /<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i
    ]
  };

  for (const [key, pats] of Object.entries(patterns)) {
    for (const p of pats) {
      const m = html.match(p);
      if (m && m[1]) {
        result[key] = decodeHTMLEntities(m[1].trim());
        break;
      }
    }
  }

  return result;
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ');
}

function extractYouTubeId(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTube(url) {
  // YouTube oEmbed - API 키 불필요
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArchiveBot/1.0)' }
    });
    if (!res.ok) throw new Error('oembed failed');
    const data = await res.json();
    const vid = extractYouTubeId(url);
    return {
      title: data.title || '',
      description: '',
      image: vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : (data.thumbnail_url || ''),
      siteName: 'YouTube',
      author: data.author_name || '',
      platform: 'youtube'
    };
  } catch (e) {
    // 폴백: 썸네일만 ID 패턴으로
    const vid = extractYouTubeId(url);
    return {
      title: '',
      description: '',
      image: vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '',
      siteName: 'YouTube',
      author: '',
      platform: 'youtube'
    };
  }
}

async function fetchGeneric(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArchiveBot/1.0; +https://example.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko,en;q=0.9'
      },
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { title: '', description: '', image: '', siteName: '', author: '', platform: 'web' };
    }

    // HTML만 받고 head 부분까지만 파싱하면 충분
    const text = await res.text();
    const headPart = text.slice(0, 60000); // 60KB만

    const meta = parseMeta(headPart);

    // 이미지 URL이 상대경로면 절대경로로
    if (meta.image && !meta.image.startsWith('http')) {
      try {
        meta.image = new URL(meta.image, url).href;
      } catch {}
    }

    return { ...meta, platform: detectPlatform(url) };
  } catch (e) {
    return {
      title: '',
      description: '',
      image: '',
      siteName: '',
      author: '',
      platform: detectPlatform(url),
      error: e.message
    };
  }
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  return 'web';
}

export default async function handler(req, res) {
  // CORS - 같은 도메인이라 필요 없지만 명시
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url query parameter required' });
  }

  // URL 유효성 검증
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return res.status(400).json({ error: 'invalid protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const platform = detectPlatform(url);
    let data;
    if (platform === 'youtube') {
      data = await fetchYouTube(url);
    } else {
      data = await fetchGeneric(url);
    }
    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e.message,
      title: '',
      description: '',
      image: '',
      siteName: '',
      author: '',
      platform: detectPlatform(url)
    });
  }
}
