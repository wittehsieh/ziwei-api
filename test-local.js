const handler = require('./api/chart');

function mockReq(method, body) {
  return { method, body };
}

function mockRes(label) {
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(obj) {
      console.log(`\n=== ${label} (HTTP ${this._status}) ===`);
      console.log(JSON.stringify(obj, null, 2).slice(0, 3000));
      return this;
    },
    setHeader() {},
    end() { console.log(`\n=== ${label} (HTTP ${this._status}, no body) ===`); },
  };
  return res;
}

async function run() {
  // Case 1: known-good hourIndex path (卯時, matches every earlier manual verification in this project)
  await handler(mockReq('POST', {
    dateType: 'solar', date: '1985-9-2', hourIndex: 3, gender: '男',
  }), mockRes('hourIndex path (expect 命宮 太陽 旺)'));

  // Case 2: birthTime + city lookup path (spec's own worked example: 06:50 Taipei -> 06:56, +6min, hourIndex 3)
  await handler(mockReq('POST', {
    dateType: 'solar', date: '1985-9-2', birthTime: '06:50', gender: '男',
    location: { city: '台北', country: '台灣' },
  }), mockRes('birthTime + city lookup (expect trueSolarTime 06:56, +6min, same 命宮 as above)'));

  // Case 3: birthTime + direct lat/lng/timezoneId (bypass lookup)
  await handler(mockReq('POST', {
    dateType: 'solar', date: '1985-9-2', birthTime: '06:50', gender: '男',
    location: { latitude: 25.0330, longitude: 121.5654, timezoneId: 'Asia/Taipei' },
  }), mockRes('birthTime + direct coordinates'));

  // Case 4: lunar date + birthTime (tests Gregorian resolution path)
  await handler(mockReq('POST', {
    dateType: 'lunar', date: '1985-7-18', birthTime: '06:50', gender: '男',
    location: { city: 'Taipei' },
  }), mockRes('lunar date + birthTime (expect same result as case 2)'));

  // Case 5: validation errors
  await handler(mockReq('POST', { gender: '男' }), mockRes('missing date (expect 400)'));
  await handler(mockReq('POST', { date: '1985-9-2', gender: '男' }), mockRes('missing hourIndex/birthTime (expect 400)'));
  await handler(mockReq('POST', { date: '1985-9-2', gender: '男', birthTime: '06:50', location: { city: '不存在的城市xyz' } }), mockRes('unknown city (expect 400)'));

  // Case 6: GET usage info
  await handler(mockReq('GET'), mockRes('GET usage info'));
}

run().catch((err) => { console.error('TEST HARNESS ERROR:', err); process.exit(1); });
