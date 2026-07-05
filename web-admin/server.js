const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

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

// Toggle Lock User (1 = khoá, 0 = bình thường)
app.post('/api/users/toggle-lock', checkAuth, async (req, res) => {
    const { id, status } = req.body;
    try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: status === 1 ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Kích kẹt (Reset online status)
app.post('/api/users/unstuck', checkAuth, async (req, res) => {
    const { id } = req.body;
    try {
        if (id === 'all') {
            await pool.query('UPDATE users SET online = 0');
            return res.json({ success: true, message: 'Đã kích kẹt toàn bộ tài khoản trên Server!' });
        } else {
            await pool.query('UPDATE users SET online = 0 WHERE id = ?', [id]);
            return res.json({ success: true, message: 'Đã kích kẹt tài khoản thành công!' });
        }
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

// Quản lý Nhân Vật (có phân trang)
app.get('/api/players', checkAuth, async (req, res) => {
    const search = req.query.q || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        const query = search 
            ? 'SELECT p.id, p.name, p.xu, p.yen, p.bag, p.map, p.class, u.username, u.online, JSON_EXTRACT(p.data, "$.level") as level FROM players p JOIN users u ON p.user_id = u.id WHERE p.name LIKE ? ORDER BY p.id DESC LIMIT ? OFFSET ?'
            : 'SELECT p.id, p.name, p.xu, p.yen, p.bag, p.map, p.class, u.username, u.online, JSON_EXTRACT(p.data, "$.level") as level FROM players p JOIN users u ON p.user_id = u.id ORDER BY p.id DESC LIMIT ? OFFSET ?';
        
        const countQuery = search 
            ? 'SELECT COUNT(*) as total FROM players WHERE name LIKE ?'
            : 'SELECT COUNT(*) as total FROM players';
        
        const params = search ? [`%${search}%`, limit, offset] : [limit, offset];
        const countParams = search ? [`%${search}%`] : [];
        
        const [rows] = await pool.query(query, params);
        const [countResult] = await pool.query(countQuery, countParams);
        
        const players = rows.map(r => {
            let bagCount = 0;
            try { bagCount = JSON.parse(r.bag).length; } catch(e){}
            
            let mapData = '[0,0,0]';
            try { mapData = JSON.parse(r.map); } catch(e){}
            
            return {
                id: r.id,
                name: r.name,
                username: r.username,
                xu: r.xu,
                yen: r.yen,
                level: r.level || 0,
                class: r.class || 0,
                bagCount,
                mapData,
                online: r.online
            }
        });
        res.json({ data: players, total: countResult[0].total });
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

// Thêm vật phẩm vào túi đồ nhân vật bằng ID (Tự động đúc chỉ số qua Giftcode)
app.post('/api/players/add-item', checkAuth, async (req, res) => {
    const { id, itemId, quantity, isLock, upgrade } = req.body;
    try {
        const [rows] = await pool.query('SELECT p.id, u.online, p.giftcode_unpaid FROM players p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        if (rows[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi nhận quà.' });
        
        // Tạo giftcode tạm thời
        const code = 'GIFT_' + Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString().slice(-4);
        
        const newItem = {
            id: parseInt(itemId),
            quantity: parseInt(quantity) || 1,
            isLock: isLock ? true : false,
            upgrade: parseInt(upgrade) || 0,
            sys: 0,
            options: []
        };
        const itemsStr = JSON.stringify([newItem]);
        
        // Insert giftcode (dùng 1 lần)
        await pool.query('INSERT INTO gift_codes (code, gold, coin, yen, items, is_limited, limit_count) VALUES (?, 0, 0, 0, ?, 1, 1)', 
            [code, itemsStr]);
        
        // Gắn vào giftcode_unpaid của nhân vật
        await pool.query('UPDATE players SET giftcode_unpaid = ? WHERE id = ?', [code, id]);
        
        res.json({ success: true, message: 'Đã buff Item thành công! (Vào game để tự động nhận)' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm vật phẩm vào túi bằng Tên Nhân Vật (Dành cho tab Từ Điển)
app.post('/api/players/gift-item-by-name', checkAuth, async (req, res) => {
    const { playerName, itemId, quantity, isLock, upgrade } = req.body;
    try {
        const [players] = await pool.query('SELECT p.id, u.online FROM players p JOIN users u ON p.user_id = u.id WHERE p.name = ?', [playerName]);
        if (players.length === 0) return res.status(404).json({ error: 'Không tìm thấy tên nhân vật này' });
        if (players[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi nhận quà.' });
        
        const player = players[0];
        
        // Tạo giftcode tạm thời
        const code = 'GIFT_' + Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString().slice(-4);
        
        const newItem = {
            id: parseInt(itemId),
            quantity: parseInt(quantity) || 1,
            isLock: isLock ? true : false,
            upgrade: parseInt(upgrade) || 0,
            sys: 0,
            options: []
        };
        const itemsStr = JSON.stringify([newItem]);
        
        // Insert giftcode (dùng 1 lần)
        await pool.query('INSERT INTO gift_codes (code, gold, coin, yen, items, is_limited, limit_count) VALUES (?, 0, 0, 0, ?, 1, 1)', 
            [code, itemsStr]);
        
        // Gắn vào giftcode_unpaid của nhân vật
        await pool.query('UPDATE players SET giftcode_unpaid = ? WHERE id = ?', [code, player.id]);
        
        res.json({ success: true, message: `Đã tặng Item thành công cho ${playerName}! (Vào game để tự động nhận)` });
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

// ================= MAP DICTIONARY API =================
app.get('/api/maps', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM map');
        res.json(rows);
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

// ===== SYSTEM CONFIG & DOCKER RESTART =====
const CONFIG_PATH = path.join(__dirname, 'config.properties');

app.get('/api/config', checkAuth, async (req, res) => {
    try {
        const content = await fs.readFile(CONFIG_PATH, 'utf-8');
        res.json({ success: true, data: content });
    } catch (err) {
        res.status(500).json({ error: 'Không thể đọc file config: ' + err.message });
    }
});

app.post('/api/config', checkAuth, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Nội dung rỗng' });
    
    try {
        await fs.writeFile(CONFIG_PATH, content, 'utf-8');
        
        // Gọi Docker API qua Unix Socket để restart game-server
        const options = {
            socketPath: '/var/run/docker.sock',
            path: '/containers/nsokiss_game_server/restart?t=5', // timeout 5s
            method: 'POST'
        };
        
        const dockerReq = http.request(options, (dockerRes) => {
            if (dockerRes.statusCode === 204) {
                res.json({ success: true, message: 'Đã lưu cấu hình & Khởi động lại Server thành công!' });
            } else {
                let body = '';
                dockerRes.on('data', chunk => body += chunk);
                dockerRes.on('end', () => {
                    res.status(500).json({ error: `Lỗi restart server (Status ${dockerRes.statusCode}): ${body}` });
                });
            }
        });
        
        dockerReq.on('error', (e) => {
            res.status(500).json({ error: 'Lưu config thành công nhưng lỗi kết nối Docker: ' + e.message });
        });
        
        dockerReq.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log('Web Admin API Server running on port 3000');
});
