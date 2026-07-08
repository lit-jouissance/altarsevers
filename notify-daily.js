// Vercel Cron이 매일 호출하는 엔드포인트 (vercel.json 참고)
// 오전 7시(KST) 무렵 실행되어, "오늘" 날짜에 복사로 배정된 단원에게만
// 웹 푸시 알림을 보냅니다.
import admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}
const db = admin.firestore();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:example@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // 선택: CRON_SECRET 환경변수를 설정했다면 Vercel Cron이 보내는 Authorization 헤더를 검증
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
  }

  try {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC -> KST 보정
    const year = kst.getUTCFullYear();
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();

    const scheduleSnap = await db.collection('schedule').get();
    const todays = [];
    scheduleSnap.forEach((doc) => {
      const d = doc.data();
      if (Number(d.year) === year && Number(d.month) === month && Number(d.day) === day) {
        todays.push(d);
      }
    });

    if (todays.length === 0) {
      res.status(200).json({ ok: true, message: '오늘 일정 없음', date: `${year}-${month}-${day}` });
      return;
    }

    const names = new Set();
    todays.forEach((d) => (d.participants || []).forEach((n) => names.add(n)));

    const results = [];
    for (const name of names) {
      const subDoc = await db.collection('pushSubscriptions').doc(name).get();
      if (!subDoc.exists) { results.push({ name, sent: false, reason: 'no-subscription' }); continue; }
      const sub = subDoc.data();
      const entry = todays.find((d) => (d.participants || []).includes(name));
      const payload = JSON.stringify({
        title: '오늘 복사 배정 안내',
        body: `${entry?.name || '오늘 미사'} 복사로 배정되어 있습니다.`
      });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        results.push({ name, sent: true });
      } catch (e) {
        results.push({ name, sent: false, reason: e.message });
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.collection('pushSubscriptions').doc(name).delete();
        }
      }
    }

    res.status(200).json({ ok: true, date: `${year}-${month}-${day}`, notified: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
