/**
 * 温箱资源预约管理系统 - 后端服务
 * Express + SQLite (better-sqlite3) + CORS
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

// ===================== 数据库初始化 =====================
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    chamber     TEXT NOT NULL,
    user        TEXT NOT NULL,
    content     TEXT NOT NULL,
    startDate   TEXT NOT NULL,
    endDate     TEXT NOT NULL,
    tempMin     INTEGER,
    tempMax     INTEGER,
    space       INTEGER DEFAULT 1,
    createdAt   INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_chamber    ON bookings(chamber);
  CREATE INDEX IF NOT EXISTS idx_dates      ON bookings(startDate, endDate);
  CREATE INDEX IF NOT EXISTS idx_createdAt  ON bookings(createdAt);
`);

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

/**
 * 检查新预约是否与已有预约冲突
 * @param {string} chamber
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate   YYYY-MM-DD
 * @param {string|null} excludeId 编辑时排除自身
 * @param {number} newSpace
 * @param {number|null} newTempMin
 * @param {number|null} newTempMax
 * @returns {boolean} true = 有冲突
 */
function checkConflict(chamber, startDate, endDate, excludeId, newSpace, newTempMin, newTempMax) {
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

  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = formatDate(d);
    const dayBks = rows.filter(b => ds >= b.startDate && ds <= b.endDate);

    // 空间检查
    const totalSpace = dayBks.reduce((s, b) => s + (Number(b.space) || 1), 0) + (Number(newSpace) || 1);
    if (totalSpace > TOTAL_SPACE) return true;

    // 温度兼容检查
    const newStub = { tempMin: newTempMin, tempMax: newTempMax };
    for (const b of dayBks) {
      if (!isTempCompatible(b, newStub)) return true;
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
    const { chamber, user, content, startDate, endDate, tempMin, tempMax, space = 1 } = req.body;

    // 校验
    if (!chamber || !user || !content || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: '缺少必填字段 (chamber/user/content/startDate/endDate)' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ success: false, error: '结束日期不能早于开始日期' });
    }
    const spaceVal = Number(space) || 1;
    const tempMin2 = (tempMin !== undefined && tempMin !== '') ? Number(tempMin) : null;
    const tempMax2 = (tempMax !== undefined && tempMax !== '') ? Number(tempMax) : null;
    if (tempMin2 !== null && tempMax2 !== null && tempMin2 > tempMax2) {
      return res.status(400).json({ success: false, error: '最低温度不能高于最高温度' });
    }

    // 冲突检查
    const conflict = checkConflict(chamber, startDate, endDate, null, spaceVal, tempMin2, tempMax2);
    if (conflict) {
      return res.status(409).json({ success: false, error: '该时间段温箱空间已满或温度不兼容，无法预约。' });
    }

    const id = genId();
    const createdAt = Date.now();

    const insert = db.prepare(`
      INSERT INTO bookings (id, chamber, user, content, startDate, endDate, tempMin, tempMax, space, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(id, chamber, user, content, startDate, endDate, tempMin2, tempMax2, spaceVal, createdAt);

    res.json({ success: true, data: { id, chamber, user, content, startDate, endDate, tempMin: tempMin2, tempMax: tempMax2, space: spaceVal, createdAt } });
  } catch (e) {
    console.error('新增预约失败:', e);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// 编辑预约
app.put('/api/bookings/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { chamber, user, content, startDate, endDate, tempMin, tempMax, space = 1 } = req.body;

    // 校验
    const exists = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ success: false, error: '记录不存在' });

    if (!chamber || !user || !content || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: '缺少必填字段' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ success: false, error: '结束日期不能早于开始日期' });
    }
    const spaceVal = Number(space) || 1;
    const tempMin2 = (tempMin !== undefined && tempMin !== '') ? Number(tempMin) : null;
    const tempMax2 = (tempMax !== undefined && tempMax !== '') ? Number(tempMax) : null;
    if (tempMin2 !== null && tempMax2 !== null && tempMin2 > tempMax2) {
      return res.status(400).json({ success: false, error: '最低温度不能高于最高温度' });
    }

    // 冲突检查（排除自己）
    const conflict = checkConflict(chamber, startDate, endDate, id, spaceVal, tempMin2, tempMax2);
    if (conflict) {
      return res.status(409).json({ success: false, error: '该时间段温箱空间已满或温度不兼容，无法修改。' });
    }

    const update = db.prepare(`
      UPDATE bookings
      SET chamber = ?, user = ?, content = ?, startDate = ?, endDate = ?, tempMin = ?, tempMax = ?, space = ?
      WHERE id = ?
    `);
    update.run(chamber, user, content, startDate, endDate, tempMin2, tempMax2, spaceVal, id);

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
