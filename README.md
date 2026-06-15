# 🌡 温箱资源预约管理系统

基于 Express + SQLite + 纯前端的温箱资源预约管理系统，支持多人实时数据同步、权限管理、Excel 导出等功能。

---

## 🚀 快速启动（本地开发）

### 前置要求
- Node.js ≥ 18 （[下载地址](https://nodejs.org/)）
- npm （随 Node.js 一起安装）

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

或者开发热重启模式：

```bash
npm run dev
```

服务启动后访问：

```
http://localhost:3000
```

---

## 📡 公网部署方案

### 推荐方案：Railway（最简单，有免费额度）

1. **注册/登录**
   - 打开 [railway.app](https://railway.app)
   - 用 GitHub 账号一键登录

2. **新建项目**
   - 点击 **New Project** → **Deploy from GitHub repo**
   - 选择 `thermo-manager` 仓库

3. **自动部署**
   - Railway 会自动检测到 `package.json` 和 `server.js`
   - 点击 **Deploy**，等待约 2 分钟

4. **获取公网链接**
   - 部署完成后，点击项目名下显示的域名
   - 格式如：`https://thermo-manager-production.up.railway.app`
   - 把链接分享给同事即可使用

> Railway 每月有 $5 免费额度，足够小团队日常使用。

### 备选方案 1：Render（免费，永不休眠）

比 Railway 更稳定（不开源 Providence）的一个区别：Render 的免费服务永不休眠。

1. 登录 [render.com](https://render.com)（用 GitHub 登录）
2. **New Web Service** → 连接 GitHub 仓库
3. 确认配置：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. 点击 **Create Web Service**

### 备选方案 2：公司内网服务器（Port 映射）

如果公司有一台能连外网的服务器或工控机：

```bash
# 把代码传到服务器
scp -r . user@服务器IP:/opt/thermo-manager

# SSH 登录服务器
ssh user@服务器IP

# 进入目录
cd /opt/thermo-manager

# 安装依赖并启动
npm install
nohup npm start > app.log 2>&1 &
```

然后在路由器或防火墙上做 **端口映射**：
- 外部端口 `80` → 内网 IP:3000

---

## 🔧 配置文件

### 修改管理员密钥

打开 `js/app.js` 第 45 行：

```javascript
const ADMIN_PASSWORD = 'Yingjian123';
```

把它改成你自己的密码。**注意**：前端源码中仍可被看到，这是"防误操作"级别的保护。如需更高安全性，可把密码移到后端并做哈希验证。

### 修改后端管理员密钥

打开 `server.js` 第 11 行：

```javascript
const ADMIN_PASSWORD = 'Yingjian123';
```

**必须与前端密码保持一致**，否则删除功能会失败。

---

## 📂 项目结构

```
thermo-manager/
│
├── index.html          # 前端主页面
├── css/
│   └── style.css       # 样式表
├── js/
│   └── app.js          # 前端逻辑（API 调用）
│
├── server.js           # Express 后端服务
├── package.json        # 项目配置
├── thermo.db           # SQLite 数据库（自动生成）
└── README.md           # 本文件
```

---

## 🧪 API 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/bookings` | 获取所有预约 |
| GET | `/api/bookings/:chamber` | 获取指定温箱预约 |
| GET | `/api/bookings/detail/:id` | 获取单个预约详情 |
| POST | `/api/bookings` | 新增预约 |
| PUT | `/api/bookings/:id` | 编辑预约 |
| DELETE | `/api/bookings/:id` | 删除预约（需密码） |

---

## ⚠️ 已知限制

1. **数据存储在 SQLite**：后端重启时数据不会丢失，但删除 `.db` 文件会清空所有数据。建议定期备份 `thermo.db` 文件。
2. **无用户登录系统**：所有人共用一套密码认证，适合小团队内部使用。
3. **前端密码是明文的**：懂前端的人按 F12 可以看到，这是有意识的简化设计。

---

## 🔄 备份数据

SQLite 数据库文件就是 `thermo.db`，直接复制它即可备份：

```bash
cp thermo.db thermo_backup_$(date +%Y%m%d).db
```

---

## 📝 变更日志

### V2.0 - 后端同步版
- ✅ 新增 Express + SQLite 后端
- ✅ 多人实时数据同步
- ✅ 管理员删除权限移到后端验证
- ✅ 首次启动自动导入演示数据

### V1.0 - 纯前端版
- ✅ 日历热力图视图
- ✅ 温箱空间共享逻辑
- ✅ 管理员权限 + Excel 导出

---

## 📧 维护者

周杨 — 如有问题请联系
