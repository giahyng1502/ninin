        const API_BASE = '/api'; // Caddy proxy sẽ chuyển /api vào web-admin:3000
        let currentToken = localStorage.getItem('nso_admin_token') || '';
        let itemPage = 1;
        let playerPage = 1;
        let mapDict = {};

        // Load Maps on init
        async function loadMaps() {
            try {
                const res = await apiCall('/maps');
                res.forEach(m => mapDict[m.id] = m.name);
            } catch(e) {}
        }
        loadMaps();

        // Init
        if (currentToken) {
            document.getElementById('authOverlay').style.display = 'none';
            loadStats();
        }

        function login() {
            const tk = document.getElementById('adminPassword').value;
            if(!tk) return;
            currentToken = tk;
            localStorage.setItem('nso_admin_token', tk);
            document.getElementById('authOverlay').style.display = 'none';
            loadStats();
        }

        function logout() {
            localStorage.removeItem('nso_admin_token');
            currentToken = '';
            document.getElementById('authOverlay').style.display = 'flex';
        }

        // Fetch wrapper
        async function apiCall(endpoint, method = 'GET', body = null) {
            const headers = { 'Authorization': `Bearer ${currentToken}` };
            if(body) headers['Content-Type'] = 'application/json';
            const opts = { method, headers };
            if(body) opts.body = JSON.stringify(body);
            
            try {
                const res = await fetch(`${API_BASE}${endpoint}`, opts);
                const data = await res.json();
                if(res.status === 401) { logout(); throw new Error("Sai mật khẩu Admin!"); }
                if(!res.ok) throw new Error(data.error || 'Lỗi server');
                return data;
            } catch (err) {
                showToast('Lỗi', err.message, 'red');
                throw err;
            }
        }

        // Navigation
        function showSection(id) {
            document.querySelectorAll('.section-content').forEach(el => el.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            
            // Update active nav button styles
            document.querySelectorAll('.nav-btn').forEach(el => {
                el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-500/20');
                el.classList.add('text-gray-400');
            });
            const activeBtn = document.getElementById(`nav-${id}`);
            activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-500/20');
            activeBtn.classList.remove('text-gray-400');

            const titles = { dashboard: 'Bảng Điều Khiển', users: 'Quản lý Tài Khoản', players: 'Quản lý Nhân Vật', items: 'Từ Điển ID Vật Phẩm', giftcodes: 'Quản Lý Giftcode', settings: 'Cài Đặt Hệ Thống' };
            document.getElementById('pageTitle').innerText = titles[id];

            if(id === 'users') loadUsers();
            if(id === 'dashboard') loadStats();
            if(id === 'players') loadPlayers();
            if(id === 'items') searchItems();
            if(id === 'giftcodes') loadGiftcodes();
            if(id === 'settings') loadConfig();
        }

        // Stats
        async function loadStats() {
            try {
                const data = await apiCall('/stats');
                document.getElementById('stat-users').innerText = data.users;
                document.getElementById('stat-players').innerText = data.players;
                document.getElementById('stat-online').innerText = data.online;
            } catch(e) {}
        }

        // Users
        async function loadUsers() {
            const tbody = document.getElementById('usersTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">Đang tải...</td></tr>';
            try {
                const users = await apiCall('/users');
                tbody.innerHTML = '';
                users.forEach(u => {
                    const statusBadge = u.status === 1 ? '<span class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs border border-red-500/30">Bị Khoá</span>' : '<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs border border-green-500/30">Bình thường</span>';
                    tbody.innerHTML += `
                        <tr class="hover:bg-dark-700/50 transition-colors">
                            <td class="p-4">${u.id}</td>
                            <td class="p-4 font-bold text-blue-400">${u.username}</td>
                            <td class="p-4 text-yellow-400 font-semibold">${u.luong.toLocaleString()}</td>
                            <td class="p-4 text-gray-300 font-semibold">${u.coin.toLocaleString()}</td>
                            <td class="p-4">${statusBadge}</td>
                            <td class="p-4 text-right space-x-2">
                                <button onclick="unstuckUser(${u.id})" class="text-yellow-400 hover:text-yellow-300 p-2 text-sm bg-yellow-500/10 rounded border border-yellow-500/20" title="Kích kẹt tài khoản"><i class="fas fa-bolt"></i></button>
                                <button onclick="openBuffMoneyModal(${u.id}, '${u.username}')" class="text-blue-400 hover:text-blue-300 p-2 text-sm bg-blue-500/10 rounded border border-blue-500/20"><i class="fas fa-coins"></i> Buff</button>
                            </td>
                        </tr>
                    `;
                });
            } catch(e) {}
        }

        // Players
        async function loadPlayers() {
            const search = document.getElementById('searchPlayer').value;
            const tbody = document.getElementById('playersTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
            try {
                const res = await apiCall(`/players?q=${encodeURIComponent(search)}&page=${playerPage}`);
                const players = res.data;
                const total = res.total;
                
                if (players.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Không tìm thấy nhân vật nào</td></tr>';
                    document.getElementById('playerPaginationInfo').innerText = `Không có dữ liệu`;
                    return;
                }
                
                window.playersList = players; // Save globally for modals
                
                tbody.innerHTML = '';
                players.forEach(p => {
                    let mapId = p.mapData && p.mapData[0] !== undefined ? p.mapData[0] : -1;
                    let mapName = mapDict[mapId] ? mapDict[mapId] : `Map ${mapId}`;
                    
                    tbody.innerHTML += `
                        <tr class="hover:bg-dark-700/50 transition-colors">
                            <td class="p-4">${p.id}</td>
                            <td class="p-4 font-bold text-purple-400">${p.name} <br><span class="text-xs text-gray-500 font-normal">(Túi: ${p.bagCount} món)</span></td>
                            <td class="p-4 text-gray-400">${p.username}</td>
                            <td class="p-4">
                                <div class="text-yellow-400 font-semibold text-sm">Xu: ${p.xu.toLocaleString()}</div>
                                <div class="text-gray-300 font-semibold text-sm">Yên: ${p.yen.toLocaleString()}</div>
                            </td>
                            <td class="p-4">
                                <div class="font-bold">Lv.${p.level} <span class="text-xs font-normal text-gray-400">(Phái: ${p.class})</span></div>
                                <div class="text-xs text-green-400 mt-1"><i class="fas fa-map-marker-alt mr-1"></i> ${mapName}</div>
                            </td>
                            <td class="p-4 text-right whitespace-nowrap">
                                <button onclick="openTaskModalSafe(${p.id})" class="bg-pink-900/40 hover:bg-pink-900/80 text-pink-400 px-3 py-2 rounded transition-colors mr-2" title="Sửa Nhiệm Vụ"><i class="fas fa-flag"></i></button>
                                <button onclick="openPlayerModal(${p.id}, '${p.name}')" class="bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 border border-purple-500/30 px-3 py-1 rounded transition-colors"><i class="fas fa-magic mr-1"></i> Quản Lý</button>
                            </td>
                        </tr>
                    `;
                });
                
                document.getElementById('playerPaginationInfo').innerText = `Trang ${playerPage} (Tổng: ${total} NV)`;
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-red-500">Lỗi khi tải dữ liệu</td></tr>';
            }
        }
        
        function changePlayerPage(delta) {
            if (playerPage + delta < 1) return;
            playerPage += delta;
            loadPlayers();
        }

        // Task & Modals
        function openTaskModalSafe(id) {
            const p = window.playersList.find(player => player.id === id);
            if(p) {
                document.getElementById('taskPlayerName').textContent = p.name;
                document.getElementById('taskIdPlayer').value = p.id;
                document.getElementById('taskIdVal').value = p.taskId || 0;
                let index = 0;
                try {
                    if (p.taskStr && p.taskStr !== 'null') {
                        const taskObj = JSON.parse(p.taskStr);
                        index = taskObj.index || 0;
                    }
                } catch(e) {}
                document.getElementById('taskIndexVal').value = index;
                openModal('modalTask');
            }
        }

        function openTaskModal(name, id, taskId, taskStr) {
            document.getElementById('taskPlayerName').textContent = name;
            document.getElementById('taskIdPlayer').value = id;
            document.getElementById('taskIdVal').value = taskId;
            let index = 0;
            try {
                if (taskStr && taskStr !== 'null') {
                    const taskObj = JSON.parse(taskStr);
                    index = taskObj.index || 0;
                }
            } catch(e) {}
            document.getElementById('taskIndexVal').value = index;
            openModal('modalTask');
        }

        async function submitTask(e) {
            e.preventDefault();
            const id = document.getElementById('taskIdPlayer').value;
            const taskId = document.getElementById('taskIdVal').value;
            const taskIndex = document.getElementById('taskIndexVal').value;
            
            // Build task string for the new update-task API
            const taskStr = JSON.stringify({
                id: parseInt(taskId) || 0,
                index: parseInt(taskIndex) || 0,
                count: 0
            });

            try {
                const res = await apiCall('/players/update-task', 'POST', { id, taskId, taskStr });
                showToast('Thành công', res.message || 'Đã cập nhật nhiệm vụ');
                closeModal('modalTask');
                loadPlayers();
            } catch(err) {
                showToast('Lỗi', err.message, 'red');
            }
        }

        function openBuffMoneyModal(id, username) {
            document.getElementById('buffUserId').value = id;
            document.getElementById('buffUserLabel').innerText = username;
            document.getElementById('buffLuong').value = 0;
            document.getElementById('buffCoin').value = 0;
            const modal = document.getElementById('modalUserMoney');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                document.getElementById('modalUserMoneyContent').classList.remove('scale-95');
            }, 10);
        }

        function openPlayerModal(id, name) {
            document.getElementById('buffPlayerId').value = id;
            document.getElementById('buffPlayerNameLabel').innerText = name;
            document.getElementById('buffXu').value = 0;
            document.getElementById('buffYen').value = 0;
            document.getElementById('buffItemId').value = '';
            document.getElementById('buffItemQty').value = 1;
            document.getElementById('buffLevel').value = 0;
            document.getElementById('buffExp').value = 0;
            switchPlayerTab('money');
            const modal = document.getElementById('modalPlayer');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                document.getElementById('modalPlayerContent').classList.remove('scale-95');
            }, 10);
        }

        function openCreateUserModal() {
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            const modal = document.getElementById('modalCreateUser');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                document.getElementById('modalCreateUserContent').classList.remove('scale-95');
            }, 10);
        }

        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                const content = document.getElementById(modalId + 'Content') || modal.querySelector('div');
                if(content) content.classList.remove('scale-95');
            }, 10);
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            const content = document.getElementById(modalId + 'Content') || modal.querySelector('div');
            modal.classList.add('opacity-0');
            if(content) content.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }

        function switchPlayerTab(tab) {
            const tabs = ['money', 'item', 'explevel', 'bag'];
            tabs.forEach(t => {
                if (t === tab) {
                    document.getElementById(`tab-${t}`).classList.remove('hidden');
                    document.getElementById(`tab-btn-${t}`).className = 'flex-1 py-3 font-semibold border-b-2 border-purple-500 text-purple-400 transition-colors';
                } else {
                    document.getElementById(`tab-${t}`).classList.add('hidden');
                    document.getElementById(`tab-btn-${t}`).className = 'flex-1 py-3 font-semibold border-b-2 border-transparent text-gray-400 hover:text-white transition-colors';
                }
            });
        }

        // Submits
        async function submitUserMoney() {
            const id = document.getElementById('buffUserId').value;
            const luong = parseInt(document.getElementById('buffLuong').value) || 0;
            const coin = parseInt(document.getElementById('buffCoin').value) || 0;
            try {
                const data = await apiCall('/users/add-money', 'POST', { id, luong, coin });
                showToast('Thành công', data.message);
                closeModal('modalUserMoney');
                loadUsers();
            } catch(e) {}
        }

        async function submitPlayerMoney() {
            const id = document.getElementById('buffPlayerId').value;
            const xu = parseInt(document.getElementById('buffXu').value) || 0;
            const yen = parseInt(document.getElementById('buffYen').value) || 0;
            try {
                const data = await apiCall('/players/add-money', 'POST', { id, xu, yen });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        async function submitPlayerExpLevel() {
            const id = document.getElementById('buffPlayerId').value;
            const level = parseInt(document.getElementById('buffLevel').value) || 0;
            const exp = parseInt(document.getElementById('buffExp').value) || 0;
            try {
                const data = await apiCall('/players/add-exp-level', 'POST', { id, level, exp });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        async function submitCreateUser() {
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            try {
                const data = await apiCall('/users/create', 'POST', { username, password });
                showToast('Thành công', data.message);
                closeModal('modalCreateUser');
                loadUsers();
            } catch(e) {}
        }

        async function submitPlayerItem() {
            const id = document.getElementById('buffPlayerId').value;
            const itemId = document.getElementById('buffItemId').value;
            const qty = parseInt(document.getElementById('buffItemQty').value) || 1;
            const upgrade = parseInt(document.getElementById('buffItemUpgrade').value) || 0;
            const isLock = document.getElementById('buffItemLock').checked;
            
            if(!itemId) {
                showToast('Lỗi', 'Vui lòng nhập ID vật phẩm', 'red');
                return;
            }
            try {
                const data = await apiCall('/players/add-item', 'POST', { id, itemId, quantity: qty, isLock, upgrade });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        async function submitClearBag() {
            if(!confirm('Bạn có chắc chắn muốn xoá sạch hành trang của nhân vật này không? Hành động này không thể hoàn tác!')) return;
            const id = document.getElementById('buffPlayerId').value;
            try {
                const data = await apiCall('/players/clear-bag', 'POST', { id });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        async function submitSetBagSize() {
            const id = document.getElementById('buffPlayerId').value;
            const size = document.getElementById('buffBagSize').value;
            try {
                const data = await apiCall('/players/set-bag-size', 'POST', { id, size });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        async function submitPlayerPoints() {
            const id = document.getElementById('buffPlayerId').value;
            const point = document.getElementById('buffPlayerPoint').value || 0;
            const spoint = document.getElementById('buffPlayerSPoint').value || 0;
            if(point == 0 && spoint == 0) return showToast('Lỗi', 'Nhập ít nhất 1 loại điểm để cộng', 'red');
            try {
                const data = await apiCall('/players/add-points', 'POST', { id, point, spoint });
                showToast('Thành công', data.message);
                closeModal('modalPlayer');
                loadPlayers();
            } catch(e) {}
        }

        function showToast(title, msg, color = 'green') {
            const toast = document.getElementById('toast');
            document.getElementById('toastTitle').innerText = title;
            document.getElementById('toastMsg').innerText = msg;
            
            toast.className = `toast fixed bottom-6 right-6 glass-panel border-l-4 border-${color}-500 p-4 rounded-xl shadow-2xl flex items-center z-50`;
            toast.children[0].className = `bg-${color}-500/20 p-2 rounded-full mr-3`;
            toast.children[0].innerHTML = `<i class="fas fa-${color==='green'?'check':'times'} text-${color}-500"></i>`;
            
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        // --- Items & Giftcodes APIs ---

        let currentItemPage = 1;

        async function searchItems(page = 1) {
            currentItemPage = page;
            const search = document.getElementById('searchItemInput').value;
            const tbody = document.getElementById('itemsTableBody');
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Đang tải...</td></tr>';
            try {
                const res = await apiCall(`/items?search=${encodeURIComponent(search)}&page=${page}&limit=50`);
                tbody.innerHTML = '';
                if(res.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Không tìm thấy vật phẩm</td></tr>';
                    document.getElementById('itemPageInfo').innerText = `Không có dữ liệu`;
                    return;
                }
                res.data.forEach(i => {
                    tbody.innerHTML += `
                        <tr class="hover:bg-dark-700/50 transition-colors group cursor-pointer" onclick="openGiftItemModal(${i.id}, '${i.name.replace(/'/g, "\\'")}')">
                            <td class="p-4 font-mono font-bold text-yellow-400" title="Nhấn để Tặng Đồ">${i.id} <i class="fas fa-gift opacity-0 group-hover:opacity-100 text-xs ml-1 transition-opacity"></i></td>
                            <td class="p-4 font-semibold text-white">${i.name}</td>
                            <td class="p-4 text-gray-400">Lv.${i.level}</td>
                            <td class="p-4 text-gray-400 text-sm break-words">${i.description}</td>
                        </tr>
                    `;
                });
                
                const totalPages = Math.ceil(res.total / 50);
                document.getElementById('itemPageInfo').innerText = `Trang ${page} / ${totalPages}`;
            } catch(e) {}
        }

        function prevItemPage() {
            if(currentItemPage > 1) searchItems(currentItemPage - 1);
        }

        function nextItemPage() {
            searchItems(currentItemPage + 1);
        }

        function openGiftItemModal(id, name) {
            document.getElementById('giftItemId').value = id;
            document.getElementById('giftItemNameLabel').innerText = name;
            document.getElementById('giftPlayerName').value = '';
            document.getElementById('giftItemQty').value = 1;
            document.getElementById('giftItemUpgrade').value = 0;
            const modal = document.getElementById('modalGiftItem');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                document.getElementById('modalGiftItemContent').classList.remove('scale-95');
            }, 10);
        }

        async function submitGiftItemByName() {
            const itemId = document.getElementById('giftItemId').value;
            const playerName = document.getElementById('giftPlayerName').value;
            const qty = parseInt(document.getElementById('giftItemQty').value) || 1;
            const upgrade = parseInt(document.getElementById('giftItemUpgrade').value) || 0;
            const isLock = document.getElementById('giftItemLock').checked;
            
            if(!playerName) return showToast('Lỗi', 'Vui lòng nhập tên người nhận', 'red');
            
            try {
                const data = await apiCall('/players/gift-item-by-name', 'POST', { playerName, itemId, quantity: qty, upgrade, isLock });
                showToast('Thành công', data.message);
                closeModal('modalGiftItem');
            } catch(e) {}
        }
        window.itemDict = {};
        
        async function loadItemDict() {
            try {
                const dict = await apiCall('/items/dict');
                window.itemDict = dict;
            } catch(e) {}
        }

        function formatGiftcodeItems(itemsStr) {
            if (!itemsStr || itemsStr === '[]' || itemsStr.trim() === '') return '<span class="text-gray-500 italic">Không có</span>';
            try {
                const items = JSON.parse(itemsStr);
                return items.map(it => {
                    const name = window.itemDict[it.id] || `Item_${it.id}`;
                    const lock = it.isLock ? '<i class="fas fa-lock text-red-400 text-xs ml-1"></i>' : '';
                    const upg = it.upgrade > 0 ? `<span class="text-yellow-400 ml-1">+${it.upgrade}</span>` : '';
                    return `<span class="inline-block bg-dark-800 border border-gray-600 rounded px-2 py-1 text-sm mr-2 mb-2">
                                <span class="text-purple-300 font-bold">${name}</span>
                                <span class="text-gray-400 ml-1">x${it.quantity}</span>${upg}${lock}
                            </span>`;
                }).join('');
            } catch(e) {
                return '<span class="text-red-400">Lỗi JSON</span>';
            }
        }
        window.giftcodesList = [];
        async function loadGiftcodes() {
            if (Object.keys(window.itemDict).length === 0) await loadItemDict();
            const tbody = document.getElementById('giftcodesTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Đang tải...</td></tr>';
            try {
                const res = await apiCall('/giftcodes');
                tbody.innerHTML = '';
                window.giftcodesList = res.data;
                if(res.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Chưa có mã Giftcode nào</td></tr>';
                    return;
                }
                res.data.forEach(g => {
                    tbody.innerHTML += `
                        <tr class="hover:bg-dark-700/50 transition-colors">
                            <td class="p-4 font-bold text-red-400">${g.code}</td>
                            <td class="p-4 text-blue-400">${g.coin.toLocaleString()}</td>
                            <td class="p-4 text-yellow-400">${g.gold.toLocaleString()}</td>
                            <td class="p-4 text-gray-300">${g.yen.toLocaleString()}</td>
                            <td class="p-4">${formatGiftcodeItems(g.items)}</td>
                            <td class="p-4 text-right whitespace-nowrap">
                                <button onclick="editGiftcode(${g.id})" class="bg-blue-900/40 hover:bg-blue-900/80 text-blue-400 px-3 py-2 rounded transition-colors mr-2" title="Sửa"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteGiftcode(${g.id})" class="bg-red-900/40 hover:bg-red-900/80 text-red-400 px-3 py-2 rounded transition-colors" title="Xoá"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                });
            } catch(e) {}
        }

        function openCreateGiftcode() {
            document.getElementById('editGcId').value = '';
            document.getElementById('newGcCode').value = '';
            document.getElementById('newGcCoin').value = 0;
            document.getElementById('newGcGold').value = 0;
            document.getElementById('newGcYen').value = 0;
            document.getElementById('newGcType').value = 0;
            
            document.getElementById('gcItemId').value = '';
            document.getElementById('gcItemUpgrade').value = 0;
            document.getElementById('gcItemQty').value = 1;
            document.getElementById('gcItemLock').checked = true;
            
            openModal('modalCreateGiftcode');
        }

        function editGiftcode(id) {
            const g = window.giftcodesList.find(x => x.id === id);
            if (!g) return;
            document.getElementById('editGcId').value = g.id;
            document.getElementById('newGcCode').value = g.code;
            document.getElementById('newGcCoin').value = g.coin;
            document.getElementById('newGcGold').value = g.gold;
            document.getElementById('newGcYen').value = g.yen;
            document.getElementById('newGcType').value = g.type;
            
            document.getElementById('gcItemId').value = '';
            document.getElementById('gcItemUpgrade').value = 0;
            document.getElementById('gcItemQty').value = 1;
            document.getElementById('gcItemLock').checked = true;
            
            try {
                const items = JSON.parse(g.items);
                if(items.length > 0) {
                    document.getElementById('gcItemId').value = items[0].id;
                    document.getElementById('gcItemUpgrade').value = items[0].upgrade || 0;
                    document.getElementById('gcItemQty').value = items[0].quantity || 1;
                    document.getElementById('gcItemLock').checked = items[0].isLock;
                }
            } catch(e) {}
            
            openModal('modalCreateGiftcode');
        }

        async function submitCreateGiftcode() {
            const id = document.getElementById('editGcId').value;
            const code = document.getElementById('newGcCode').value;
            const coin = document.getElementById('newGcCoin').value;
            const gold = document.getElementById('newGcGold').value;
            const yen = document.getElementById('newGcYen').value;
            const type = document.getElementById('newGcType').value;
            
            const itemId = document.getElementById('gcItemId').value;
            let items = [];
            
            if (itemId && itemId.trim() !== '') {
                items.push({
                    id: parseInt(itemId),
                    quantity: parseInt(document.getElementById('gcItemQty').value) || 1,
                    upgrade: parseInt(document.getElementById('gcItemUpgrade').value) || 0,
                    isLock: document.getElementById('gcItemLock').checked,
                    sys: 0,
                    expire: -1,
                    yen: 0,
                    options: []
                });
            }
            
            try {
                if (id) {
                    const data = await apiCall(`/giftcodes/${id}`, 'PUT', { code, coin, gold, yen, type, items });
                    showToast('Thành công', data.message);
                } else {
                    const data = await apiCall('/giftcodes', 'POST', { code, coin, gold, yen, type, items });
                    showToast('Thành công', data.message);
                }
                closeModal('modalCreateGiftcode');
                loadGiftcodes();
            } catch(e) {}
        }

        async function deleteGiftcode(id) {
            if(!confirm('Bạn có chắc chắn muốn xóa Giftcode này không?')) return;
            try {
                const data = await apiCall(`/giftcodes/${id}`, 'DELETE');
                showToast('Thành công', data.message);
                loadGiftcodes();
            } catch(e) {}
        }

        async function unstuckUser(id) {
            const msg = id === 'all' 
                ? 'CẢNH BÁO: Hành động này sẽ reset trạng thái online của TẤT CẢ TÀI KHOẢN trên Server (Chỉ dùng khi Server vừa khởi động lại). Bạn chắc chứ?' 
                : 'Bạn có muốn Kích Kẹt tài khoản này không?';
            if(!confirm(msg)) return;
            try {
                const data = await apiCall('/users/unstuck', 'POST', { id });
                showToast('Thành công', data.message);
            } catch(e) {}
        }

        // --- Config Settings APIs ---
        
        async function loadConfig() {
            document.getElementById('configRawContent').value = 'Đang tải...';
            try {
                const res = await apiCall('/config');
                const content = res.data;
                document.getElementById('configRawContent').value = content;
                
                // Parse for quick inputs
                document.getElementById('quickExp').value = extractConfigValue(content, 'game.server.exp');
                document.getElementById('quickUpgrade').value = extractConfigValue(content, 'game.upgrade.percent.add');
                document.getElementById('quickMaxLv').value = extractConfigValue(content, 'game.server.maxLV');
                document.getElementById('quickLimit').value = extractConfigValue(content, 'game.login.limit');
            } catch(e) {}
        }

        function extractConfigValue(text, key) {
            const regex = new RegExp(`^${key}=(.*)$`, 'm');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        }

        function updateConfigText(key, newValue) {
            let text = document.getElementById('configRawContent').value;
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(text)) {
                text = text.replace(regex, `${key}=${newValue}`);
            } else {
                text += `\n${key}=${newValue}`;
            }
            document.getElementById('configRawContent').value = text;
        }

        async function saveAndRestartServer() {
            if(!confirm('CẢNH BÁO: Game Server sẽ khởi động lại ngay lập tức và toàn bộ người chơi sẽ bị mất kết nối.\nBạn có chắc chắn muốn Lưu và Khởi Động Lại?')) return;
            
            const btn = document.getElementById('btnSaveConfig');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Đang xử lý...';
            btn.disabled = true;
            
            const content = document.getElementById('configRawContent').value;
            try {
                const data = await apiCall('/config', 'POST', { content });
                showToast('Thành công', data.message);
            } catch(e) {}
            
            btn.innerHTML = '<i class="fas fa-power-off mr-2"></i> Lưu & Khởi Động Lại Game Server';
            btn.disabled = false;
        }
    