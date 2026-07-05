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
    const { id, status } = req.body; // status 1 là khoá, 0 là bình thường (tuỳ server)
    try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: 'Đã đổi trạng thái thành công!' });
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
    const { id, itemId, quantity, isLock } = req.body;
    try {
        // Lấy túi đồ hiện tại
        const [rows] = await pool.query('SELECT bag FROM players WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        
        let bag = [];
        try {
            bag = JSON.parse(rows[0].bag);
        } catch (e) {
            bag = [];
        }

        // Cấu trúc một Item cơ bản trong NSO
        const newItem = {
            id: parseInt(itemId),
            quantity: parseInt(quantity) || 1,
            isLock: isLock ? true : false,
            upgrade: 0,
            sys: 0,
            options: [] // Chưa hỗ trợ buff chỉ số cụ thể qua form nhanh
        };
        
        // Thêm vào túi (Lưu ý: Không kiểm tra số ô trống túi đồ, admin tự chịu trách nhiệm)
        bag.push(newItem);
        
        // Lưu lại DB
        await pool.query('UPDATE players SET bag = ? WHERE id = ?', [JSON.stringify(bag), id]);
        res.json({ success: true, message: 'Đã buff Item vào túi thành công! Vui lòng vào game kiểm tra (nhân vật phải đang Offline trước khi buff).' });
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

app.listen(3000, () => {
    console.log('Web Admin API Server running on port 3000');
});
