import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();

    // Regex-based metadata extraction (since cheerio might not be available)
    const extract = (regex: RegExp) => {
      const match = html.match(regex);
      return match ? match[1] : null;
    };

    const title = extract(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) || 
                  extract(/<title>(.*?)<\/title>/i);
    const description = extract(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
                        extract(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const image = extract(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);

    // Naver Map specific: Try to find place name if og:title is generic
    let finalTitle = title;
    if (targetUrl.includes('naver.me') || targetUrl.includes('map.naver.com')) {
      // Often Naver Map has the place name in og:title
    }

    return NextResponse.json({
      title: finalTitle ? decodeHtmlEntities(finalTitle) : '',
      description: description ? decodeHtmlEntities(description) : '',
      image: image || '',
      url: targetUrl
    });

  } catch (error: any) {
    console.error('Metadata extraction error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function decodeHtmlEntities(str: string) {
  return str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'");
}
