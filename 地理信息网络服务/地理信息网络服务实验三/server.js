const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dbName = process.env.DB_NAME || 'message_board';

let pool;

const baseDbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
};

function assertSafeDatabaseName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('数据库名称只能包含字母、数字和下划线');
  }
}

async function ensureDatabase() {
  assertSafeDatabaseName(dbName);

  const connection = await mysql.createConnection(baseDbConfig);
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\`
     DEFAULT CHARACTER SET utf8mb4
     DEFAULT COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      parent_id INT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_messages_user_id (user_id),
      INDEX idx_messages_parent_id (parent_id),
      CONSTRAINT fk_messages_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_messages_parent
        FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: '请先登录' });
  }
  next();
}

function cleanContent(value) {
  return String(value || '').trim();
}

function validateContent(content, label = '内容') {
  if (!content) {
    return `${label}不能为空`;
  }

  if (content.length > 500) {
    return `${label}不能超过 500 个字符`;
  }

  return '';
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    name: 'message_board_sid',
    secret: process.env.SESSION_SECRET || 'dev-message-board-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

app.get('/api/health', async (req, res) => {
  try {
    const [[dbStatus]] = await pool.query('SELECT NOW() AS serverTime');
    const [[userStats]] = await pool.query('SELECT COUNT(*) AS count FROM users');
    const [[messageStats]] = await pool.query(
      `SELECT
        SUM(parent_id IS NULL) AS messageCount,
        SUM(parent_id IS NOT NULL) AS commentCount
       FROM messages`
    );

    res.json({
      ok: true,
      serverTime: dbStatus.serverTime,
      stats: {
        users: Number(userStats.count || 0),
        messages: Number(messageStats.messageCount || 0),
        comments: Number(messageStats.commentCount || 0),
        replies: Number(messageStats.commentCount || 0)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: 'MySQL 连接失败' });
  }
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/.test(username)) {
    return res.status(400).json({ message: '用户名需为 3-20 位，可包含中文、字母、数字和下划线' });
  }

  if (password.length < 6 || password.length > 40) {
    return res.status(400).json({ message: '密码长度需为 6-40 个字符' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    req.session.user = { id: result.insertId, username };
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名已存在' });
    }
    console.error(error);
    res.status(500).json({ message: '注册失败，请稍后再试' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    req.session.user = { id: user.id, username: user.username };
    res.json({ user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '登录失败，请稍后再试' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('message_board_sid');
    res.json({ message: '已退出登录' });
  });
});

app.get('/api/messages', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT m.id, m.parent_id, m.content, m.created_at, u.username, u.id AS user_id
       FROM messages m
       JOIN users u ON m.user_id = u.id
       ORDER BY COALESCE(m.parent_id, m.id) DESC, m.parent_id IS NOT NULL, m.created_at ASC`
    );

    const messageMap = new Map();
    const messages = [];

    rows.forEach((row) => {
      const item = {
        id: row.id,
        parentId: row.parent_id,
        content: row.content,
        createdAt: row.created_at,
        userId: row.user_id,
        username: row.username,
        replies: []
      };

      if (!item.parentId) {
        messageMap.set(item.id, item);
        messages.push(item);
      } else {
        const parent = messageMap.get(item.parentId);
        if (parent) {
          parent.replies.push(item);
        }
      }
    });

    res.json({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '获取留言失败' });
  }
});

app.post('/api/messages', requireLogin, async (req, res) => {
  const content = cleanContent(req.body.content);
  const error = validateContent(content, '留言内容');

  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    await pool.execute('INSERT INTO messages (user_id, content) VALUES (?, ?)', [
      req.session.user.id,
      content
    ]);
    res.status(201).json({ message: '留言成功' });
  } catch (dbError) {
    console.error(dbError);
    res.status(500).json({ message: '留言失败' });
  }
});

async function createComment(req, res) {
  const messageId = parseId(req.params.id);
  const content = cleanContent(req.body.content);
  const error = validateContent(content, '评论内容');

  if (!messageId) {
    return res.status(400).json({ message: '留言编号不正确' });
  }

  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM messages WHERE id = ? AND parent_id IS NULL',
      [messageId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: '留言不存在' });
    }

    await pool.execute('INSERT INTO messages (user_id, parent_id, content) VALUES (?, ?, ?)', [
      req.session.user.id,
      messageId,
      content
    ]);
    res.status(201).json({ message: '评论成功' });
  } catch (dbError) {
    console.error(dbError);
    res.status(500).json({ message: '评论失败' });
  }
}

app.post('/api/messages/:id/comments', requireLogin, createComment);
app.post('/api/messages/:id/replies', requireLogin, createComment);

app.delete('/api/messages/:id', requireLogin, async (req, res) => {
  const messageId = parseId(req.params.id);

  if (!messageId) {
    return res.status(400).json({ message: '留言编号不正确' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM messages WHERE id = ? AND user_id = ?', [
      messageId,
      req.session.user.id
    ]);

    if (!result.affectedRows) {
      return res.status(403).json({ message: '只能删除自己发布的内容' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '删除失败' });
  }
});

async function startServer() {
  await ensureDatabase();
  pool = mysql.createPool({ ...baseDbConfig, database: dbName });
  await pool.query('SELECT 1');
  await ensureTables();

  app.listen(port, () => {
    console.log(`留言板已启动：http://localhost:${port}`);
    console.log('数据库连接正常');
  });
}

startServer().catch((error) => {
  console.error('服务启动失败：', error.message);
  process.exit(1);
});
