
import { APIcall } from '../../js/APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

// 현재 그리드 상태
let _currentGridApi = null;
let _editMode = false;

function getSupabase() {
    if (!window.supabaseClient) {
        window.supabaseClient = supabase.createClient(
            window.config.supabase.url,
            window.config.supabase.anonKey
        );
    }
    return window.supabaseClient;
}

// [Admin Auth Check]
async function checkAuth() {
    try {
        const _supabase = getSupabase();
        const { data: { session } } = await _supabase.auth.getSession();

        if (!session) {
            window.location.href = './admin_signin.html';
            return null;
        }

        const { data: dbUser, error } = await _supabase
            .from('users')
            .select('role, name')
            .eq('id', session.user.id)
            .single();

        if (error || !dbUser || dbUser.role !== 'admin') {
            await _supabase.auth.signOut();
            alert('관리자 권한이 없습니다.');
            window.location.href = './admin_signin.html';
            return null;
        }

        $('#admin-name').text(dbUser.name || session.user.email);
        return { id: session.user.id, email: session.user.email, name: dbUser.name, role: dbUser.role };
    } catch (e) {
        console.error('Auth check error:', e);
        window.location.href = './admin_signin.html';
        return null;
    }
}

// [Logout]
$('#logout-btn').on('click', async function () {
    if (confirm('로그아웃 하시겠습니까?')) {
        await getSupabase().auth.signOut();
        window.location.href = './admin_signin.html';
    }
});

// [Navigation]
$('.menu-link[data-page]').on('click', function () {
    const page = $(this).data('page');
    $('.menu-link').removeClass('active');
    $(this).addClass('active');
    loadPage(page);
});

// [Brand Click → Dashboard]
$('.brand[data-page]').on('click', function () {
    $('.menu-link').removeClass('active');
    loadPage('dashboard');
});

async function loadPage(page) {
    const $content = $('#content-area');
    const pageTitles = {
        dashboard: '대시보드',
        users: '회원 관리',
        companies: '기업 관리',
        files: '파일 관리',
        reports: '보고서 설정',
        qna: 'Q&A 관리',
        sellers: '매도 관리',
        buyers: '매수 관리',
        nda: 'NDA 관리'
    };
    $('#page-title').text(pageTitles[page] || page);

    switch (page) {
        case 'dashboard':
            renderDashboard($content);
            break;
        case 'users':
            await renderGrid($content, 'users', '회원 관리');
            break;
        case 'companies':
            await renderGrid($content, 'companies', '기업 관리');
            break;
        case 'files':
            await renderGrid($content, 'files', '파일 관리');
            break;
        case 'reports':
            await renderGrid($content, 'reports', '보고서 설정');
            break;
        case 'qna':
            await renderGrid($content, 'qna', 'Q&A 관리');
            break;
        case 'sellers':
            await renderGrid($content, 'sellers', '매도 관리');
            break;
        case 'buyers':
            await renderGrid($content, 'buyers', '매수 관리');
            break;
        case 'nda':
            await renderGrid($content, 'nda', 'NDA 관리');
            break;
        default:
            renderDashboard($content);
    }
}

// [Dashboard Home Renderer]
async function renderDashboard($container) {
    $container.html(`
        <div class="stats-grid">
            <div class="card clickable-card" data-table="users" style="cursor:pointer;" onclick="renderWeeklyChart('users')">
                <div class="card-header">
                    <div class="avatar-icon"><span class="material-symbols-outlined">group</span></div>
                </div>
                <span class="card-title">전체 회원</span>
                <span class="card-value" id="stat-users">로딩 중...</span>
            </div>
            <div class="card clickable-card" data-table="sellers" style="cursor:pointer;" onclick="renderWeeklyChart('sellers')">
                <div class="card-header">
                    <div class="avatar-icon success"><span class="material-symbols-outlined">storefront</span></div>
                </div>
                <span class="card-title">매도 매물</span>
                <span class="card-value" id="stat-sellers">로딩 중...</span>
            </div>
            <div class="card clickable-card" data-table="buyers" style="cursor:pointer;" onclick="renderWeeklyChart('buyers')">
                <div class="card-header">
                    <div class="avatar-icon info"><span class="material-symbols-outlined">shopping_bag</span></div>
                </div>
                <span class="card-title">매수 희망</span>
                <span class="card-value" id="stat-buyers">로딩 중...</span>
            </div>
            <div class="card clickable-card" data-table="qna" style="cursor:pointer;" onclick="renderWeeklyChart('qna')">
                <div class="card-header">
                    <div class="avatar-icon warning"><span class="material-symbols-outlined">support_agent</span></div>
                </div>
                <span class="card-title">Q&A 문의</span>
                <span class="card-value" id="stat-qna">로딩 중...</span>
            </div>
            <div class="card clickable-card" data-table="files" style="cursor:pointer;" onclick="renderWeeklyChart('files')">
                <div class="card-header">
                    <div class="avatar-icon" style="background: rgba(105, 108, 255, 0.16); color: #696cff;"><span class="material-symbols-outlined">description</span></div>
                </div>
                <span class="card-title">파일</span>
                <span class="card-value" id="stat-files">로딩 중...</span>
            </div>
            <div class="card clickable-card" data-table="companies" style="cursor:pointer;" onclick="renderWeeklyChart('companies')">
                <div class="card-header">
                    <div class="avatar-icon" style="background: rgba(113, 221, 55, 0.16); color: #71dd37;"><span class="material-symbols-outlined">business</span></div>
                </div>
                <span class="card-title">기업</span>
                <span class="card-value" id="stat-companies">로딩 중...</span>
            </div>
        </div>

        <div class="card" style="padding: 20px; height: 420px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <h5 id="chart-title" style="margin: 0;">주간 신규 회원</h5>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div id="chart-presets" style="display: flex; gap: 4px;">
                        <button class="btn-sm btn-outline chart-preset active-preset" data-weeks="4">4주</button>
                        <button class="btn-sm btn-outline chart-preset" data-weeks="8">8주</button>
                        <button class="btn-sm btn-outline chart-preset" data-weeks="13">3개월</button>
                        <button class="btn-sm btn-outline chart-preset" data-weeks="26">6개월</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--secondary-color);">
                        <input type="date" id="chart-from" style="padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; color: var(--text-color);">
                        <span>~</span>
                        <input type="date" id="chart-to" style="padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; color: var(--text-color);">
                    </div>
                </div>
            </div>
            <div style="height: calc(100% - 64px); position: relative;">
                <canvas id="weekly-chart"></canvas>
            </div>
        </div>
    `);

    window.renderWeeklyChart = renderWeeklyChart;

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 4 * 7);
    $('#chart-to').val(toDate.toISOString().split('T')[0]);
    $('#chart-from').val(fromDate.toISOString().split('T')[0]);

    $(document).on('click', '.chart-preset', function () {
        $('.chart-preset').removeClass('active-preset').css({ background: '', color: '' });
        $(this).addClass('active-preset');
        const weeks = parseInt($(this).data('weeks'));
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - weeks * 7);
        $('#chart-to').val(to.toISOString().split('T')[0]);
        $('#chart-from').val(from.toISOString().split('T')[0]);
        const table = $('.clickable-card.active-card').data('table') || 'users';
        renderWeeklyChart(table);
    });

    $(document).on('change', '#chart-from, #chart-to', function () {
        $('.chart-preset').removeClass('active-preset');
        const table = $('.clickable-card.active-card').data('table') || 'users';
        renderWeeklyChart(table);
    });

    await fetchStats();
    await renderWeeklyChart('users');
}

function getWeekStartLabel(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
}

async function renderWeeklyChart(tableName = 'users') {
    const titles = {
        users: '회원', sellers: '매도 매물', buyers: '매수 희망',
        qna: 'Q&A', files: '파일', companies: '기업'
    };

    $('#chart-title').text(`주간 신규 ${titles[tableName] || tableName}`);

    $('.clickable-card').removeClass('active-card').css('border', 'none');
    $(`.clickable-card[data-table="${tableName}"]`).addClass('active-card').css('border', '2px solid var(--primary-color)');

    const fromVal = $('#chart-from').val();
    const toVal = $('#chart-to').val();
    const fromDate = fromVal ? new Date(fromVal) : (() => { const d = new Date(); d.setDate(d.getDate() - 28); return d; })();
    const toDate = toVal ? new Date(toVal) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const weekLabels = [];
    const weekCounts = {};
    const cursor = new Date(getWeekStartLabel(fromDate));
    const endMonday = new Date(getWeekStartLabel(toDate));

    while (cursor <= endMonday) {
        const label = cursor.toISOString().split('T')[0];
        weekLabels.push(label);
        weekCounts[label] = 0;
        cursor.setDate(cursor.getDate() + 7);
    }

    try {
        const response = await APIcall({ action: 'read', table: tableName }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' });
        const data = await response.json();
        const rowData = Array.isArray(data) ? data : [];

        rowData.forEach(row => {
            if (!row.created_at) return;
            const d = new Date(row.created_at);
            if (d < fromDate || d > toDate) return;
            const label = getWeekStartLabel(d);
            if (weekCounts.hasOwnProperty(label)) weekCounts[label]++;
        });
    } catch (e) {
        console.error('Chart data fetch error:', e);
    }

    const values = weekLabels.map(l => weekCounts[l]);
    const displayLabels = weekLabels.map(l => {
        const d = new Date(l);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    const ctx = document.getElementById('weekly-chart');
    if (!ctx) return;

    if (window._dashboardChart) window._dashboardChart.destroy();
    window._dashboardChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: displayLabels,
            datasets: [{
                label: `신규 ${titles[tableName]}`,
                data: values,
                borderColor: 'rgba(105, 108, 255, 1)',
                backgroundColor: 'rgba(105, 108, 255, 0.1)',
                borderWidth: 2,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: 'rgba(105, 108, 255, 1)',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `주간 시작: ${weekLabels[items[0].dataIndex]}`
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,0.04)' } },
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        }
    });
}

async function fetchStats() {
    try {
        const tables = ['users', 'sellers', 'buyers', 'qna', 'files', 'companies'];
        const promises = tables.map(table =>
            APIcall({ action: 'read', table: table }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
                .then(res => res.json())
        );
        const results = await Promise.all(promises);
        $('#stat-users').text(Array.isArray(results[0]) ? results[0].length : '-');
        $('#stat-sellers').text(Array.isArray(results[1]) ? results[1].length : '-');
        $('#stat-buyers').text(Array.isArray(results[2]) ? results[2].length : '-');
        $('#stat-qna').text(Array.isArray(results[3]) ? results[3].length : '-');
        $('#stat-files').text(Array.isArray(results[4]) ? results[4].length : '-');
        $('#stat-companies').text(Array.isArray(results[5]) ? results[5].length : '-');
    } catch (e) {
        console.error('Stats Fetch Error:', e);
    }
}

// [entity_type 한글 라벨]
function getEntityTypeLabel(type) {
    const labels = {
        company: '기업 정보',
        seller: '매도 매물',
        buyer: '매수 희망',
        qna: '문의/Q&A',
    };
    return labels[type] || (type || '직접 업로드');
}

// [파일 업로드 출처 문자열 생성]
function getEntitySource(entityType, entityId, companiesMap, sellersCompanyMap, buyersMap) {
    const typeLabel = getEntityTypeLabel(entityType);
    let entityName = '';
    switch (entityType) {
        case 'company': entityName = companiesMap[entityId] || ''; break;
        case 'seller':  entityName = sellersCompanyMap[entityId] || ''; break;
        case 'buyer':   entityName = buyersMap[entityId] || ''; break;
        default: return typeLabel;
    }
    return entityName ? `${typeLabel} · ${entityName}` : typeLabel;
}

// [그리드 렌더러]
async function renderGrid($container, tableName, title) {
    _editMode = false;

    $container.html(`
        <div class="data-grid-container">
            <div class="grid-header">
                <div style="font-weight: 600;">${title} 목록</div>
                <div class="actions-toolbar">
                    <input type="text" id="search-input" placeholder="검색..."
                        style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; width: 200px; outline: none;">
                    <button class="btn-sm btn-outline" id="toggle-edit-btn" style="display:flex;align-items:center;gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">lock</span> 편집 잠금
                    </button>
                    <button class="btn-sm btn-outline" id="refresh-btn">새로고침</button>
                    <button class="btn-sm btn-outline" id="delete-btn" style="color:#aaa;cursor:not-allowed;" disabled>삭제</button>
                </div>
            </div>
            <div id="grid-wrapper" class="ag-theme-alpine"></div>
        </div>
    `);

    // 데이터 로드
    let rowData = [];
    try {
        if (tableName === 'files') {
            // 파일·회원·기업·매도·매수 병렬 조회
            const [filesRes, usersRes, companiesRes, sellersRes, buyersRes] = await Promise.all([
                APIcall({ action: 'read', table: 'files' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'companies' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'sellers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'buyers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            ]);
            const files = await filesRes.json();
            const users = await usersRes.json();
            const companies = await companiesRes.json();
            const sellers = await sellersRes.json();
            const buyers = await buyersRes.json();

            const usersMap = {};
            if (Array.isArray(users)) users.forEach(u => { usersMap[u.id] = u.name || u.email || '-'; });

            const companiesMap = {};
            if (Array.isArray(companies)) companies.forEach(c => { companiesMap[c.id] = c.name || '-'; });

            // 매도: seller.id → seller가 속한 기업명
            const sellersCompanyMap = {};
            if (Array.isArray(sellers)) sellers.forEach(s => {
                sellersCompanyMap[s.id] = companiesMap[s.company_id] || '-';
            });

            const buyersMap = {};
            if (Array.isArray(buyers)) buyers.forEach(b => { buyersMap[b.id] = b.company_name || '-'; });

            rowData = Array.isArray(files) ? files.map(f => ({
                ...f,
                uploader_name: usersMap[f.user_id] || '-',
                entity_source: getEntitySource(f.entity_type, f.entity_id, companiesMap, sellersCompanyMap, buyersMap)
            })) : [];
        } else if (tableName === 'companies') {
            const [tableRes, usersRes] = await Promise.all([
                APIcall({ action: 'read', table: 'companies' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            ]);
            const rows = await tableRes.json();
            const users = await usersRes.json();
            const usersMap = {};
            if (Array.isArray(users)) users.forEach(u => { usersMap[u.id] = u.name || u.email || '-'; });
            rowData = Array.isArray(rows) ? rows.map(r => ({
                ...r,
                author_name: usersMap[r.user_id] || '-'
            })) : [];

        } else if (tableName === 'sellers') {
            const [tableRes, usersRes, companiesRes] = await Promise.all([
                APIcall({ action: 'read', table: 'sellers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'companies' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            ]);
            const rows = await tableRes.json();
            const users = await usersRes.json();
            const companies = await companiesRes.json();
            const usersMap = {};
            if (Array.isArray(users)) users.forEach(u => { usersMap[u.id] = u.name || u.email || '-'; });
            const companiesMap = {};
            if (Array.isArray(companies)) companies.forEach(c => { companiesMap[c.id] = { name: c.name || '-', industry: c.industry || '-' }; });
            rowData = Array.isArray(rows) ? rows.map(r => ({
                ...r,
                company_name: companiesMap[r.company_id]?.name || '-',
                company_industry: companiesMap[r.company_id]?.industry || '-',
                author_name: usersMap[r.user_id] || '-'
            })) : [];

        } else if (tableName === 'buyers') {
            const [tableRes, usersRes] = await Promise.all([
                APIcall({ action: 'read', table: 'buyers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            ]);
            const rows = await tableRes.json();
            const users = await usersRes.json();
            const usersMap = {};
            if (Array.isArray(users)) users.forEach(u => { usersMap[u.id] = u.name || u.email || '-'; });
            rowData = Array.isArray(rows) ? rows.map(r => ({
                ...r,
                author_name: usersMap[r.user_id] || '-'
            })) : [];

        } else if (tableName === 'nda') {
            const [ndaRes, usersRes, buyersRes, sellersRes, companiesRes] = await Promise.all([
                APIcall({ action: 'read', table: 'nda_logs' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'buyers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'sellers' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }),
                APIcall({ action: 'read', table: 'companies' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            ]);

            const ndaLogs = await ndaRes.json();
            const users = await usersRes.json();
            const buyers = await buyersRes.json();
            const sellers = await sellersRes.json();
            const companies = await companiesRes.json();

            const usersMap = {};
            if (Array.isArray(users)) users.forEach(u => { usersMap[u.id] = u.name || u.email || '-'; });

            const companiesMap = {};
            if (Array.isArray(companies)) companies.forEach(c => { companiesMap[c.id] = c.name || c.companyName || '-'; });

            const buyerMap = {};
            if (Array.isArray(buyers)) buyers.forEach(b => { 
                buyerMap[b.id] = b.company_name || b.companyName || b.Name || '-'; 
            });

            const sellerMap = {};
            if (Array.isArray(sellers)) sellers.forEach(s => { 
                const companyInfo = companiesMap[s.company_id] || companiesMap[s.companyId] || '-';
                sellerMap[s.id] = s.company_name || s.companyName || companyInfo; 
            });

            rowData = Array.isArray(ndaLogs) ? ndaLogs.map(log => {
                const targetId = log.item_id || log.seller_id;
                let itemName = '-';
                if (log.item_type === 'buyer') {
                    itemName = (buyerMap[targetId] && buyerMap[targetId] !== '-') ? buyerMap[targetId] : '삭제된 항목';
                } else {
                    itemName = (sellerMap[targetId] && sellerMap[targetId] !== '-') ? sellerMap[targetId] : '삭제된 항목';
                }
                return {
                    ...log,
                    signer_name: usersMap[log.user_id] || log.signature || '-',
                    item_name: itemName,
                    display_type: log.item_type === 'buyer' ? '매수' : '매도'
                };
            }) : [];
        } else if (tableName === 'reports') {
            const response = await fetch('../../data/reports.json');
            rowData = await response.json();
        } else {
            const response = await APIcall({ action: 'read', table: tableName }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' });
            const data = await response.json();
            rowData = Array.isArray(data) ? data : [];
        }
    } catch (e) {
        console.error(`Fetch ${tableName} error:`, e);
        alert('데이터 로드 실패');
    }

    const columnDefs = getColumnDefs(tableName, false);
    const gridDiv = document.querySelector('#grid-wrapper');
    const gridOptions = {
        theme: 'legacy',
        rowData,
        columnDefs,
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            flex: 1,
            editable: false
        },
        rowSelection: { mode: 'multiRow', headerCheckbox: false, checkboxes: false },
        pagination: true,
        paginationPageSize: 20,
        paginationPageSizeSelector: [10, 20, 50, 100],
        onCellValueChanged: async (params) => {
            if (!_editMode) return;
            const field = params.colDef.field;
            if (!field || field === 'id' || field === 'created_at') return;
            try {
                await APIcall({
                    action: 'update',
                    table: tableName,
                    id: params.data.id,
                    [field]: params.newValue
                }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' });
            } catch (e) {
                console.error('셀 저장 오류:', e);
                alert('저장 실패: ' + e.message);
                params.node.setDataValue(field, params.oldValue);
            }
        }
    };

    _currentGridApi = agGrid.createGrid(gridDiv, gridOptions);

    // 검색
    $('#search-input').on('input', function () {
        _currentGridApi.setGridOption('quickFilterText', $(this).val());
    });

    // 편집 토글
    $('#toggle-edit-btn').on('click', function () {
        _editMode = !_editMode;
        if (_editMode) {
            $(this).html('<span class="material-symbols-outlined" style="font-size:16px;">lock_open</span> 편집 중');
            $(this).css({ background: 'var(--warning-color)', color: 'white', border: 'none' });
            $('#delete-btn').prop('disabled', false).css({ color: 'red', cursor: 'pointer' });
            _currentGridApi.setGridOption('rowSelection', { mode: 'multiRow', headerCheckbox: true, checkboxes: true });
        } else {
            $(this).html('<span class="material-symbols-outlined" style="font-size:16px;">lock</span> 편집 잠금');
            $(this).css({ background: '', color: '', border: '' });
            $('#delete-btn').prop('disabled', true).css({ color: '#aaa', cursor: 'not-allowed' });
            _currentGridApi.setGridOption('rowSelection', { mode: 'multiRow', headerCheckbox: false, checkboxes: false });
            _currentGridApi.deselectAll();
        }
        const newColDefs = getColumnDefs(tableName, _editMode);
        _currentGridApi.setGridOption('columnDefs', newColDefs);
        _currentGridApi.refreshCells({ force: true });
    });

    $('#refresh-btn').click(() => loadPage(tableName));
    $('#delete-btn').click(() => deleteSelectedRows(tableName));
}

function getColumnDefs(tableName, editMode = false) {
    const common = [
        { field: 'id', hide: true },
        { field: 'created_at', headerName: '등록일', width: 160, editable: false }
    ];

    switch (tableName) {
        case 'users':
            return [
                {
                    field: 'name',
                    headerName: '회원명',
                    width: 120,
                    editable: false,
                    cellRenderer: params => {
                        const name = params.value || '-';
                        return `<a href="javascript:void(0)"
                            onclick='showUserDetailModal(${JSON.stringify(params.data)})'
                            style="color: var(--primary-color); text-decoration: none; font-weight: 600; cursor: pointer;">
                            ${name}
                        </a>`;
                    }
                },
                { field: 'email', headerName: '이메일', width: 210, editable: editMode },
                { field: 'company', headerName: '소속', width: 150, editable: editMode },
                {
                    field: 'status',
                    headerName: '상태',
                    width: 80,
                    editable: false,
                    cellStyle: params => {
                        if (params.value === 'approved') return { color: '#71dd37', fontWeight: 'bold' };
                        if (params.value === 'rejected') return { color: '#ff3e1d', fontWeight: 'bold' };
                        return { color: '#ffab00', fontWeight: 'bold' };
                    },
                    valueFormatter: params => {
                        const map = { approved: '승인', rejected: '거절', pending: '대기' };
                        return map[params.value] || params.value || '-';
                    }
                },
                {
                    headerName: '역할 / 처리',
                    width: 180,
                    editable: false,
                    cellRenderer: params => {
                        const status = params.data.status || 'pending';
                        const role = params.data.role || 'reviewer';
                        const current = `${status}|${role}`;
                        const options = [
                            { value: 'pending|reviewer', label: '대기 중' },
                            { value: 'approved|reviewer', label: '승인: 열람자' },
                            { value: 'approved|buyer', label: '승인: 바이어' },
                            { value: 'rejected|reviewer', label: '거절' },
                        ];
                        const opts = options.map(o =>
                            `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`
                        ).join('');
                        const disabled = editMode ? '' : 'disabled';
                        const style = editMode
                            ? 'padding:3px 6px;border-radius:4px;font-size:12px;width:100%;border:1px solid #d9dee3;cursor:pointer;'
                            : 'padding:3px 6px;border-radius:4px;font-size:12px;width:100%;background:#f5f5f9;color:#aaa;cursor:not-allowed;border:1px solid #eee;';
                        return `<select ${disabled} style="${style}"
                            onchange="handleUserRoleAction('${params.data.id}', this.value)">
                            ${opts}
                        </select>`;
                    }
                }
            ].concat(common);

        case 'qna':
            return [
                { field: 'subject', headerName: '제목', width: 300, editable: editMode },
                { field: 'inquiry_type', headerName: '문의 유형', editable: editMode },
                { field: 'name', headerName: '문의자', editable: editMode },
                { field: 'email', headerName: '이메일', editable: editMode },
                { field: 'content', headerName: '내용', hide: true }
            ].concat(common);

        case 'sellers':
            return [
                { field: 'company_name', headerName: '기업명', width: 160, editable: false },
                { field: 'company_industry', headerName: '산업', width: 130, editable: false },
                { field: 'author_name', headerName: '작성자', width: 110, editable: false }
            ].concat(common);

        case 'buyers':
            return [
                { field: 'company_name', headerName: '기업명', width: 160, editable: editMode },
                { field: 'interest_industry', headerName: '산업', width: 130, editable: editMode },
                { field: 'author_name', headerName: '작성자', width: 110, editable: false }
            ].concat(common);

        case 'files':
            return [
                { field: 'file_name', headerName: '파일명', editable: editMode },
                { field: 'uploader_name', headerName: '업로더', width: 130, editable: false },
                { field: 'entity_source', headerName: '업로드 출처', width: 220, editable: false },
                { field: 'summary', headerName: '설명', editable: editMode }
            ].concat(common);

        case 'companies':
            return [
                { field: 'name', headerName: '기업명', width: 160, editable: editMode },
                { field: 'industry', headerName: '산업', width: 130, editable: editMode },
                { field: 'author_name', headerName: '작성자', width: 110, editable: false }
            ].concat(common);

        case 'reports':
            return [
                { field: 'id', headerName: 'ID', width: 100 },
                { field: 'title', headerName: '제목', width: 150, editable: editMode },
                { field: 'description', headerName: '설명', flex: 2, editable: editMode },
                { field: 'category', headerName: '카테고리', width: 100, editable: editMode },
                { field: 'instruction', headerName: '지시사항', hide: true }
            ];

        case 'nda':
            return [
                { field: 'signer_name', headerName: '서명자', width: 130 },
                { field: 'item_name', headerName: '항목명', width: 220 },
                { field: 'display_type', headerName: '구분', width: 90 },
                {
                    headerName: '관리',
                    width: 120,
                    cellRenderer: params => {
                        return `<button class="btn-sm btn-primary" onclick='downloadNdaPdf(${JSON.stringify(params.data)})'>PDF 다운로드</button>`;
                    }
                }
            ].concat(common);

        default:
            return common;
    }
}

async function deleteSelectedRows(tableName) {
    if (!_currentGridApi) return;
    const selectedNodes = _currentGridApi.getSelectedNodes();
    if (selectedNodes.length === 0) {
        alert('삭제할 행을 선택해주세요.');
        return;
    }
    if (!confirm(`선택한 ${selectedNodes.length}건을 정말 삭제하시겠습니까?`)) return;

    let successCount = 0;
    for (const node of selectedNodes) {
        try {
            await APIcall({
                action: 'delete',
                table: tableName,
                id: node.data.id
            }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' });
            successCount++;
        } catch (e) {
            console.error('삭제 실패:', e);
        }
    }
    alert(`${successCount}건 삭제 완료`);
    loadPage(tableName);
}

// [회원 상세 모달]
window.showUserDetailModal = function (userData) {
    const formatBool = v => v ? '동의' : '미동의';
    const formatDate = v => v ? new Date(v).toLocaleString('ko-KR') : '-';
    const statusMap = { approved: '승인', rejected: '거절', pending: '대기' };
    const roleMap = { admin: '관리자', reviewer: '열람자', buyer: '바이어' };

    const escapedEmail = (userData.email || '').replace(/'/g, "\\'");
    const escapedName  = (userData.name  || '').replace(/'/g, "\\'");

    const adminBtnLabel = userData.role === 'admin' ? '관리자 권한 해제' : '관리자 권한 부여';
    const adminBtnColor = userData.role === 'admin' ? '#ff3e1d' : 'var(--primary-color)';
    const adminBtnIcon = userData.role === 'admin' ? 'shield' : 'admin_panel_settings';

    $('#modal-title').text(`회원 상세 정보 — ${userData.name || '-'}`);
    $('#modal-footer-left').css({ display: 'flex', gap: '8px' }).html(`
        <button class="btn-sm btn-outline" style="color:#ff3e1d; display:flex; align-items:center; gap:4px;"
            onclick="resetUserPassword('${escapedEmail}', '${escapedName}')">
            <span class="material-symbols-outlined" style="font-size:15px;">lock_reset</span>
            비밀번호 초기화
        </button>
        <button class="btn-sm btn-outline" style="color:${adminBtnColor}; display:flex; align-items:center; gap:4px;"
            onclick="toggleAdminRole('${userData.id}', '${userData.role}')">
            <span class="material-symbols-outlined" style="font-size:15px;">${adminBtnIcon}</span>
            ${adminBtnLabel}
        </button>
    `);
    $('#modal-content').html(`
        <table style="width:100%; border-collapse: collapse; font-size: 14px;">
            <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
            <tbody>
                ${row('이름', userData.name)}
                ${row('이메일', userData.email)}
                ${row('전화번호', userData.phone)}
                ${row('소속', userData.company)}
                ${row('부서', userData.department)}
                ${row('역할', roleMap[userData.role] || userData.role)}
                ${row('상태', statusMap[userData.status] || userData.status)}
                ${row('가입일', formatDate(userData.created_at))}
                ${row('최근 접속일', formatDate(userData.last_login_at))}
                ${row('이용약관 동의', formatBool(userData.agree_terms))}
                ${row('개인정보 처리방침 동의', formatBool(userData.agree_privacy))}
                ${row('마케팅 수신 동의', formatBool(userData.agree_marketing))}
                ${row('활성 계정', userData.is_active ? '활성' : '탈퇴')}
            </tbody>
        </table>
    `);
    $('#detail-modal').css('display', 'flex');
};

function row(label, value) {
    return `
        <tr>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; color:#8592a3; font-weight:500;">${label}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; color:#233446;">${value ?? '-'}</td>
        </tr>`;
}

// [회원 역할/상태 처리]
window.handleUserRoleAction = async function (userId, combinedValue) {
    const [status, role] = combinedValue.split('|');
    const statusLabel = { approved: '승인', rejected: '거절', pending: '대기' }[status] || status;
    const roleLabel = { reviewer: '열람자', buyer: '바이어', admin: '관리자' }[role] || role;
    const actionText = status === 'pending' ? '대기로 초기화' : `${statusLabel} (${roleLabel})`;

    if (!confirm(`해당 사용자를 "${actionText}"으로 처리하시겠습니까?`)) {
        // 변경 취소 — 그리드 새로고침으로 원래 값 복원
        loadPage('users');
        return;
    }

    try {
        const _supabase = getSupabase();
        const { error } = await _supabase
            .from('users')
            .update({ status, role })
            .eq('id', userId);

        if (error) throw error;
        alert('처리가 완료되었습니다.');
        loadPage('users');
    } catch (e) {
        console.error('회원 상태 변경 오류:', e);
        alert('처리 중 오류가 발생했습니다: ' + e.message);
        loadPage('users');
    }
};

// [관리자 권한 부여/해제]
window.toggleAdminRole = async function(userId, currentRole) {
    const isAdmin = currentRole === 'admin';
    const confirmMsg = isAdmin
        ? "관리자 권한을 해제하시겠습니까?"
        : "관리자 권한을 부여하시겠습니까?\n이 회원은 모든 관리 기능에 접근할 수 있습니다.";
    
    if (!confirm(confirmMsg)) return;

    try {
        const _supabase = getSupabase();
        const updateData = isAdmin 
            ? { role: 'reviewer' } 
            : { role: 'admin', status: 'approved' };

        const { error } = await _supabase
            .from('users')
            .update(updateData)
            .eq('id', userId);

        if (error) throw error;

        alert('처리 완료');
        $('#detail-modal').fadeOut(200);
        loadPage('users');
    } catch (e) {
        console.error('관리자 권한 변경 오류:', e);
        alert('오류: ' + e.message);
    }
};

// [비밀번호 초기화 이메일 발송]
window.resetUserPassword = async function (email, name) {
    const displayName = name || email;
    if (!confirm(`${displayName}님(${email})에게\n비밀번호 초기화 이메일을 발송하시겠습니까?\n\n회원이 이메일을 통해 직접 재설정하게 됩니다.`)) return;

    const btn = document.querySelector('#modal-footer-left button');
    if (btn) { btn.disabled = true; btn.textContent = '발송 중...'; }

    try {
        const resetUrl = `${window.location.origin.replace('/admin/html', '')}/html/reset-password.html`;
        const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
            redirectTo: resetUrl
        });
        if (error) throw error;
        alert(`✅ 비밀번호 초기화 이메일을 ${email}로 발송했습니다.`);
    } catch (e) {
        console.error('비밀번호 초기화 오류:', e);
        alert('발송 실패: ' + e.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">lock_reset</span> 비밀번호 초기화';
        }
    }
};

// [NDA PDF 다운로드]
window.downloadNdaPdf = async function(log) {
    const $template = $('#nda-pdf-template');
    if (!$template.length) {
        alert("PDF 템플릿을 찾을 수 없습니다.");
        return;
    }

    // Fill template
    $template.find('#pdf-item-name').text(log.item_name || '정보 없음');

    const isBuyer = log.item_type === 'buyer';
    const displayType = isBuyer ? '매수' : '매도';
    $template.find('#pdf-item-type')
        .text(displayType)
        .css({
            'background': isBuyer ? '#f0fdfa' : '#eff6ff',
            'color':      isBuyer ? '#0d9488' : '#1e3a8a',
            'border':     isBuyer ? '1px solid #ccfbf1' : '1px solid #bfdbfe'
        });
    
    const date = new Date(log.created_at);
    const dateStr = `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`;
    $template.find('#pdf-signed-date').text(dateStr);
    $template.find('#pdf-signature-display').text(log.signature || log.signer_name || '');

    // Options for html2pdf
    const filename = `NDA_${(log.item_name || 'Item').replace(/\s+/g, '_')}_${(log.signature || log.signer_name || 'Signed').replace(/\s+/g, '_')}.pdf`;
    const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const element = $template.get(0);
    element.style.display = 'block';
    
    try {
        await html2pdf().set(opt).from(element).save();
    } catch (e) {
        console.error("PDF generation failed:", e);
        alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
        element.style.display = 'none';
    }
};

// [Init]
$(document).ready(async function () {
    if (await checkAuth()) {
        loadPage('dashboard');
    }
});
