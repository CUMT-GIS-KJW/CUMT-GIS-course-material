# Node.js 简易留言板

本项目用于“地理信息网络服务实验三”：前端使用 HTML、CSS、JavaScript，后端使用 Node.js + Express，数据库使用 MySQL。

## 功能

- 用户注册、登录、退出
- 发布留言
- 评论留言：可在其他用户发布的留言下发表评论
- 展示留言与评论
- 删除自己发布的留言或评论
- 搜索用户名或留言内容
- 筛选“全部 / 我的参与”
- 首页展示 MySQL 连接状态和统计数据
- 后端启动时自动检查并创建数据库与数据表

## 运行步骤

1. 安装依赖：

```bash
npm.cmd install
```

2. 检查 `.env` 配置：

```text
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=message_board
```

3. 启动服务：

```bash
npm.cmd start
```

也可以双击 `start.bat` 启动。

4. 浏览器访问：

```text
http://localhost:3000
```

## 数据库说明

后端启动时会自动执行以下检查：

- 连接 MySQL
- 创建 `message_board` 数据库
- 创建 `users` 用户表
- 创建 `messages` 留言表

如果需要手动初始化，也可以双击 `init-db.bat`，或执行：

```bash
mysql -u root -p < database/schema.sql
```

## 主要接口

- `GET /api/health`：检查 MySQL 连接状态和统计信息
- `GET /api/session`：获取当前登录用户
- `POST /api/register`：用户注册
- `POST /api/login`：用户登录
- `POST /api/logout`：退出登录
- `GET /api/messages`：获取留言列表
- `POST /api/messages`：发布留言
- `POST /api/messages/:id/comments`：评论留言
- `DELETE /api/messages/:id`：删除留言或评论

## 目录结构

```text
.
├── database/
│   └── schema.sql
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env
├── .env.example
├── init-db.bat
├── start.bat
├── package.json
├── server.js
└── 实验报告.md
```
