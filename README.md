# ziwei-api

紫微斗數排盤 REST API，設計給 AI / agent 呼叫用（例如 ChatGPT Custom GPT 的 Action）。回傳本命盤 + 大限/流年/流月/流日（永遠全部回傳），以及方便 AI 直接閱讀的純文字版本。

排盤演算法本身是 [iztro](https://github.com/SylarLong/iztro)，未做任何修改。

## Endpoint

`POST /api/chart`

### 時辰有兩種提供方式，二選一

**方式一：直接提供時辰索引**（呼叫方已經知道時辰，不需要精確鐘點）

```json
{
  "dateType": "solar",
  "date": "1985-9-2",
  "gender": "男",
  "hourIndex": 3
}
```

**方式二：提供民用鐘錶時間 + 出生地**（系統自動換算真太陽時來決定時辰）

```json
{
  "dateType": "solar",
  "date": "1985-9-2",
  "gender": "男",
  "birthTime": "06:50",
  "location": { "city": "台北", "country": "台灣" }
}
```

`location` 也可以直接給座標，跳過城市查詢：

```json
{ "location": { "latitude": 25.0330, "longitude": 121.5654, "timezoneId": "Asia/Taipei" } }
```

### 完整參數

| 參數 | 說明 |
|---|---|
| `dateType` | `"solar"` \| `"lunar"`，預設 `"solar"` |
| `date` | 出生日期 `"YYYY-M-D"`，例如 `"1985-9-2"`（必填） |
| `isLeapMonth` | 農曆閏月，只在 `dateType="lunar"` 時有意義，預設 `false` |
| `gender` | `"男"` \| `"女"`（必填） |
| `hourIndex` | 時辰索引 0-12（子=0, 丑=1, ..., 晚子=12），與 `birthTime` 二選一，優先使用 |
| `birthTime` | 民用鐘錶時間 `"HH:MM"`，提供時必須同時提供 `location` |
| `location.city` / `location.country` | 城市/國家名稱，中文或英文皆可（例如 `"台北"` 或 `"Taipei"`） |
| `location.latitude/longitude/timezoneId` | 直接提供座標與 IANA 時區，跳過城市查詢 |
| `targetDate` | 要查詢大限/流年/流月/流日的目標日期 `"YYYY-M-D"`，例如 `"2027-6-15"`。省略則預設是系統現在的時間（查「目前」的運限）。本命盤本身不受這個參數影響，永遠是同一張本命盤，只有運限的計算基準日改變 |
| `lang` | 星曜語言，預設 `"zh-TW"` |

想問某個未來（或過去）某一年的運勢，用 `targetDate` 指定那一年裡的任何一天即可，例如想看 2027 年的流年：

```json
{ "date": "1985-9-2", "gender": "男", "hourIndex": 3, "targetDate": "2027-6-15" }
```

### 回傳

```json
{
  "astrolabe": { "...": "12 宮位、主星/副星/雜曜、命主身主、五行局..." },
  "horoscope": { "decadal": {}, "yearly": {}, "monthly": {}, "daily": {} },
  "horoscopeAsOf": { "solarDate": "2027-6-15", "lunarDate": "二〇二七年五月十一" },
  "hourUsed": { "index": 3, "branch": "卯", "range": "05:00–07:00" },
  "solarTime": { "civilTime": "06:50", "trueSolarTime": "06:56", "correctionMinutes": 6, "location": {} },
  "plainText": "命盤與四種運限的純文字版本，方便 AI 直接閱讀"
}
```

`solarTime` 只有在走 `birthTime` + `location` 路徑時才會有值，走 `hourIndex` 路徑時是 `null`。`horoscopeAsOf` 顯示運限實際計算基準的日期（等於 `targetDate`，或省略時等於系統現在時間）。

## 本機測試

```bash
npm install
npm test
```

`test-local.js` 直接呼叫 handler（不需要跑 server），涵蓋：時辰索引路徑、城市查詢路徑、直接座標路徑、農曆日期路徑、時辰邊界案例、以及各種缺參數的錯誤處理。

想用真的 HTTP request 測試（例如用 curl 或 Postman）：

```bash
npm run dev
curl -X POST http://localhost:3001/api/chart \
  -H "Content-Type: application/json" \
  -d '{"dateType":"solar","date":"1985-9-2","birthTime":"06:50","gender":"男","location":{"city":"台北"}}'
```

## 部署到 Vercel

1. 把這個 repo push 到 GitHub
2. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入，New Project → 選這個 repo → Deploy
3. Vercel 會自動偵測 `api/chart.js` 並部署成 `https://你的專案.vercel.app/api/chart`

## 授權

排盤引擎：iztro（MIT）。城市資料衍生自 `city-timezones`（MIT）。真太陽時計算使用 [Astronomy Engine](https://github.com/cosinekitty/astronomy)（MIT）。
