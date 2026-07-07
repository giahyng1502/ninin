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

// Cộng điểm nhân vật
app.post('/api/players/add-points', checkAuth, async (req, res) => {
    const { id, point, spoint } = req.body;
    try {
        const [playerRows] = await pool.query('SELECT point, spoint FROM players WHERE id = ?', [id]);
        if (playerRows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        
        let newPoint = Math.min(32767, (playerRows[0].point || 0) + (parseInt(point) || 0));
        let newSpoint = Math.min(32767, (playerRows[0].spoint || 0) + (parseInt(spoint) || 0));
        
        await pool.query('UPDATE players SET point = ?, spoint = ? WHERE id = ?', [newPoint, newSpoint, id]);
        res.json({ success: true, message: 'Cộng điểm thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Chỉnh sửa nhiệm vụ
app.post('/api/players/set-task', checkAuth, async (req, res) => {
    const { id, taskId, taskIndex, taskCount } = req.body;
    try {
        const tid = parseInt(taskId) || 1;
        const idx = parseInt(taskIndex) || 0;
        const cnt = parseInt(taskCount) || 0;
        const taskStr = JSON.stringify({ id: tid, index: idx, count: cnt });
        
        await pool.query('UPDATE players SET taskId = ?, task = ? WHERE id = ?', [tid, taskStr, id]);
        res.json({ success: true, message: 'Cập nhật nhiệm vụ thành công! (Vui lòng đăng nhập lại game để có hiệu lực)' });
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
            ? 'SELECT p.id, p.name, p.xu, p.yen, p.bag, p.map, p.class, p.taskId, p.task, u.username, u.online, JSON_EXTRACT(p.data, "$.level") as level FROM players p JOIN users u ON p.user_id = u.id WHERE p.name LIKE ? ORDER BY p.id DESC LIMIT ? OFFSET ?'
            : 'SELECT p.id, p.name, p.xu, p.yen, p.bag, p.map, p.class, p.taskId, p.task, u.username, u.online, JSON_EXTRACT(p.data, "$.level") as level FROM players p JOIN users u ON p.user_id = u.id ORDER BY p.id DESC LIMIT ? OFFSET ?';
        
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
                taskId: r.taskId || 0,
                taskStr: r.task || '[]',
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

// Cộng thêm Level / Exp cho nhân vật
app.post('/api/players/add-exp-level', checkAuth, async (req, res) => {
    const { id, level, exp } = req.body;
    try {
        const addLevel = parseInt(level) || 0;
        const addExp = parseInt(exp) || 0;
        
        await pool.query(`
            UPDATE players 
            SET data = JSON_SET(
                data, 
                '$.level', IFNULL(JSON_EXTRACT(data, '$.level'), 0) + ?,
                '$.exp', IFNULL(JSON_EXTRACT(data, '$.exp'), 0) + ?
            ) 
            WHERE id = ?`, 
        [addLevel, addExp, id]);
        res.json({ success: true, message: 'Đã buff Level / Exp thành công! (Cần thoát game ra vào lại để cập nhật)' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cập nhật nhiệm vụ cho nhân vật
app.post('/api/players/update-task', checkAuth, async (req, res) => {
    const { id, taskId, taskStr } = req.body;
    try {
        const tId = parseInt(taskId) || 0;
        const tStr = typeof taskStr === 'string' && taskStr.trim() !== '' ? taskStr : '[]';
        
        await pool.query('UPDATE players SET taskId = ?, task = ? WHERE id = ?', [tId, tStr, id]);
        res.json({ success: true, message: 'Đã cập nhật Nhiệm vụ thành công! (Cần thoát game ra vào lại để cập nhật)' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nâng max điểm danh vọng cho nhân vật
app.post('/api/players/add-honor-points', checkAuth, async (req, res) => {
    const { id, point } = req.body;
    try {
        const p = parseInt(point) || 0;
        if (p < 0) return res.status(400).json({ error: 'Điểm không hợp lệ' });
        
        const [rows] = await pool.query('SELECT u.online AS online FROM players p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        if (rows[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi thực hiện.' });

        await pool.query(`
            UPDATE players 
            SET data = JSON_SET(
                data, 
                '$.pointAo', ?,
                '$.pointVuKhi', ?,
                '$.pointNon', ?,
                '$.pointLien', ?,
                '$.pointGangTay', ?,
                '$.pointNhan', ?,
                '$.pointQuan', ?,
                '$.pointNgocBoi', ?,
                '$.pointGiay', ?,
                '$.pointPhu', ?
            ) 
            WHERE id = ?`, 
        [p, p, p, p, p, p, p, p, p, p, id]);
        
        res.json({ success: true, message: `Đã cộng ${p} điểm danh vọng mỗi loại thành công!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm vật phẩm vào túi đồ nhân vật bằng ID (Tự động đúc chỉ số qua Giftcode)
app.post('/api/players/add-item', checkAuth, async (req, res) => {
    const { id, itemId, quantity, isLock, upgrade, sys } = req.body;
    try {
        const [rows] = await pool.query('SELECT p.id, u.online, p.giftcode_unpaid FROM players p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        if (rows[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi nhận quà.' });
        
        const [itemData] = await pool.query('SELECT isUpToUp FROM item WHERE id = ?', [itemId]);
        const isUpToUp = itemData.length > 0 ? itemData[0].isUpToUp : 0;
        const q = parseInt(quantity) || 1;

        if (isUpToUp === 1) {
            const newItem = {
                id: parseInt(itemId),
                quantity: q,
                isLock: isLock ? true : false,
                upgrade: parseInt(upgrade) || 0,
                sys: parseInt(sys) || 0,
                expire: -1,
                yen: 0,
                options: []
            };
            const itemStr = JSON.stringify(newItem);
            await pool.query("UPDATE players SET bag = JSON_ARRAY_APPEND(IFNULL(bag, '[]'), '$', JSON_EXTRACT(?, '$')) WHERE id = ?", [itemStr, id]);
        } else {
            const newItem = {
                id: parseInt(itemId),
                quantity: 1,
                isLock: isLock ? true : false,
                upgrade: parseInt(upgrade) || 0,
                sys: parseInt(sys) || 0,
                expire: -1,
                yen: 0,
                options: []
            };
            const itemStr = JSON.stringify(newItem);
            let queryStr = "UPDATE players SET bag = JSON_ARRAY_APPEND(IFNULL(bag, '[]')";
            let params = [];
            for (let i = 0; i < q; i++) {
                queryStr += ", '$', JSON_EXTRACT(?, '$')";
                params.push(itemStr);
            }
            queryStr += ") WHERE id = ?";
            params.push(id);
            await pool.query(queryStr, params);
        }
        
        res.json({ success: true, message: 'Đã thêm vật phẩm trực tiếp vào túi thành công! (Vào game để kiểm tra)' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm vật phẩm vào túi bằng Tên Nhân Vật (Dành cho tab Từ Điển)
app.post('/api/players/gift-item-by-name', checkAuth, async (req, res) => {
    const { playerName, itemId, quantity, isLock, upgrade, sys } = req.body;
    try {
        const [players] = await pool.query('SELECT p.id, u.online FROM players p JOIN users u ON p.user_id = u.id WHERE p.name = ?', [playerName]);
        if (players.length === 0) return res.status(404).json({ error: 'Không tìm thấy tên nhân vật này' });
        if (players[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi nhận quà.' });
        
        const player = players[0];
        
        const [itemData] = await pool.query('SELECT isUpToUp FROM item WHERE id = ?', [itemId]);
        const isUpToUp = itemData.length > 0 ? itemData[0].isUpToUp : 0;
        const q = parseInt(quantity) || 1;

        if (isUpToUp === 1) {
            const newItem = {
                id: parseInt(itemId),
                quantity: q,
                isLock: isLock ? true : false,
                upgrade: parseInt(upgrade) || 0,
                sys: parseInt(sys) || 0,
                expire: -1,
                yen: 0,
                options: []
            };
            const itemStr = JSON.stringify(newItem);
            await pool.query("UPDATE players SET bag = JSON_ARRAY_APPEND(IFNULL(bag, '[]'), '$', JSON_EXTRACT(?, '$')) WHERE id = ?", [itemStr, player.id]);
        } else {
            const newItem = {
                id: parseInt(itemId),
                quantity: 1,
                isLock: isLock ? true : false,
                upgrade: parseInt(upgrade) || 0,
                sys: parseInt(sys) || 0,
                expire: -1,
                yen: 0,
                options: []
            };
            const itemStr = JSON.stringify(newItem);
            let queryStr = "UPDATE players SET bag = JSON_ARRAY_APPEND(IFNULL(bag, '[]')";
            let params = [];
            for (let i = 0; i < q; i++) {
                queryStr += ", '$', JSON_EXTRACT(?, '$')";
                params.push(itemStr);
            }
            queryStr += ") WHERE id = ?";
            params.push(player.id);
            await pool.query(queryStr, params);
        }
        
        res.json({ success: true, message: `Đã thêm Item trực tiếp vào túi của ${playerName}! (Vào game để kiểm tra)` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xoá hành trang nhân vật
app.post('/api/players/clear-bag', checkAuth, async (req, res) => {
    const { id } = req.body;
    try {
        const [rows] = await pool.query('SELECT u.online AS online FROM players p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        if (rows[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi thực hiện.' });
        
        await pool.query('UPDATE players SET bag = "[]" WHERE id = ?', [id]);
        res.json({ success: true, message: 'Đã xoá sạch hành trang thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Chỉnh số ô hành trang
app.post('/api/players/set-bag-size', checkAuth, async (req, res) => {
    const { id, size } = req.body;
    try {
        const newSize = parseInt(size);
        if (isNaN(newSize) || newSize < 30 || newSize > 255) {
            return res.status(400).json({ error: 'Số ô không hợp lệ (từ 30 đến 255)' });
        }
        const [rows] = await pool.query('SELECT u.online AS online FROM players p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        if (rows[0].online === 1) return res.status(400).json({ error: 'Nhân vật đang Online! Vui lòng đăng xuất trước khi thực hiện.' });
        
        await pool.query('UPDATE players SET numberCellBag = ? WHERE id = ?', [newSize, id]);
        res.json({ success: true, message: `Đã cập nhật số ô hành trang thành ${newSize}!` });
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
    const { search = '', category = '', page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    try {
        let query = 'SELECT id, name, description, level, type FROM item WHERE name LIKE ?';
        let countQuery = 'SELECT COUNT(*) as count FROM item WHERE name LIKE ?';
        let params = [`%${search}%`];
        
        if (category) {
            let typeCondition = '';
            if (category === 'weapon') typeCondition = 'type IN (4, 5, 6, 7, 8, 9, 10)';
            else if (category === 'equipment') typeCondition = 'type IN (0, 1, 2, 3, 11, 12, 14, 15, 16, 21, 23, 24, 25, 27)';
            else if (category === 'mount') typeCondition = 'type IN (29, 33, 34)';
            else if (category === 'material') typeCondition = 'type IN (13, 17, 18, 19, 20)';
            else if (category === 'other') typeCondition = 'type NOT IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 21, 23, 24, 25, 27, 29, 33, 34, 13, 17, 18, 19, 20)';
            
            if (typeCondition) {
                query += ` AND ${typeCondition}`;
                countQuery += ` AND ${typeCondition}`;
            }
        }
        
        query += ' ORDER BY id ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const [rows] = await pool.query(query, params);
        const [total] = await pool.query(countQuery, [`%${search}%`]);
        res.json({ data: rows, total: total[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lấy từ điển Item (id -> name)
app.get('/api/items/dict', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM item');
        const dict = {};
        rows.forEach(r => dict[r.id] = r.name);
        res.json(dict);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= CLANS API =================

// Lấy danh sách gia tộc
app.get('/api/clans', checkAuth, async (req, res) => {
    const search = req.query.q || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        const query = search 
            ? 'SELECT * FROM clan WHERE name LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
            : 'SELECT * FROM clan ORDER BY id DESC LIMIT ? OFFSET ?';
        const countQuery = search ? 'SELECT COUNT(*) as total FROM clan WHERE name LIKE ?' : 'SELECT COUNT(*) as total FROM clan';
        const params = search ? [`%${search}%`, limit, offset] : [limit, offset];
        const countParams = search ? [`%${search}%`] : [];
        
        const [rows] = await pool.query(query, params);
        const [countResult] = await pool.query(countQuery, countParams);
        
        res.json({ data: rows, total: countResult[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tạo mới gia tộc
app.post('/api/clans/create', checkAuth, async (req, res) => {
    const { name, main_name } = req.body;
    if (!name || !main_name) return res.status(400).json({ error: 'Tên gia tộc và Tên tộc trưởng không được để trống' });
    try {
        const [existing] = await pool.query('SELECT id FROM clan WHERE name = ?', [name]);
        if (existing.length > 0) return res.status(400).json({ error: 'Tên gia tộc đã tồn tại' });
        
        const [player] = await pool.query('SELECT id, class FROM players WHERE name = ?', [main_name]);
        if (player.length === 0) return res.status(404).json({ error: 'Không tìm thấy người chơi này để làm tộc trưởng' });

        const [insertResult] = await pool.query(
            'INSERT INTO clan (name, main_name, alert, coin, level, exp, item_level, open_dun, use_card) VALUES (?, ?, "", 0, 1, 0, 0, 1, 1)',
            [name, main_name]
        );
        
        const clanId = insertResult.insertId;
        
        await pool.query(
            'INSERT INTO clan_member (name, class_id, level, clan, point_clan, point_clan_week, type) VALUES (?, ?, 1, ?, 0, 0, 2)',
            [main_name, player[0].class, clanId]
        );
        
        // Update players clan
        await pool.query('UPDATE players SET clan = ? WHERE name = ?', [clanId, main_name]);
        
        res.json({ success: true, message: 'Tạo Gia Tộc thành công! Lưu ý: Game Server cần khởi động lại để tải Gia tộc mới.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cập nhật gia tộc (Đổi trưởng/phó tộc, level, tên gia tộc)
app.post('/api/clans/update', checkAuth, async (req, res) => {
    const { id, level, main_name, assist_name, name } = req.body;
    try {
        const lv = parseInt(level) || 1;
        
        // Kiểm tra xem tên gia tộc mới có bị trùng không
        if (name) {
            const [existing] = await pool.query('SELECT id FROM clan WHERE name = ? AND id != ?', [name, id]);
            if (existing.length > 0) return res.status(400).json({ error: 'Tên gia tộc này đã được sử dụng' });
        }
        
        // Ensure members exist before assigning roles
        if (main_name) {
            const [p1] = await pool.query('SELECT id, class FROM players WHERE name = ?', [main_name]);
            if (p1.length === 0) return res.status(404).json({ error: `Không tìm thấy nhân vật ${main_name}` });
            
            // Upsert clan_member for main_name (Tộc Trưởng type 2)
            const [m1] = await pool.query('SELECT id FROM clan_member WHERE name = ? AND clan = ?', [main_name, id]);
            if (m1.length > 0) {
                await pool.query('UPDATE clan_member SET type = 2 WHERE name = ? AND clan = ?', [main_name, id]);
            } else {
                await pool.query('INSERT INTO clan_member (name, class_id, level, clan, point_clan, point_clan_week, type) VALUES (?, ?, 1, ?, 0, 0, 2)', [main_name, p1[0].class, id]);
                await pool.query('UPDATE players SET clan = ? WHERE name = ?', [id, main_name]);
            }
        }
        
        if (assist_name) {
            const [p2] = await pool.query('SELECT id, class FROM players WHERE name = ?', [assist_name]);
            if (p2.length === 0) return res.status(404).json({ error: `Không tìm thấy nhân vật ${assist_name}` });
            
            // Upsert clan_member for assist_name (Phó tộc type 1)
            const [m2] = await pool.query('SELECT id FROM clan_member WHERE name = ? AND clan = ?', [assist_name, id]);
            if (m2.length > 0) {
                await pool.query('UPDATE clan_member SET type = 1 WHERE name = ? AND clan = ?', [assist_name, id]);
            } else {
                await pool.query('INSERT INTO clan_member (name, class_id, level, clan, point_clan, point_clan_week, type) VALUES (?, ?, 1, ?, 0, 0, 1)', [assist_name, p2[0].class, id]);
                await pool.query('UPDATE players SET clan = ? WHERE name = ?', [id, assist_name]);
            }
        }
        
        if (name) {
            await pool.query('UPDATE clan SET level = ?, main_name = ?, assist_name = ?, name = ? WHERE id = ?', [lv, main_name, assist_name, name, id]);
        } else {
            await pool.query('UPDATE clan SET level = ?, main_name = ?, assist_name = ? WHERE id = ?', [lv, main_name, assist_name, id]);
        }
        
        res.json({ success: true, message: 'Cập nhật thông tin Gia Tộc thành công! Lưu ý: Server cần khởi động lại để cập nhật.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm thành viên vào gia tộc
app.post('/api/clans/add-member', checkAuth, async (req, res) => {
    const { id, member_name } = req.body;
    try {
        const [player] = await pool.query('SELECT id, class, clan FROM players WHERE name = ?', [member_name]);
        if (player.length === 0) return res.status(404).json({ error: `Không tìm thấy nhân vật ${member_name}` });
        if (player[0].clan !== -1 && player[0].clan !== 0) return res.status(400).json({ error: `Nhân vật ${member_name} đã nằm trong một gia tộc khác` });

        // Type 0 is normal member
        await pool.query('INSERT INTO clan_member (name, class_id, level, clan, point_clan, point_clan_week, type) VALUES (?, ?, 1, ?, 0, 0, 0)', [member_name, player[0].class, id]);
        await pool.query('UPDATE players SET clan = ? WHERE name = ?', [id, member_name]);
        
        res.json({ success: true, message: `Thêm ${member_name} vào Gia Tộc thành công!` });
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
            'INSERT INTO gift_codes (code, server_id, coin, gold, yen, items, type, status, created_at) VALUES (?, 0, ?, ?, ?, ?, ?, 0, NOW())',
            [code, parseInt(coin) || 0, parseInt(gold) || 0, parseInt(yen) || 0, itemsJson, parseInt(type) || 0]
        );
        res.json({ success: true, message: 'Tạo Giftcode thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sửa Giftcode
app.put('/api/giftcodes/:id', checkAuth, async (req, res) => {
    const { id } = req.params;
    const { code, coin, gold, yen, items, type } = req.body;
    if (!code) return res.status(400).json({ error: 'Mã Giftcode không được để trống' });
    try {
        const [existing] = await pool.query('SELECT id FROM gift_codes WHERE code = ? AND id != ?', [code, id]);
        if (existing.length > 0) return res.status(400).json({ error: 'Mã Giftcode đã tồn tại ở mục khác' });

        const itemsJson = items ? JSON.stringify(items) : '[]';
        await pool.query(
            'UPDATE gift_codes SET code=?, coin=?, gold=?, yen=?, items=?, type=?, updated_at=NOW() WHERE id=?',
            [code, parseInt(coin) || 0, parseInt(gold) || 0, parseInt(yen) || 0, itemsJson, parseInt(type) || 0, id]
        );
        res.json({ success: true, message: 'Cập nhật Giftcode thành công!' });
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
