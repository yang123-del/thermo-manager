/**
 * 温箱资源预约管理系统 - 后端服务
 * Express + SQLite (better-sqlite3) + CORS
 * V3.0 - 支持小时级预约（15分钟精度）
 */

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

// ===================== 常量 =====================
const DB_PATH = path.join(__dirname, 'thermo.db');
const ADMIN_PASSWORD = 'Yingjian123'; // 管理员密钥
const PORT = process.env.PORT || 3000;
const TOTAL_SPACE = 3;
const TIME_STEP_MIN = 15; // 15分钟粒度

// ===================== 数据库初始化 =====================
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id              TEXT PRIMARY KEY,
    chamber         TEXT NOT NULL,
    user            TEXT NOT NULL,
    content         TEXT NOT NULL,
    startDate       TEXT NOT NULL,
    endDate         TEXT NOT NULL,
    startTimeOfDay  TEXT DEFAULT '00:00',
    endTimeOfDay    TEXT DEFAULT '23:45',
    tempMin         INTEGER,
    tempMax         INTEGER,
    space           INTEGER DEFAULT 1,
    createdAt       INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_chamber    ON bookings(chamber);
  CREATE INDEX IF NOT EXISTS idx_dates      ON bookings(startDate, endDate);
  CREATE INDEX IF NOT EXISTS idx_createdAt  ON bookings(createdAt);
`);

// 迁移：旧数据没有 startTimeOfDay / endTimeOfDay 字段时设为全天
try {
  const colCheck = db.prepare(`PRAGMA table_info(bookings)`).all();
  const hasStartTime = colCheck.some(c => c.name === 'startTimeOfDay');
  if (!hasStartTime) {
    db.exec(`
      ALTER TABLE bookings ADD COLUMN startTimeOfDay TEXT DEFAULT '00:00';
      ALTER TABLE bookings ADD COLUMN endTimeOfDay   TEXT DEFAULT '23:45';
    `);
    console.log('[DB Migration] 已添加 startTimeOfDay / endTimeOfDay 字段');
  }
} catch (e) {
  console.warn('[DB Migration] 字段可能已存在:', e.message);
}

// ===================== 工具函数 =====================
function genId() {
  return 'bk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function formatDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isTempCompatible(a, b) {
  const aMin = (a.tempMin !== null && a.tempMin !== undefined) ? Number(a.tempMin) : -Infinity;
  const aMax = (a.tempMax !== null && a.tempMax !== undefined) ? Number(a.tempMax) : Infinity;
  const bMin = (b.tempMin !== null && b.tempMin !== undefined) ? Number(b.tempMin) : -Infinity;
  const bMax = (b.tempMax !== null && b.tempMax !== undefined) ? Number(b.tempMax) : Infinity;
  return aMin <= bMax && aMax >= bMin;
}

function canCoexist(bookingList) {
  if (!bookingList.length) return true;
  const totalSpace = bookingList.reduce((s, b) => s + (Number(b.space) || 1), 0);
  if (totalSpace > TOTAL_SPACE) return false;
  for (let i = 0; i < bookingList.length; i++)
    for (let j = i + 1; j < bookingList.length; j++)
      if (!isTempCompatible(bookingList[i], bookingList[j])) return false;
  return true;
}

/**
 * 将 HH:mm 字符串转成从 00:00 开始的分钟数
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 将分钟数转成 HH:mm 字符串
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 判断某个预约在指定时间点（日期+分钟数）是否活跃
 */
function isBookingActiveAt(booking, dateStr, minutesOfDay) {
  // 日期不在范围内
  if (dateStr < booking.startDate || dateStr > booking.endDate) return false;

  const bStartMin = timeToMinutes(booking.startTimeOfDay || '00:00');
  const bEndMin   = timeToMinutes(booking.endTimeOfDay   || '23:45');

  // 同一天的情况
  if (booking.startDate === booking.endDate) {
    return minutesOfDay >= bStartMin && minutesOfDay <= bEndMin;
  }

  // 跨多天的情况
  if (dateStr === booking.startDate) {
    // 开始日：从 startTime 到 23:45 都活跃
    return minutesOfDay >= bStartMin;
  }
  if (dateStr === booking.endDate) {
    // 结束日：从 00:00 到 endTime 都活跃
    return minutesOfDay <= bEndMin;
  }
  // 中间日期：全天活跃
  return true;
}

/**
 * 检查新预约是否与已有预约冲突（按15分钟粒度）
 * @returns {boolean} true = 有冲突
 */
function checkConflict(chamber, startDate, endDate, startTimeOfDay, endTimeOfDay, excludeId, newSpace, newTempMin, newTempMax) {
  // 1. 粗筛：日期区间有重叠的记录
  let sql = `
    SELECT * FROM bookings
    WHERE chamber = ? AND startDate <= ? AND endDate >= ?
  `;
  const params = [chamber, endDate, startDate];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const rows = db.prepare(sql).all(...params);

  const newStartMin = timeToMinutes(startTimeOfDay || '00:00');
  const newEndMin   = timeToMinutes(endTimeOfDay   || '23:45');

  // 2. 遍历新预约覆盖的每一天
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = formatDate(d);

    // 确定这一天新预约活跃的时间范围（分钟数）
    let dayStartMin, dayEndMin;
    if (ds === startDate && ds === endDate) {
      // 只有一天
      dayStartMin = newStartMin;
      dayEndMin   = newEndMin;
    } else if (ds === startDate) {
      // 开始日
      dayStartMin = newStartMin;
      dayEndMin   = 23 * 60 + 45;
    } else if (ds === endDate) {
      // 结束日
      dayStartMin = 0;
      dayEndMin   = newEndMin;
    } else {
      // 中间日
      dayStartMin = 0;
      dayEndMin   = 23 * 60 + 45;
    }

    // 3. 对这一天内每个15分钟时间点检查空间和温度
    for (let m = dayStartMin; m <= dayEndMin; m += TIME_STEP_MIN) {
      // 找出在该时间点活跃的所有已有预约
      const activeBks = rows.filter(b => isBookingActiveAt(b, ds, m));

      // 空间检查：活跃预约 + 新预约的 space 之和
      const totalSpace = activeBks.reduce((s, b) => s + (Number(b.space) || 1), 0) + (Number(newSpace) || 1);
      if (totalSpace > TOTAL_SPACE) return true;

      // 温度兼容检查
      const newStub = { tempMin: newTempMin, tempMax: newTempMax, space: newSpace };
      if (!canCoexist([...activeBks, newStub])) return true;
    }
  }

  return false;
}

// ===================== Express 应用 =====================
const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// 请求日志（开发用途）
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===================== API 路由 =====================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '温箱管理系统后端运行正常', time: new Date().toISOString() });
});

// 获取所有预约
app.get('/api/bookings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM bookings ORDER BY startDate DESC, createdAt DESC').all();
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    console.error('获取预约失败:', e);
    res.status(500).json({ success: false, error: '数据库查询失败' });
  }
});

// 获取指定温箱预约（可选过滤）
app.get('/api/bookings/:chamber', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM bookings WHERE chamber = ? ORDER BY startDate DESC`).all(req.params.chamber);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

// 新增预约
app.post('/api/bookings', (req, res) => {
  try {
    const { chamber, user, content, startDate, endDate, startTimeOfDay, endTimeOfDay, tempMin, tempMax, space = 1 } = req.body;

    // 校验
    if (!chamber || !user || !content || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: '缺少必填字段 (chamber/user/content/startDate/endDate)' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ success: false, error: '结束日期不能早于开始日期' });
    }

    // 时间默认值
    const sTime = startTimeOfDay || '00:00';
    const eTime = endTimeOfDay   || '23:45';

    // 校验时间格式 HH:mm
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(sTime) || !timeRegex.test(eTime)) {
      return res.status(400).json({ success: false, error: '时间格式必须为 HH:mm（24小时制）' });
    }

    const spaceVal = Number(space) || 1;
    const tempMin2 = (tempMin !== undefined && tempMin !== '') ? Number(tempMin) : null;
    const tempMax2 = (tempMax !== undefined && tempMax !== '') ? Number(tempMax) : null;
    if (tempMin2 !== null && tempMax2 !== null && tempMin2 > tempMax2) {
      return res.status(400).json({ success: false, error: '最低温度不能高于最高温度' });
    }

    // 冲突检查（含时间粒度）
    const conflict = checkConflict(chamber, startDate, endDate, sTime, eTime, null, spaceVal, tempMin2, tempMax2);
    if (conflict) {
      return res.status(409).json({ success: false, error: '该时间段温箱空间已满或温度不兼容，无法预约。' });
    }

    const id = genId();
    const createdAt = Date.now();

    const insert = db.prepare(`
      INSERT INTO bookings (id, chamber, user, content, startDate, endDate, startTimeOfDay, endTimeOfDay, tempMin, tempMax, space, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(id, chamber, user, content, startDate, endDate, sTime, eTime, tempMin2, tempMax2, spaceVal, createdAt);

    res.json({ success: true, data: { id, chamber, user, content, startDate, endDate, startTimeOfDay: sTime, endTimeOfDay: eTime, tempMin: tempMin2, tempMax: tempMax2, space: spaceVal, createdAt } });
  } catch (e) {
    console.error('新增预约失败:', e);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// 编辑预约
app.put('/api/bookings/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { chamber, user, content, startDate, endDate, startTimeOfDay, endTimeOfDay, tempMin, tempMax, space = 1 } = req.body;

    // 校验
    const exists = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ success: false, error: '记录不存在' });

    if (!chamber || !user || !content || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: '缺少必填字段' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ success: false, error: '结束日期不能早于开始日期' });
    }

    // 时间默认值
    const sTime = startTimeOfDay || '00:00';
    const eTime = endTimeOfDay   || '23:45';

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(sTime) || !timeRegex.test(eTime)) {
      return res.status(400).json({ success: false, error: '时间格式必须为 HH:mm（24小时制）' });
    }

    const spaceVal = Number(space) || 1;
    const tempMin2 = (tempMin !== undefined && tempMin !== '') ? Number(tempMin) : null;
    const tempMax2 = (tempMax !== undefined && tempMax !== '') ? Number(tempMax) : null;
    if (tempMin2 !== null && tempMax2 !== null && tempMin2 > tempMax2) {
      return res.status(400).json({ success: false, error: '最低温度不能高于最高温度' });
    }

    // 冲突检查（排除自己）
    const conflict = checkConflict(chamber, startDate, endDate, sTime, eTime, id, spaceVal, tempMin2, tempMax2);
    if (conflict) {
      return res.status(409).json({ success: false, error: '该时间段温箱空间已满或温度不兼容，无法修改。' });
    }

    const update = db.prepare(`
      UPDATE bookings
      SET chamber = ?, user = ?, content = ?, startDate = ?, endDate = ?,
          startTimeOfDay = ?, endTimeOfDay = ?, tempMin = ?, tempMax = ?, space = ?
      WHERE id = ?
    `);
    update.run(chamber, user, content, startDate, endDate, sTime, eTime, tempMin2, tempMax2, spaceVal, id);

    res.json({ success: true });
  } catch (e) {
    console.error('编辑预约失败:', e);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// 删除预约（需要管理员密码）
app.delete('/api/bookings/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(403).json({ success: false, error: '管理员密码错误，无权限删除' });
    }

    const exists = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ success: false, error: '记录不存在' });

    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) {
    console.error('删除预约失败:', e);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// 获取单个预约详情
app.get('/api/bookings/detail/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

// ===================== 启动 =====================
app.listen(PORT, () => {
  console.log('\n=====================================');
  console.log('  🌡 温箱资源预约管理系统 - 后端服务');
  console.log(`  🚀 运行地址: http://localhost:${PORT}`);
  console.log(`  💾 数据库: ${DB_PATH}`);
  console.log('=====================================\n');
});
