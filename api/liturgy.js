// GET /api/liturgy?date=YYYYMMDD
// 한국천주교주교회의 매일미사(https://missa.cbck.or.kr)에서 해당 날짜의
// 전례력 명칭과 전례색을 가져옵니다. (본문 기도/독서 텍스트는 가져오지 않고
// 페이지 제목에 표기된 날짜/전례색/전례명만 추출합니다.)
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

    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate');
    res.status(200).json({ date, color, name, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
