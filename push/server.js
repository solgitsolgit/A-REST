/**
 * [수면버스] 로컬 데이터 수집 및 관리 서버
 * 별도의 npm install 없이 `node server.js` 명령어로 즉시 구동됩니다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// 데이터 디렉토리 및 파일 초기화
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LOGS_FILE)) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2), 'utf8');
}

function getLogs() {
  try {
    const raw = fs.readFileSync(LOGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveLogs(logs) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

function calculateStats(logs) {
  // 관리자 본인 테스트 데이터(isAdmin: true)는 통계 집계에서 완벽히 배제
  const publicLogs = logs.filter(item => item.isAdmin !== true && item.isAdmin !== 'true');

  const visitors = new Set();
  let reserveClicks = 0;
  let purchaseClicks = 0;
  const reserveUsers = new Set();
  const purchaseUsers = new Set();

  // 세션별 성별/지역/시간대 매핑
  const sessionDemographics = {};
  publicLogs.forEach(item => {
    if (item.sessionId) {
      visitors.add(item.sessionId);
      if (!sessionDemographics[item.sessionId]) {
        sessionDemographics[item.sessionId] = { gender: '미지정', region: '미지정', timeSlot: '미지정' };
      }
      if (item.gender && item.gender !== '미지정') {
        sessionDemographics[item.sessionId].gender = item.gender;
      }
      if (item.region && item.region !== '미지정') {
        sessionDemographics[item.sessionId].region = item.region;
      }
      if (item.timeSlot && item.timeSlot !== '미지정') {
        sessionDemographics[item.sessionId].timeSlot = item.timeSlot;
      }
    }
    if (item.eventType === 'click_reserve') {
      reserveClicks++;
      if (item.sessionId) reserveUsers.add(item.sessionId);
    } else if (item.eventType === 'click_purchase') {
      purchaseClicks++;
      if (item.sessionId) purchaseUsers.add(item.sessionId);
    }
  });

  const convertedUsers = new Set([...reserveUsers, ...purchaseUsers]);

  const calcRate = (c, total) => total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';

  // 성별 통계 집계 (남성, 여성)
  const genders = ['남성', '여성'];
  const genderStats = {};
  genders.forEach(g => {
    genderStats[g] = {
      uv: 0,
      converted: 0,
      rate: '0.0',
      track1: { converted: 0, rate: '0.0' },
      track2: { converted: 0, rate: '0.0' }
    };
  });

  // 지역 통계 집계 (서울, 5도)
  const regions = ['서울', '경기도', '강원도', '충청도', '전라도', '경상도'];
  const regionStats = {};
  regions.forEach(r => {
    regionStats[r] = {
      uv: 0,
      converted: 0,
      rate: '0.0',
      track1: { converted: 0, rate: '0.0' },
      track2: { converted: 0, rate: '0.0' }
    };
  });

  // 이용 희망 시간대 통계 집계 (아침, 점심, 저녁)
  const timeSlots = ['아침', '점심', '저녁'];
  const timeSlotStats = {};
  timeSlots.forEach(t => {
    timeSlotStats[t] = {
      uv: 0,
      converted: 0,
      rate: '0.0',
      track1: { converted: 0, rate: '0.0' },
      track2: { converted: 0, rate: '0.0' }
    };
  });

  // 각 세션별 성별/지역/시간대 집계
  visitors.forEach(sid => {
    const demo = sessionDemographics[sid] || { gender: '남성', region: '서울', timeSlot: '점심' };
    const g = demo.gender;
    const r = demo.region;
    const t = demo.timeSlot;

    if (genderStats[g]) genderStats[g].uv++;
    if (regionStats[r]) regionStats[r].uv++;
    if (timeSlotStats[t]) timeSlotStats[t].uv++;

    const hasConverted = convertedUsers.has(sid);
    const hasTrack1 = reserveUsers.has(sid);
    const hasTrack2 = purchaseUsers.has(sid);

    if (hasConverted) {
      if (genderStats[g]) genderStats[g].converted++;
      if (regionStats[r]) regionStats[r].converted++;
      if (timeSlotStats[t]) timeSlotStats[t].converted++;
    }
    if (hasTrack1) {
      if (genderStats[g]) genderStats[g].track1.converted++;
      if (regionStats[r]) regionStats[r].track1.converted++;
      if (timeSlotStats[t]) timeSlotStats[t].track1.converted++;
    }
    if (hasTrack2) {
      if (genderStats[g]) genderStats[g].track2.converted++;
      if (regionStats[r]) regionStats[r].track2.converted++;
      if (timeSlotStats[t]) timeSlotStats[t].track2.converted++;
    }
  });

  // 전환율 계산
  genders.forEach(g => {
    const s = genderStats[g];
    s.rate = calcRate(s.converted, s.uv);
    s.track1.rate = calcRate(s.track1.converted, s.uv);
    s.track2.rate = calcRate(s.track2.converted, s.uv);
  });
  regions.forEach(r => {
    const s = regionStats[r];
    s.rate = calcRate(s.converted, s.uv);
    s.track1.rate = calcRate(s.track1.converted, s.uv);
    s.track2.rate = calcRate(s.track2.converted, s.uv);
  });
  timeSlots.forEach(t => {
    const s = timeSlotStats[t];
    s.rate = calcRate(s.converted, s.uv);
    s.track1.rate = calcRate(s.track1.converted, s.uv);
    s.track2.rate = calcRate(s.track2.converted, s.uv);
  });

  const totalUV = visitors.size;
  const reserveRate = calcRate(reserveUsers.size, totalUV);
  const purchaseRate = calcRate(purchaseUsers.size, totalUV);
  const totalConvertedUsers = convertedUsers.size;
  const totalConversionRate = calcRate(totalConvertedUsers, totalUV);

  return {
    totalUV,
    reserveClicks,
    reserveRate,
    purchaseClicks,
    purchaseRate,
    totalConvertedUsers,
    totalConversionRate,
    isHypothesisPassed: parseFloat(totalConversionRate) >= 10.0,
    track1Stats: {
      name: 'Track 1: 무료 사전알림',
      price: '0원',
      targetRate: 20.0,
      clicks: reserveClicks,
      convertedUsers: reserveUsers.size,
      conversionRate: reserveRate,
      isPassed: parseFloat(reserveRate) >= 20.0
    },
    track2Stats: {
      name: 'Track 2: 얼리버드 테스터',
      price: '5,900원',
      targetRate: 5.0,
      clicks: purchaseClicks,
      convertedUsers: purchaseUsers.size,
      conversionRate: purchaseRate,
      isPassed: parseFloat(purchaseRate) >= 5.0
    },
    genderStats,
    regionStats,
    timeSlotStats,
    recentLogs: logs.slice(-50).reverse()
  };
}

const server = http.createServer((req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. API: 이벤트 로그 기록
  if (req.method === 'POST' && pathname === '/api/log') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        entry.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        entry.timestamp = entry.timestamp || new Date().toISOString();
        
        const logs = getLogs();
        logs.push(entry);
        saveLogs(logs);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: logs.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 2. API: 통계 데이터 조회 (관리자용)
  if (req.method === 'GET' && pathname === '/api/stats') {
    const logs = getLogs();
    const stats = calculateStats(logs);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(stats));
    return;
  }

  // 3. API: 테스트 데이터 초기화 (관리자용)
  if (req.method === 'POST' && pathname === '/api/reset') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        let pin = '8888';
        if (body.trim()) {
          const parsed = JSON.parse(body);
          pin = parsed.pin || pin;
        }
        if (pin === '8888' || pin === 'admin_reset') {
          saveLogs([]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: '데이터가 0으로 초기화되었습니다.' }));
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }));
        }
      } catch (e) {
        saveLogs([]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
    });
    return;
  }

  // 4. API: CSV 다운로드 (데이터 분석용)
  if (req.method === 'GET' && pathname === '/api/export-csv') {
    const logs = getLogs();
    let csv = '\uFEFFTimestamp,Event,SessionID,Gender,Region,TimeSlot,Details,Device\n';
    logs.forEach(l => {
      const details = l.details ? JSON.stringify(l.details).replace(/"/g, '""') : '';
      csv += `"${l.timestamp}","${l.eventType}","${l.sessionId || ''}","${l.gender || ''}","${l.region || ''}","${l.timeSlot || ''}","${details}","${l.device || ''}"\n`;
    });
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sleepbus_demographics_data.csv"'
    });
    res.end(csv);
    return;
  }

  // 5. 정적 파일 서빙 (랜딩페이지 및 관리자창)
  let safePath = pathname;
  try {
    safePath = decodeURIComponent(pathname);
  } catch (e) {}
  let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);
  
  // 보안: 디렉토리 탐색 방지
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('페이지를 찾을 수 없습니다.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚌 [수면버스] 서버가 성공적으로 실행되었습니다!`);
  console.log(`🌐 방문자용 랜딩페이지: http://localhost:${PORT}`);
  console.log(`🔐 비밀 관리자 대시보드: http://localhost:${PORT}/admin.html`);
  console.log(`🔑 기본 관리자 비밀번호: 8888`);
  console.log(`====================================================`);
});
