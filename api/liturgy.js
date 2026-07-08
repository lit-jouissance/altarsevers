// GET /api/liturgy?date=YYYYMMDD
// 한국천주교주교회의 매일미사(https://missa.cbck.or.kr)에서 해당 날짜의
// 전례력 명칭, 전례색, 오늘의 복음 말씀 제목(예: "이스라엘 집안의 길 잃은 양들에게 가라.")을 가져옵니다.
// 복음 본문 전체는 가져오지 않고, 복음 앞에 붙는 한 줄짜리 소제목만 추출합니다.

function stripTagsAndDecodeEntities(html) {
  // 1) 실제 HTML 태그만 제거 (본문에 들어있는 &lt;...&gt; 로 이스케이프된 텍스트는 보존됨)
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                  .replace(/<[^>]+>/g, '\n');
  // 2) 그 다음에 HTML 엔티티 디코드 (여기서 &lt;/&gt;가 실제 <, > 문자로 복원됨)
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
             .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return text;
}

function extractGospelTitle(html) {
  const text = stripTagsAndDecodeEntities(html);
  const landmark = text.indexOf('거룩한 복음입니다');
  if (landmark === -1) return null;
  const before = text.slice(0, landmark);
  const matches = [...before.matchAll(/<([^<>]{2,120})>/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1].trim();
}

export default async function handler(req, res) {
  const { date } = req.query;
  if (!date || !/^\d{8}$/.test(date)) {
    res.status(400).json({ error: 'date query param required, format YYYYMMDD' });
    return;
  }

  try {
    const upstream = await fetch(`https://missa.cbck.or.kr/DailyMissa/${date}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; boksadan-app/1.0)' }
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `upstream status ${upstream.status}` });
      return;
    }
    const html = await upstream.text();

    let titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (!titleMatch) titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const raw = titleMatch ? titleMatch[1].trim() : '';

    // 예: "2025.10.19 [녹] 연중 제29주일[녹] 민족들의 복음화를 위한 미사"
    const m = raw.match(/^\d{4}\.\d{2}\.\d{2}\s*\[([^\]]+)\]\s*([^\[]+)/);
    const color = m ? m[1].trim() : null;
    const name = m ? m[2].trim() : null;
    const gospelTitle = extractGospelTitle(html);

    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate');
    res.status(200).json({ date, color, name, gospelTitle, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
