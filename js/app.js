/**
 * 温箱资源预约管理系统 - 热力色谱主题 V4 + 后端同步版
 */

// ===================== 常量与配置 =====================
const CHAMBERS = {
  'chamber-small': { name: '西厂房小温箱', icon: '🧊' },
  'chamber-large': { name: '大温箱', icon: '🏭' },
  'chamber-east':  { name: '东厂房小温箱', icon: '🏢' }
};

const API_BASE = ''; // 同域部署，无需前缀
const TOTAL_SPACE = 3;
const TODAY = normalizeDate(new Date());

const TEMP_RISK_LOW  = -30;
const TEMP_RISK_HIGH = 70;

// ===================== 角色权限 =====================
const ROLE_KEY = 'thermo_role';
const ROLES = { ADMIN: 'admin', USER: 'user' };

function getRole() { return localStorage.getItem(ROLE_KEY) || ROLES.USER; }
function setRole(role) { localStorage.setItem(ROLE_KEY, role); }
function isAdmin() { return getRole() === ROLES.ADMIN; }

function showToast(msg, type) {
  type = type || 'danger';
  let toast = document.getElementById('permission-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'permission-toast';
    toast.className = 'permission-denied-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'permission-denied-toast ' + type;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 2500);
}
function showPermissionDenied(msg) {
  showToast(msg || '⚠️ 您没有权限执行此操作，请联系管理员', 'danger');
}

const ADMIN_PASSWORD = 'Yingjian123'; // 管理员密钥（可在代码中修改）

function updateRoleUI() {
  const role = getRole();
  const badge = document.getElementById('role-badge');
  const exportBtn = document.getElementById('btn-export');
  if (role === ROLES.ADMIN) {
    badge.textContent = '🔐 管理员';
    badge.classList.add('admin');
    exportBtn.disabled = false;
    exportBtn.title = '导出汇总';
  } else {
    badge.textContent = '👤 普通用户';
    badge.classList.remove('admin');
    exportBtn.disabled = true;
    exportBtn.title = '仅管理员可导出';
  }
}

function openAuthModal() {
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-hint').textContent = '';
  document.getElementById('auth-hint').className = 'form-hint';
  document.getElementById('auth-overlay').classList.add('active');
  setTimeout(() => document.getElementById('auth-password').focus(), 100);
}

function closeAuthModal() {
  document.getElementById('auth-overlay').classList.remove('active');
}

function handleAuthConfirm() {
  const input = document.getElementById('auth-password').value.trim();
  const hint = document.getElementById('auth-hint');
  if (input === ADMIN_PASSWORD) {
    setRole(ROLES.ADMIN);
    closeAuthModal();
    updateRoleUI();
    if (document.getElementById('day-detail-overlay').classList.contains('active') && selectedDateStr) {
      openDayDetail(new Date(selectedDateStr));
    }
    renderAll();
    showToast('✅ 管理员身份已启用', 'success');
  } else {
    hint.className = 'form-hint danger';
    hint.textContent = '密钥错误，请重试';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-password').focus();
  }
}

// ===================== 日期工具 =====================
function normalizeDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  const date = normalizeDate(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekDay(d) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[normalizeDate(d).getDay()];
}

function isWeekend(d) {
  const day = normalizeDate(d).getDay();
  return day === 0 || day === 6;
}

function isSameDay(a, b) {
  return formatDate(a) === formatDate(b);
}

function addDays(d, n) {
  const date = normalizeDate(d);
  date.setDate(date.getDate() + n);
  return date;
}

function addMonths(d, n) {
  const date = new Date(d);
  date.setMonth(date.getMonth() + n);
  return date;
}

function getMonthStart(d) {
  const date = normalizeDate(d);
  date.setDate(1);
  return date;
}

function getDaysInMonth(d) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return date.getDate();
}

function diffDays(a, b) {
  const ms = normalizeDate(b) - normalizeDate(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function getMonthLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

// ===================== 数据层（API） =====================
let bookings = [];

async function loadBookings() {
  try {
    const res = await fetch(API_BASE + '/api/bookings');
    if (!res.ok) throw new Error('加载失败');
    const json = await res.json();
    bookings = json.success ? json.data : [];
    return bookings;
  } catch (e) {
    console.error('加载预约数据失败:', e);
    bookings = [];
    return bookings;
  }
}

async function saveNewBooking(payload) {
  const res = await fetch(API_BASE + '/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '提交失败');
  await loadBookings();
  return json.data;
}

async function updateBooking(id, payload) {
  const res = await fetch(API_BASE + '/api/bookings/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '更新失败');
  await loadBookings();
}

async function removeBooking(id, password) {
  const res = await fetch(API_BASE + '/api/bookings/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '删除失败');
  await loadBookings();
}

async function syncIfEmpty() {
  // 首次运行时如果后端为空，自动塞入演示数据方便体验
  try {
    const res = await fetch(API_BASE + '/api/bookings');
    const json = await res.json();
    if (json.success && json.count === 0) {
      await migrateSeedData();
    } else {
      await loadBookings();
    }
  } catch (e) {
    console.warn('后端连接失败，请检查服务器:', e);
    bookings = [];
  }
}

async function migrateSeedData() {
  const seedData = [
    {
      chamber: 'chamber-small',
      user: '刘鑫明',
      content: '嵌入式涂胶SSD选型',
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      tempMin: 0,
      tempMax: 70,
      space: 2
    },
    {
      chamber: 'chamber-small',
      user: '刘凯',
      content: '轮对经济镜',
      startDate: '2026-06-05',
      endDate: '2026-06-07',
      tempMin: 0,
      tempMax: 40,
      space: 1
    },
    {
      chamber: 'chamber-large',
      user: '周杨',
      content: '高低温循环测试 - 芯片老化',
      startDate: '2026-06-02',
      endDate: '2026-06-06',
      tempMin: -40,
      tempMax: 85,
      space: 3
    },
    {
      chamber: 'chamber-east',
      user: '张伟',
      content: '传感器校准',
      startDate: '2026-06-08',
      endDate: '2026-06-10',
      tempMin: -20,
      tempMax: 60,
      space: 1
    },
    {
      chamber: 'chamber-small',
      user: '李晓东',
      content: '电路板振动测试',
      startDate: '2026-06-04',
      endDate: '2026-06-06',
      tempMin: 0,
      tempMax: 40,
      space: 1
    }
  ];
  for (const payload of seedData) {
    try { await saveNewBooking(payload); } catch (e) { console.warn('演示数据导入跳过:', e.message); }
  }
}

function genId() {
  return 'bk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// ===================== 共享核心逻辑 =====================
let currentChamber = 'chamber-small';
let currentMonth = getMonthStart(new Date());
let deleteTargetId = null;
let selectedDateStr = null;

function getBookingsForDate(chamber, date) {
  const d = formatDate(date);
  return bookings.filter(b => b.chamber === chamber && d >= b.startDate && d <= b.endDate);
}

function isTempCompatible(a, b) {
  const aMin = (a.tempMin !== null) ? Number(a.tempMin) : -Infinity;
  const aMax = (a.tempMax !== null) ? Number(a.tempMax) : Infinity;
  const bMin = (b.tempMin !== null) ? Number(b.tempMin) : -Infinity;
  const bMax = (b.tempMax !== null) ? Number(b.tempMax) : Infinity;
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

function checkConflict(chamber, startDate, endDate, excludeId, newSpace, newTempMin, newTempMax) {
  const newStub = { space: newSpace, tempMin: newTempMin, tempMax: newTempMax };
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = formatDate(d);
    const dayBks = bookings.filter(b =>
      b.chamber === chamber && ds >= b.startDate && ds <= b.endDate && (!excludeId || b.id !== excludeId)
    );
    if (!canCoexist([...dayBks, newStub])) return true;
  }
  return false;
}

function getSpaceInfo(chamber, date) {
  const bks = getBookingsForDate(chamber, date);
  const used = bks.reduce((s, b) => s + (Number(b.space) || 1), 0);
  const shared = bks.length > 1 && canCoexist(bks);
  return { used, free: Math.max(0, TOTAL_SPACE - used), total: TOTAL_SPACE, shared, count: bks.length };
}

function isHighRisk(booking) {
  if (!booking) return false;
  const min = booking.tempMin !== null ? Number(booking.tempMin) : null;
  const max = booking.tempMax !== null ? Number(booking.tempMax) : null;
  return (min !== null && min < TEMP_RISK_LOW) || (max !== null && max > TEMP_RISK_HIGH);
}

function getTempDisplay(booking) {
  if (!booking) return '';
  if (booking.tempMin === null && booking.tempMax === null) return '';
  if (booking.tempMin === null) return `≤${booking.tempMax}°C`;
  if (booking.tempMax === null) return `≥${booking.tempMin}°C`;
  return `${booking.tempMin}~${booking.tempMax}°C`;
}

function getUserInitial(name) {
  return name ? name.slice(0, 1) : '?';
}

// ===================== 温度色彩映射 =====================
// 温度梯度：-40 ~ 100°C 映射到 0~1
const TEMP_STOPS = [
  { t: -40, color: [0, 212, 255] },    // #00d4ff 冷
  { t:   0, color: [0, 255, 136] },    // #00ff88 适中
  { t:  40, color: [255, 149, 0] },    // #ff9500 暖
  { t:  70, color: [255, 42, 92] },    // #ff2a5c 热
  { t: 100, color: [255, 0, 64] }      // #ff0040 极热
];

function tempToColor(temp) {
  if (temp === null || temp === undefined) return null;
  let t = Math.max(-40, Math.min(100, temp));
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const s0 = TEMP_STOPS[i], s1 = TEMP_STOPS[i + 1];
    if (t >= s0.t && t <= s1.t) {
      const p = (t - s0.t) / (s1.t - s0.t);
      const r = Math.round(s0.color[0] + (s1.color[0] - s0.color[0]) * p);
      const g = Math.round(s0.color[1] + (s1.color[1] - s0.color[1]) * p);
      const b = Math.round(s0.color[2] + (s1.color[2] - s0.color[2]) * p);
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = TEMP_STOPS[TEMP_STOPS.length - 1];
  return `rgb(${last.color.join(',')})`;
}

// 计算某天所有预约的平均代表温度，用于日历格热力着色
function getDayRepresentativeTemp(chamber, date) {
  const bks = getBookingsForDate(chamber, date);
  if (!bks.length) return null;
  let sum = 0, count = 0;
  bks.forEach(b => {
    if (b.tempMin !== null) { sum += Number(b.tempMin); count++; }
    if (b.tempMax !== null) { sum += Number(b.tempMax); count++; }
  });
  return count > 0 ? sum / count : null;
}

// ===================== 渲染统计区 =====================
function renderChamberNav() {
  document.querySelectorAll('.chamber-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sheet === currentChamber);
  });
}

function renderStats() {
  const chamberBks = bookings.filter(b => b.chamber === currentChamber);
  const now = new Date();
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const monthCount = chamberBks.filter(b => {
    const bs = new Date(b.startDate);
    const be = new Date(b.endDate);
    return bs <= eom && be >= som;
  }).length;

  const todayBks = getBookingsForDate(currentChamber, now);

  let sharedCount = 0;
  const seen = new Set();
  chamberBks.forEach(b => {
    const s = new Date(b.startDate);
    const e = new Date(b.endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const ds = formatDate(d);
      if (seen.has(ds)) continue;
      if (getBookingsForDate(currentChamber, d).length >= 2) { sharedCount++; seen.add(ds); }
    }
  });

  document.getElementById('stat-month-count').textContent = monthCount;
  document.getElementById('stat-today-count').textContent = todayBks.length;
  document.getElementById('stat-shared-count').textContent = sharedCount;
  document.getElementById('stat-high-risk').textContent = chamberBks.filter(isHighRisk).length;

  // 更新统计条宽度
  // 以当月总天数作为参考基数
  const daysInMonth = getDaysInMonth(now);
  document.querySelector('#stat-month-count + .stat-card-label + .stat-card-bar .stat-card-fill').style.width =
    Math.min(100, (monthCount / Math.max(1, daysInMonth)) * 100) + '%';
  document.querySelector('#stat-today-count + .stat-card-label + .stat-card-bar .stat-card-fill').style.width =
    Math.min(100, (todayBks.length / TOTAL_SPACE) * 100) + '%';
  document.querySelector('#stat-shared-count + .stat-card-label + .stat-card-bar .stat-card-fill').style.width =
    Math.min(100, (sharedCount / Math.max(1, daysInMonth)) * 100) + '%';
  document.querySelector('#stat-high-risk + .stat-card-label + .stat-card-bar .stat-card-fill').style.width =
    Math.min(100, (chamberBks.filter(isHighRisk).length / Math.max(1, chamberBks.length || 1)) * 100) + '%';
}

// ===================== 日历渲染 =====================
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // 更新标题
  const titleEl = document.getElementById('calendar-title');
  titleEl.querySelector('.month-year').textContent = year;
  titleEl.querySelector('.month-num').textContent = String(month + 1).padStart(2, '0');

  const firstDay = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(currentMonth);
  const startWeekday = firstDay.getDay();

  const totalCells = 42;
  const prevMonthEnd = new Date(year, month, 0);
  const prevMonthDays = prevMonthEnd.getDate();

  for (let i = 0; i < totalCells; i++) {
    let date, isOtherMonth = false;

    if (i < startWeekday) {
      date = new Date(year, month - 1, prevMonthDays - startWeekday + 1 + i);
      isOtherMonth = true;
    } else if (i < startWeekday + daysInMonth) {
      date = new Date(year, month, i - startWeekday + 1);
    } else {
      date = new Date(year, month + 1, i - startWeekday - daysInMonth + 1);
      isOtherMonth = true;
    }

    const cell = createCalendarCell(date, isOtherMonth);
    grid.appendChild(cell);
  }
}

function createCalendarCell(date, isOtherMonth) {
  const ds = formatDate(date);
  const dayBks = isOtherMonth ? [] : getBookingsForDate(currentChamber, date);
  const spaceInfo = isOtherMonth ? { used: 0, free: 3, shared: false } : getSpaceInfo(currentChamber, date);

  const cell = document.createElement('div');
  cell.className = 'calendar-cell';
  cell.dataset.date = ds;

  if (isOtherMonth) cell.classList.add('other-month');
  if (isSameDay(date, TODAY)) cell.classList.add('today');
  if (isWeekend(date) && !isOtherMonth) cell.classList.add('weekend');

  const hasRisk = dayBks.some(isHighRisk);
  const repTemp = isOtherMonth ? null : getDayRepresentativeTemp(currentChamber, date);

  // 热力背景层
  let bgStyle = '';
  let borderGlow = '';
  if (!isOtherMonth && repTemp !== null) {
    const color = tempToColor(repTemp);
    bgStyle = color ? `background:${color};opacity:0.22;` : '';
    if (hasRisk) {
      bgStyle = `background:#ff0040;opacity:0.24;`;
      borderGlow = 'border-color:rgba(255,0,64,0.35);';
    }
  }

  // 指示点类别
  let dotClass = 'free';
  if (dayBks.length > 0) {
    if (spaceInfo.free === 0) dotClass = 'full';
    else if (spaceInfo.shared) dotClass = 'shared';
    else dotClass = 'used';
  }
  if (hasRisk) dotClass = 'hot';

  // 温度范围文本（取最高温作为代表显示）
  let tempRangeHtml = '';
  if (!isOtherMonth && dayBks.length > 0) {
    const temps = [];
    dayBks.forEach(b => {
      const t = getTempDisplay(b);
      if (t) temps.push(t);
    });
    if (temps.length) {
      const tempCls = hasRisk ? 'high-risk' : '';
      tempRangeHtml = `<div class="cell-temp-range ${tempCls}">${temps.join(' / ')}</div>`;
    }
  }

  // 状态条
  let statusBarHtml = '';
  if (!isOtherMonth && dayBks.length > 0) {
    const segments = [];
    for (let u = 0; u < TOTAL_SPACE; u++) {
      let cls = 'status-segment';
      if (u < spaceInfo.used) {
        if (hasRisk) cls += ' high-risk';
        else if (spaceInfo.shared) cls += ' shared';
        else cls += ' used';
      }
      segments.push(`<div class="${cls}"></div>`);
    }
    statusBarHtml = `<div class="cell-status-bar">${segments.join('')}</div>`;
  }

  // 底部标签
  let footerHtml = '';
  if (!isOtherMonth && dayBks.length > 0) {
    let tagClass = 'cell-tag-free';
    let tagText = '空闲';
    if (spaceInfo.free === 0) { tagClass = 'cell-tag-full'; tagText = '已满'; }
    else if (hasRisk) { tagClass = 'cell-tag-hot'; tagText = '高风险'; }
    else if (spaceInfo.shared) { tagClass = 'cell-tag-shared'; tagText = '可共享'; }
    else if (repTemp !== null && repTemp >= 40) { tagClass = 'cell-tag-warm'; tagText = '高温运行'; }
    footerHtml = `<span class="cell-tag ${tagClass}">${tagText}</span>`;
  }

  const occupancyHtml = !isOtherMonth && dayBks.length > 0
    ? `<span class="cell-occupancy">${spaceInfo.used}/${TOTAL_SPACE}U</span>`
    : '';

  cell.innerHTML = `
    ${bgStyle ? `<div class="cell-thermal-bg" style="${bgStyle}"></div>` : ''}
    <div class="cell-content">
      <div class="cell-header">
        <span class="cell-day">${date.getDate()}</span>
        <div class="cell-indicators">
          <span class="indicator-dot ${dotClass}"></span>
        </div>
      </div>
      ${tempRangeHtml}
      ${statusBarHtml}
      <div class="cell-footer">
        ${footerHtml}
        ${occupancyHtml}
      </div>
    </div>
  `;

  if (borderGlow) cell.style.cssText = borderGlow;

  cell.addEventListener('click', () => {
    if (isOtherMonth) {
      currentMonth = getMonthStart(date);
      renderAll();
    } else {
      openDayDetail(date);
    }
  });

  return cell;
}

function renderAll() {
  renderChamberNav();
  renderStats();
  renderCalendar();
}

// ===================== 日期详情抽屉 =====================
function openDayDetail(date) {
  selectedDateStr = formatDate(date);
  const dayBks = getBookingsForDate(currentChamber, date);
  const spaceInfo = getSpaceInfo(currentChamber, date);

  document.getElementById('day-detail-weekday').textContent = getWeekDay(date);
  document.getElementById('day-detail-daynum').textContent = date.getDate();
  document.getElementById('day-detail-yearmonth').textContent =
    `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('day-detail-space').textContent = `占用 ${spaceInfo.used}/${spaceInfo.total}U`;

  const statusEl = document.getElementById('day-detail-status');
  if (spaceInfo.free === 0) {
    statusEl.textContent = '已满';
    statusEl.className = 'drawer-status full';
  } else if (spaceInfo.shared) {
    statusEl.textContent = '可共享';
    statusEl.className = 'drawer-status can-share';
  } else if (spaceInfo.used > 0) {
    statusEl.textContent = '部分占用';
    statusEl.className = 'drawer-status partial';
  } else {
    statusEl.textContent = '空闲';
    statusEl.className = 'drawer-status free';
  }

  const container = document.getElementById('day-bookings');
  container.innerHTML = '';

  const admin = isAdmin();

  if (dayBks.length === 0) {
    container.innerHTML = `
      <div class="drawer-empty">
        <div class="drawer-empty-icon">📭</div>
        <div class="drawer-empty-text">本日暂无预约</div>
        <div style="font-size:12px;">点击下方按钮可新建预约</div>
      </div>
    `;
  } else {
    dayBks.forEach(b => {
      const tempStr = getTempDisplay(b);
      const isRisk = isHighRisk(b);
      const repTemp = (b.tempMin !== null && b.tempMax !== null)
        ? (Number(b.tempMin) + Number(b.tempMax)) / 2
        : (b.tempMin !== null ? Number(b.tempMin) : Number(b.tempMax));
      const colorBar = tempToColor(repTemp) || 'var(--text-muted)';

      const item = document.createElement('div');
      item.className = 'drawer-booking-item';
      const deleteBtn = admin
        ? `<button class="drawer-booking-delete" data-id="${b.id}" title="删除">×</button>`
        : '';
      item.innerHTML = `
        <div class="booking-color-bar" style="background:${colorBar};"></div>
        <div class="drawer-booking-info">
          <div class="drawer-booking-user">
            ${b.user}${isRisk ? '<span class="risk-badge">高风险</span>' : ''}
          </div>
          <div class="drawer-booking-content">${b.content || '未填写测试内容'}</div>
          <div class="drawer-booking-meta">
            ${tempStr ? `<span class="temp-tag ${isRisk ? 'high-risk' : (b.tempMin < 0 ? 'cold' : (b.tempMax >= 50 ? 'hot' : ''))}">${tempStr}</span>` : ''}
            <span class="space-tag">${b.space || 1}U</span>
          </div>
        </div>
        ${deleteBtn}
      `;
      container.appendChild(item);
    });

    if (admin) {
      container.querySelectorAll('.drawer-booking-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTargetId = btn.dataset.id;
          document.getElementById('delete-overlay').classList.add('active');
        });
      });
    }
  }

  const addBtn = document.getElementById('btn-day-add');
  if (spaceInfo.free > 0) {
    addBtn.textContent = '+ 新建预约';
    addBtn.disabled = false;
    addBtn.classList.remove('btn-ghost');
    addBtn.classList.add('btn-primary');
    addBtn.style.cursor = 'pointer';
  } else {
    addBtn.textContent = '🔒 已满';
    addBtn.disabled = true;
    addBtn.classList.remove('btn-primary');
    addBtn.classList.add('btn-ghost');
    addBtn.style.cursor = 'not-allowed';
  }
  addBtn.onclick = () => {
    if (spaceInfo.free === 0) return;
    closeDayDetail();
    openAddModalWithDate(selectedDateStr);
  };

  document.getElementById('day-detail-overlay').classList.add('active');
}

function closeDayDetail() {
  document.getElementById('day-detail-overlay').classList.remove('active');
}

// ===================== 弹窗操作 =====================
function openAddModal() {
  document.getElementById('modal-title').textContent = '新增预约';
  document.getElementById('booking-id').value = '';
  document.getElementById('form-chamber').value = currentChamber;
  document.getElementById('form-user').value = '';
  document.getElementById('form-content').value = '';
  document.getElementById('form-start-date').value = selectedDateStr || formatDate(TODAY);
  document.getElementById('form-end-date').value = selectedDateStr || formatDate(TODAY);
  document.getElementById('form-temp-min').value = '';
  document.getElementById('form-temp-max').value = '';
  setSpaceValue(1);
  updateTempHint();
  updateTempPreview();
  document.getElementById('modal-overlay').classList.add('active');
}

function openAddModalWithDate(dateStr) {
  selectedDateStr = dateStr;
  openAddModal();
}

function openEditModal(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('modal-title').textContent = '编辑预约';
  document.getElementById('booking-id').value = b.id;
  document.getElementById('form-chamber').value = b.chamber;
  document.getElementById('form-user').value = b.user;
  document.getElementById('form-content').value = b.content;
  document.getElementById('form-start-date').value = b.startDate;
  document.getElementById('form-end-date').value = b.endDate;
  document.getElementById('form-temp-min').value = b.tempMin !== null && b.tempMin !== undefined ? b.tempMin : '';
  document.getElementById('form-temp-max').value = b.tempMax !== null && b.tempMax !== undefined ? b.tempMax : '';
  setSpaceValue(b.space || 1);
  updateTempHint();
  updateTempPreview();
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function closeDeleteModal() {
  document.getElementById('delete-overlay').classList.remove('active');
  deleteTargetId = null;
}

function setSpaceValue(n) {
  document.getElementById('form-space').value = n;
  document.querySelectorAll('.space-option').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.space) === n);
  });
}

function updateTempPreview() {
  const minEl = document.getElementById('form-temp-min');
  const maxEl = document.getElementById('form-temp-max');
  const fillEl = document.getElementById('temp-preview-fill');

  const min = minEl.value === '' ? -40 : Number(minEl.value);
  const max = maxEl.value === '' ? 100 : Number(maxEl.value);

  const rangeMin = -40, rangeMax = 100;
  const totalRange = rangeMax - rangeMin;

  const leftPct = ((Math.max(rangeMin, min) - rangeMin) / totalRange) * 100;
  const rightPct = ((Math.max(rangeMin, max) - rangeMin) / totalRange) * 100;

  fillEl.style.left = leftPct + '%';
  fillEl.style.width = Math.max(0, rightPct - leftPct) + '%';
  fillEl.style.background = 'rgba(0,0,0,0.55)';
}

function updateTempHint() {
  const minEl = document.getElementById('form-temp-min');
  const maxEl = document.getElementById('form-temp-max');
  const hintEl = document.getElementById('temp-hint');
  const min = minEl.value === '' ? null : Number(minEl.value);
  const max = maxEl.value === '' ? null : Number(maxEl.value);

  hintEl.className = 'form-hint';
  hintEl.textContent = '';

  if (min !== null && max !== null && min > max) {
    hintEl.classList.add('danger');
    hintEl.textContent = '最低温度不能高于最高温度';
    return;
  }

  if ((min !== null && min < TEMP_RISK_LOW) || (max !== null && max > TEMP_RISK_HIGH)) {
    hintEl.classList.add('warning');
    hintEl.textContent = `⚠️ 该温度超出安全范围（${TEMP_RISK_LOW}°C ~ ${TEMP_RISK_HIGH}°C），请先咨询周杨后再提交！`;
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('booking-id').value;
  const chamber = document.getElementById('form-chamber').value;
  const user = document.getElementById('form-user').value.trim();
  const content = document.getElementById('form-content').value.trim();
  const startDate = document.getElementById('form-start-date').value;
  const endDate = document.getElementById('form-end-date').value;
  const tempMinRaw = document.getElementById('form-temp-min').value;
  const tempMaxRaw = document.getElementById('form-temp-max').value;
  const space = Number(document.getElementById('form-space').value) || 1;

  if (!user || !content || !startDate || !endDate) {
    alert('请填写所有必填项');
    return;
  }
  if (startDate > endDate) { alert('结束日期不能早于开始日期'); return; }

  const tempMin = tempMinRaw === '' ? null : Number(tempMinRaw);
  const tempMax = tempMaxRaw === '' ? null : Number(tempMaxRaw);

  if (tempMin !== null && tempMax !== null && tempMin > tempMax) {
    alert('最低温度不能高于最高温度'); return;
  }

  const payload = { chamber, user, content, startDate, endDate, tempMin, tempMax, space };

  try {
    if (id) {
      await updateBooking(id, payload);
    } else {
      await saveNewBooking(payload);
    }
    closeModal();
    if (currentChamber !== chamber) currentChamber = chamber;
    renderAll();
  } catch (err) {
    alert(err.message || '提交失败，请检查网络或重试');
  }
}

async function handleDeleteConfirm() {
  if (!isAdmin()) {
    showPermissionDenied('您没有删除权限，请联系管理员');
    closeDeleteModal();
    return;
  }
  if (!deleteTargetId) return;
  try {
    await removeBooking(deleteTargetId, ADMIN_PASSWORD);
    closeDeleteModal();
    if (document.getElementById('day-detail-overlay').classList.contains('active') && selectedDateStr) {
      openDayDetail(new Date(selectedDateStr));
    }
    renderAll();
  } catch (err) {
    showPermissionDenied(err.message || '删除失败');
    closeDeleteModal();
  }
}

// ===================== 导出 =====================
function openExportModal() {
  if (!isAdmin()) {
    showPermissionDenied('只有管理员才能导出汇总记录');
    return;
  }
  const now = new Date();
  document.querySelector('input[name="export-range"][value="year"]').checked = true;
  document.getElementById('custom-range-box').style.display = 'none';
  document.getElementById('export-start').value = formatDate(new Date(now.getFullYear(), 0, 1));
  document.getElementById('export-end').value = formatDate(new Date(now.getFullYear(), 11, 31));
  document.getElementById('export-overlay').classList.add('active');
}

function closeExportModal() {
  document.getElementById('export-overlay').classList.remove('active');
}

function handleExportSubmit(e) {
  e.preventDefault();
  const rangeType = document.querySelector('input[name="export-range"]:checked').value;
  let startDate, endDate;
  if (rangeType === 'year') {
    const now = new Date();
    startDate = formatDate(new Date(now.getFullYear(), 0, 1));
    endDate = formatDate(new Date(now.getFullYear(), 11, 31));
  } else {
    startDate = document.getElementById('export-start').value;
    endDate = document.getElementById('export-end').value;
    if (!startDate || !endDate) { alert('请选择导出日期范围'); return; }
    if (startDate > endDate) { alert('结束日期不能早于开始日期'); return; }
  }
  exportExcel(startDate, endDate);
  closeExportModal();
}

function exportExcel(startDate, endDate) {
  const filtered = bookings.filter(b => b.endDate >= startDate && b.startDate <= endDate);

  const detailData = filtered.map(b => ({
    '温箱': CHAMBERS[b.chamber]?.name || b.chamber,
    '预约人': b.user,
    '测试内容': b.content,
    '开始日期': b.startDate,
    '结束日期': b.endDate,
    '天数': diffDays(new Date(b.startDate), new Date(b.endDate)) + 1,
    '最低温(°C)': b.tempMin !== null ? b.tempMin : '',
    '最高温(°C)': b.tempMax !== null ? b.tempMax : '',
    '空间占用(U)': b.space || 1,
    '是否高风险': isHighRisk(b) ? '是' : '否'
  }));

  const chamberStats = Object.keys(CHAMBERS).map(key => {
    const bks = filtered.filter(b => b.chamber === key);
    let totalDays = 0, sharedDays = 0, totalSpace = 0;
    const seenDates = new Set();
    bks.forEach(b => {
      const s = new Date(b.startDate), e = new Date(b.endDate);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const ds = formatDate(d);
        if (ds < startDate || ds > endDate) continue;
        if (!seenDates.has(ds + key)) { seenDates.add(ds + key); totalDays++; }
        totalSpace += (b.space || 1);
        if (getBookingsForDate(key, d).length >= 2) sharedDays++;
      }
    });
    return {
      '温箱名称': CHAMBERS[key].name,
      '总预约数': bks.length,
      '总预约天数': totalDays,
      '共享天数': sharedDays,
      '独占天数': totalDays - sharedDays,
      '平均占用空间(U)': totalDays > 0 ? (totalSpace / totalDays).toFixed(2) : '0.00'
    };
  });

  const userMap = {};
  filtered.forEach(b => {
    if (!userMap[b.user]) userMap[b.user] = { user: b.user, count: 0, days: 0, chamberMap: {}, highRisk: 0 };
    const u = userMap[b.user];
    u.count++;
    const s = new Date(b.startDate), e = new Date(b.endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) { const ds = formatDate(d); if (ds >= startDate && ds <= endDate) u.days++; }
    u.chamberMap[b.chamber] = (u.chamberMap[b.chamber] || 0) + 1;
    if (isHighRisk(b)) u.highRisk++;
  });

  const userStats = Object.values(userMap).map(u => {
    const fav = Object.entries(u.chamberMap).sort((a, b) => b[1] - a[1])[0];
    return { '预约人': u.user, '预约次数': u.count, '占用天数': u.days, '最常用温箱': fav ? CHAMBERS[fav[0]]?.name : '', '高风险预约次数': u.highRisk };
  });

  const monthMap = {};
  filtered.forEach(b => {
    const s = new Date(b.startDate), e = new Date(b.endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const ds = formatDate(d);
      if (ds < startDate || ds > endDate) continue;
      const label = getMonthLabel(ds);
      if (!monthMap[label]) monthMap[label] = { label, small: 0, large: 0, east: 0, total: 0, shared: 0, highRisk: 0 };
      const m = monthMap[label];
      const dayBks = getBookingsForDate(b.chamber, d);
      const seenKey = label + ds + b.chamber;
      if (!monthMap._seen) monthMap._seen = new Set();
      if (monthMap._seen.has(seenKey)) continue;
      monthMap._seen.add(seenKey);
      m.total++;
      if (b.chamber === 'chamber-small') m.small++;
      else if (b.chamber === 'chamber-large') m.large++;
      else if (b.chamber === 'chamber-east') m.east++;
      if (dayBks.length >= 2) m.shared++;
      if (isHighRisk(b)) m.highRisk++;
    }
  });
  delete monthMap._seen;

  const monthStats = Object.values(monthMap).sort((a, b) => a.label.localeCompare(b.label)).map(m => ({
    '月份': m.label,
    '西厂房小温箱天数': m.small,
    '大温箱天数': m.large,
    '东厂房小温箱天数': m.east,
    '总预约天数': m.total,
    '共享天数': m.shared,
    '高风险天数': m.highRisk
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), '预约明细');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chamberStats), '温箱统计');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userStats), '人员统计');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthStats), '月度统计');

  XLSX.writeFile(wb, `温箱使用汇总_${startDate}_${endDate}.xlsx`);
}

// ===================== 事件绑定 =====================
document.addEventListener('DOMContentLoaded', () => {
  updateRoleUI();

  document.getElementById('btn-role-switch').addEventListener('click', () => {
    if (isAdmin()) {
      // 管理员切换到普通用户无需认证
      setRole(ROLES.USER);
      updateRoleUI();
      if (document.getElementById('day-detail-overlay').classList.contains('active') && selectedDateStr) {
        openDayDetail(new Date(selectedDateStr));
      }
      renderAll();
    } else {
      // 切换到管理员需要密钥认证
      openAuthModal();
    }
  });

  // 认证弹窗事件
  document.getElementById('auth-close').addEventListener('click', closeAuthModal);
  document.getElementById('btn-auth-cancel').addEventListener('click', closeAuthModal);
  document.getElementById('auth-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('auth-overlay')) closeAuthModal();
  });
  document.getElementById('btn-auth-confirm').addEventListener('click', handleAuthConfirm);
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAuthConfirm();
  });

  // 侧边栏温箱切换
  document.querySelectorAll('.chamber-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentChamber = btn.dataset.sheet; renderAll(); });
  });

  // 月份切换
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    currentMonth = addMonths(currentMonth, -1);
    renderCalendar();
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    currentMonth = addMonths(currentMonth, 1);
    renderCalendar();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    currentMonth = getMonthStart(TODAY);
    renderAll();
  });

  // 预约弹窗
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // 删除弹窗
  document.getElementById('delete-close').addEventListener('click', closeDeleteModal);
  document.getElementById('btn-delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('delete-overlay')) closeDeleteModal();
  });
  document.getElementById('btn-delete-confirm').addEventListener('click', handleDeleteConfirm);

  // 表单
  document.getElementById('booking-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('form-temp-min').addEventListener('input', () => { updateTempHint(); updateTempPreview(); });
  document.getElementById('form-temp-max').addEventListener('input', () => { updateTempHint(); updateTempPreview(); });

  // 空间选择器
  document.querySelectorAll('.space-option').forEach(btn => {
    btn.addEventListener('click', () => setSpaceValue(Number(btn.dataset.space)));
  });

  // 详情抽屉
  document.getElementById('day-detail-close').addEventListener('click', closeDayDetail);
  document.getElementById('day-detail-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('day-detail-overlay')) closeDayDetail();
  });

  // 导出
  document.getElementById('btn-export').addEventListener('click', openExportModal);
  document.getElementById('export-close').addEventListener('click', closeExportModal);
  document.getElementById('btn-export-cancel').addEventListener('click', closeExportModal);
  document.getElementById('export-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('export-overlay')) closeExportModal();
  });
  document.getElementById('export-form').addEventListener('submit', handleExportSubmit);

  document.querySelectorAll('input[name="export-range"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const show = document.querySelector('input[name="export-range"]:checked').value === 'custom';
      document.getElementById('custom-range-box').style.display = show ? 'grid' : 'none';
    });
  });

  syncIfEmpty().then(() => renderAll());
});
