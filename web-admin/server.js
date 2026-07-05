const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'rootpassword',
    database: process.env.DB_NAME || 'nsotien_0',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware xác thực siêu đơn giản (dùng hardcoded token cho an toàn cơ bản)
const API_TOKEN = 'nso_admin_secret_123';
const checkAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === `Bearer ${API_TOKEN}`) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// ================= USERS API =================

// Lấy danh sách tài khoản
app.get('/api/users', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, luong, coin, activated, status FROM users ORDER BY id DESC LIMIT 100');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cộng thêm Lượng / Coin cho tài khoản
app.post('/api/users/add-money', checkAuth, async (req, res) => {
    const { id, luong, coin } = req.body;
    try {
        await pool.query('UPDATE users SET luong = luong + ?, coin = coin + ? WHERE id = ?', [luong || 0, coin || 0, id]);
        res.json({ success: true, message: 'Đã cộng tiền thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Khoá / Mở khoá tài khoản
app.post('/api/users/toggle-lock', checkAuth, async (req, res) => {
    const { id, status } = req.body;
    try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: 'Đã đổi trạng thái thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tạo tài khoản mới
app.post('/api/users/create', checkAuth, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu' });
    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) return res.status(400).json({ error: 'Tên tài khoản đã tồn tại' });
        
        await pool.query('INSERT INTO users (username, password, luong, coin) VALUES (?, ?, 0, 0)', [username, password]);
        res.json({ success: true, message: 'Tạo tài khoản thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PLAYERS API =================

// Tìm kiếm nhân vật
app.get('/api/players', checkAuth, async (req, res) => {
    const search = req.query.q || '';
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.name, p.xu, p.yen, p.level, p.class, u.username, p.bag
            FROM players p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.name LIKE ? 
            ORDER BY p.id DESC LIMIT 50
        `, [`%${search}%`]);
        
        // Không gửi toàn bộ túi đồ dạng chuỗi JSON về để tránh nặng băng thông, chỉ đếm số đồ
        const results = rows.map(r => {
            let bagItems = [];
            try { bagItems = JSON.parse(r.bag); } catch(e) {}
            return {
                id: r.id,
                name: r.name,
                xu: r.xu,
                yen: r.yen,
                level: r.level,
                class: r.class,
                username: r.username,
                bagCount: bagItems.length
            };
        });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cộng thêm Xu / Yên cho nhân vật
app.post('/api/players/add-money', checkAuth, async (req, res) => {
    const { id, xu, yen } = req.body;
    try {
        await pool.query('UPDATE players SET xu = xu + ?, yen = yen + ? WHERE id = ?', [xu || 0, yen || 0, id]);
        res.json({ success: true, message: 'Đã buff Xu/Yên thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm vật phẩm vào túi đồ nhân vật (Yêu cầu nhân vật offline)
app.post('/api/players/add-item', checkAuth, async (req, res) => {
    const { id, itemId, quantity, isLock, upgrade } = req.body;
    try {
        // Lấy túi đồ hiện tại
        const [rows] = await pool.query('SELECT bag FROM players WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        
        let bag = [];
        try { bag = JSON.parse(rows[0].bag); } catch (e) { bag = []; }

        const newItem = {
            id: parseInt(itemId),
            quantity: parseInt(quantity) || 1,
            isLock: isLock ? true : false,
            upgrade: parseInt(upgrade) || 0,
            sys: 0,
            options: []
        };
        
        bag.push(newItem);
        await pool.query('UPDATE players SET bag = ? WHERE id = ?', [JSON.stringify(bag), id]);
        res.json({ success: true, message: 'Đã buff Item vào túi thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set cấp độ nhân vật
app.post('/api/players/set-level', checkAuth, async (req, res) => {
    const { id, level } = req.body;
    try {
        await pool.query('UPDATE players SET level = ? WHERE id = ?', [parseInt(level) || 1, id]);
        res.json({ success: true, message: 'Đã chỉnh cấp độ thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dashboard stats
app.get('/api/stats', checkAuth, async (req, res) => {
    try {
        const [userCount] = await pool.query('SELECT COUNT(*) as c FROM users');
        const [playerCount] = await pool.query('SELECT COUNT(*) as c FROM players');
        const [onlineCount] = await pool.query('SELECT COUNT(*) as c FROM users WHERE online = 1');
        res.json({
            users: userCount[0].c,
            players: playerCount[0].c,
            online: onlineCount[0].c
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ITEM DICTIONARY API =================

// Lấy danh sách Item
app.get('/api/items', checkAuth, async (req, res) => {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    try {
        let query = 'SELECT id, name, description, level FROM item WHERE name LIKE ? ORDER BY id ASC LIMIT ? OFFSET ?';
        const [rows] = await pool.query(query, [`%${search}%`, parseInt(limit), offset]);
        const [total] = await pool.query('SELECT COUNT(*) as count FROM item WHERE name LIKE ?', [`%${search}%`]);
        res.json({ data: rows, total: total[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= GIFTCODE API =================

// Lấy danh sách Giftcode
app.get('/api/giftcodes', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM gift_codes ORDER BY id DESC');
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tạo mới Giftcode
app.post('/api/giftcodes', checkAuth, async (req, res) => {
    const { code, coin, gold, yen, items, type } = req.body;
    if (!code) return res.status(400).json({ error: 'Mã Giftcode không được để trống' });
    try {
        const [existing] = await pool.query('SELECT id FROM gift_codes WHERE code = ?', [code]);
        if (existing.length > 0) return res.status(400).json({ error: 'Mã Giftcode đã tồn tại' });

        const itemsJson = items ? JSON.stringify(items) : '[]';
        await pool.query(
            'INSERT INTO gift_codes (code, coin, gold, yen, items, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())',
            [code, parseInt(coin) || 0, parseInt(gold) || 0, parseInt(yen) || 0, itemsJson, parseInt(type) || 0]
        );
        res.json({ success: true, message: 'Tạo Giftcode thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xóa Giftcode
app.delete('/api/giftcodes/:id', checkAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM gift_codes WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Đã xóa Giftcode!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log('Web Admin API Server running on port 3000');
});
