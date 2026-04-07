import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { initExternalSharing } from './sharing_utils.js';
import { escapeHtml } from './utils.js';

// 수파베이스 클라이언트 초기화 통합
const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let currentPage = 1;
const itemsPerPage = 15;
let allBuyers = [];
let userMap = {};
let filteredBuyers = [];
let currentuser_id = null;
window.currentShareBuyerId = null;
let selectedReceivers = [];

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;
    currentuser_id = user_id;

    // Header profile and menu are now initialized globally by header_loader.js

    loadInitialData(user_id);

    $('#search-icon-btn').on('click', () => { currentPage = 1; applyFilters(); });
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) { currentPage = 1; applyFilters(); }
    });


    $(document).on('change', '.industry-checkbox, .status-checkbox, .visibility-checkbox', () => {
        currentPage = 1;
        applyFilters();
    });

    $('#reset-filters').on('click', function () {
        $('.industry-checkbox, .status-checkbox, .visibility-checkbox').prop('checked', false);
        $('#filter-min-price, #filter-max-price').val('');
        applyFilters();
    });

    $('#new-btn').on('click', () => { location.href = './dealbook_buyers.html?id=new&from=mybuyer'; });

    $('#export-csv-btn').on('click', exportToCSV);

    $(document).on('click', '.sort-option', function (e) {
        e.preventDefault();
        $('.sort-option').removeClass('active');
        $(this).addClass('active');
        $('#current-sort-label').text($(this).text());
        applySort($(this).data('sort'));
    });

    $('#btn-share-with-user-trigger').on('click', function () {
        const modalEl = document.getElementById('share-options-modal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        const shareModalEl = document.getElementById('share-modal');
        const shareModal = new bootstrap.Modal(shareModalEl);
        shareModal.show();
    });

    // 외부 공유 및 단순 URL 복사 초기화
    initExternalSharing('buyer', '#0d9488');
});


async function loadInitialData(user_id) {
    $('#buyer-list-container').html('<tr><td colspan="8" class="text-center py-5">데이터 로딩 중...</td></tr>');

    try {
        const [usersRes, buyersRes] = await Promise.all([
            _supabase.from('users').select('*'),
            _supabase.from('buyers').select('*').eq('user_id', user_id)
        ]);

        if (usersRes.error) throw usersRes.error;
        if (buyersRes.error) throw buyersRes.error;

        userMap = {};
        (usersRes.data || []).forEach(u => {
            userMap[u.id] = {
                name: u.name || "정보 없음",
                affiliation: u.company || 'DealChat',
                email: u.email || '',
                avatar: u.avatar_url || null
            };
        });

        allBuyers = buyersRes.data || [];
        updateFilterOptions();
        applyFilters();
    } catch (error) {
        console.error('Load Error:', error);
        $('#buyer-list-container').html('<tr><td colspan="8" class="text-center py-5 text-danger">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>');
    } finally {
        hideLoader();
    }
}

function getIndustryIcon(industry) {
    const iconMap = {
        'AI': 'smart_toy',
        'IT·정보통신': 'computer',
        'SaaS·솔루션': 'cloud',
        '게임': 'sports_esports',
        '공공·국방': 'policy',
        '관광·레저': 'beach_access',
        '교육·에듀테크': 'school',
        '금융·핀테크': 'payments',
        '농·임·어업': 'agriculture',
        '라이프스타일': 'person',
        '모빌리티': 'directions_car',
        '문화예술·콘텐츠': 'movie',
        '바이오·헬스케어': 'medical_services',
        '부동산': 'real_estate_agent',
        '뷰티·패션': 'content_cut',
        '에너지·환경': 'eco',
        '외식업·소상공인': 'restaurant',
        '우주·항공': 'rocket',
        '유통·물류': 'local_shipping',
        '제조·건설': 'factory',
        '플랫폼·커뮤니티': 'groups',
        '기타': 'person_search'
    };
    return iconMap[industry] || 'person_search';
}

function renderBuyers() {
    const container = $('#buyer-list-container');
    container.empty();

    if (filteredBuyers.length === 0) {
        container.html('<tr><td colspan="8" class="text-center py-5 text-muted">일치하는 매수자 정보가 없습니다.</td></tr>');
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = filteredBuyers.slice(startIndex, startIndex + itemsPerPage);

    const htmlParts = [];
    pageItems.forEach(buyer => {
        const d = new Date(buyer.updated_at || buyer.created_at);
        const date = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const authorData = userMap[buyer.user_id] || DEFAULT_MANAGER;
        
        const isDraft = buyer.is_draft || false;
        const rowHtml = `
            <tr onclick="showBuyerDetail('${buyer.id}')" style="cursor: pointer;">
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                        <div style="width: 36px; height: 36px; background: ${isDraft ? '#e2e8f0' : '#0d9488'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="color: ${isDraft ? '#94a3b8' : '#ffffff'}; font-size: 20px;">${getIndustryIcon(buyer.industry)}</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <span class="fw-bold text-truncate" style="display:block;font-size:14px;color:${isDraft ? '#94a3b8' : 'inherit'};">${escapeHtml(buyer.company_name || "이름 없음")}</span>
                            ${isDraft ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:600;color:#cbd5e1;margin-top:2px;"><span class="material-symbols-outlined" style="font-size:11px;">lock</span>비공개</span>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <span class="industry-tag-td" style="background: ${isDraft ? '#f1f5f9' : '#f0fdfa'}; color: ${isDraft ? '#94a3b8' : '#0d9488'}; border: 1px solid ${isDraft ? '#e2e8f0' : '#ccfbf1'};">${escapeHtml(buyer.industry || "기타")}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <div style="font-size: 13px; font-weight: 700; color: ${isDraft ? '#64748b' : '#000000'};">
                        ${buyer.available_funds ? buyer.available_funds + '억' : '-'}
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <span class="status-tag-td" style="background: ${isDraft ? '#f1f5f9' : '#f0fdfa'}; color: ${isDraft ? '#94a3b8' : '#0d9488'}; border: 1px solid ${isDraft ? '#e2e8f0' : '#ccfbf1'};">${escapeHtml(buyer.status || "대기")}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <div class="summary-td" style="${isDraft ? 'color: #cbd5e1;' : ''}">${escapeHtml(buyer.summary || "")}</div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;" data-user-id="${buyer.user_id}" class="author-cell-clickable" onclick="event.stopPropagation(); if (window.showProfileModal) { window.showProfileModal('${buyer.user_id}'); }">
                    <div class="author-td">
                        <img src="${resolveAvatarUrl(authorData.avatar || authorData.avatar_url, 1)}" class="author-avatar-sm">
                        <div class="author-info-wrap">
                            <div class="author-name-td" style="color: #000000; font-weight: 700;">${escapeHtml(authorData.name)}</div>
                            <div class="author-affiliation-td">${escapeHtml(authorData.affiliation)}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; font-size: 13px; color: #94a3b8; font-family: 'Outfit', sans-serif;">${date}</td>
                <td style="padding: 20px 24px !important;" onclick="event.stopPropagation();">
                    <button class="row-action-btn btn-hover-teal" onclick="window.openShareModal('${buyer.id}')"><span class="material-symbols-outlined" style="font-size: 18px;">share</span></button>
                </td>
            </tr>
        `;
        htmlParts.push(rowHtml);
    });
    container.html(htmlParts.join(''));
}

window.showBuyerDetail = function (id) {
    location.href = `./dealbook_buyers.html?id=${id}&from=mybuyer`;
};

window.openShareModal = function (buyerId) {
    window.currentShareBuyerId = buyerId;
    const buyer = allBuyers.find(b => String(b.id) === String(buyerId));
    if (!buyer) return;

    // 초기화
    selectedReceivers = [];
    const $container = $('#selected-users-container');
    const $input = $('#share-user-search');
    const $results = $('#user-search-results');

    $container.html('<span class="text-muted p-1" style="font-size: 13px;">이름으로 팀원을 검색하세요.</span>');
    $input.val('');
    $results.hide();
    $('#share-memo').val('');

    // 외부 공유용 입력 필드 초기화
    $('#ext-share-recipient').val('');
    $('#ext-share-org').val('');
    $('#ext-share-reason').val('');

    // Fetch files associated with the buyer's company
    const companyId = buyer.company_id || buyer.id;
    if (companyId) {
        fetchFiles(companyId);
    } else {
        $('#share-file-selection-list').html('<div class="text-muted p-1" style="font-size: 13px;">연결된 기업 정보가 없어 파일을 불러올 수 없습니다.</div>');
    }

    const modalEl = document.getElementById('share-options-modal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};


async function fetchFiles(companyId) {
    const $fileList = $('#share-file-selection-list');
    $fileList.html('<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');

    try {
        const { data, error } = await _supabase
            .from('files')
            .select('*')
            .eq('entity_id', companyId);

        if (error) throw error;

        $fileList.empty();
        if (!data || data.length === 0) {
            $fileList.html('<div class="text-muted p-1" style="font-size: 13px;">선택할 수 있는 파일이 없습니다.</div>');
            return;
        }

        data.forEach(file => {
            $fileList.append(`
                <div class="form-check mb-1">
                    <input class="form-check-input share-file-checkbox" type="checkbox" value="${file.id}" id="file-${file.id}">
                    <label class="form-check-label d-flex align-items-center gap-2" for="file-${file.id}" style="font-size: 13px; cursor: pointer;">
                        <span class="material-symbols-outlined" style="font-size: 16px; color: #64748b;">description</span>
                        <span class="text-truncate" style="max-width: 250px;">${escapeHtml(file.file_name || file.name)}</span>
                    </label>
                </div>
            `);
        });
    } catch (err) {
        console.error('Fetch Files Error:', err);
        $fileList.html('<div class="text-danger p-1" style="font-size: 13px;">파일을 불러오는 중 오류가 발생했습니다.</div>');
    }
}

function submitShare(buyerId, btnElement) {
    const memo = $('#share-memo').val().trim();
    if (selectedReceivers.length === 0) {
        alert('공유할 대상을 한 명 이상 선택해 주세요.');
        return;
    }
    const $btn = $(btnElement);
    const originalText = $btn.text();
    $btn.prop('disabled', true).text('전송 중...');

    const selectedFileIds = $('.share-file-checkbox:checked').map(function() {
        return $(this).val();
    }).get();

    const sharePromises = selectedReceivers.map(uid => {
        return APIcall({
            table: 'shares',
            action: 'create',
            item_type: 'buyer',
            item_id: buyerId,
            sender_id: currentuser_id,
            receiver_id: uid,
            memo: memo,
            file_ids: selectedFileIds,
            is_read: false
        }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }).then(res => res.json());
    });

    Promise.all(sharePromises).then(results => {
        const errors = results.filter(r => r.error);
        if (errors.length > 0) alert(`${errors.length}건의 공유 중 오류 발생.`);
        else {
            alert(`${selectedReceivers.length}명의 대상에게 공유되었습니다.`);
            bootstrap.Modal.getInstance(document.getElementById('share-modal')).hide();
        }
    }).catch(e => {
        console.error('Share Error', e);
        alert('공유 요청에 실패했습니다: ' + (e.message || '알 수 없는 오류'));
    }).finally(() => $btn.prop('disabled', false).text(originalText));
}

// Helper functions for user selection
function addSelectedUser(id, name) {
    if (selectedReceivers.includes(id)) return;
    selectedReceivers.push(id);
    renderSelectedTags();
}

function renderSelectedTags() {
    const $container = $('#selected-users-container');
    if (selectedReceivers.length === 0) {
        $container.html('<span class="text-muted p-1" style="font-size: 13px;">이름으로 팀원을 검색하세요.</span>');
        return;
    }
    $container.empty();
    selectedReceivers.forEach(uid => {
        const u = userMap[uid];
        const tag = $(`<span class="badge d-flex align-items-center gap-1 p-2" style="background: #eef2ff; color: #0d9488; border: 1px solid #0d9488; border-radius: 8px;">
            ${escapeHtml(u.name)} <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">close</span>
        </span>`);
        tag.find('span').on('click', () => {
            selectedReceivers = selectedReceivers.filter(x => x !== uid);
            renderSelectedTags();
        });
        $container.append(tag);
    });
}

// User search results click handler
$(document).on('click', '.user-search-item', function () {
    const user_id = $(this).data('id');
    const userName = $(this).data('name');
    addSelectedUser(user_id, userName);
    $('#share-user-search').val('');
    $('#user-search-results').hide();
});

$(document).on('click.userSearch', function (e) {
    if (!$(e.target).closest('.position-relative').length) {
        $('#user-search-results').hide();
    }
});

$('#btn-submit-share').on('click', function () {
    submitShare(window.currentShareBuyerId, this);
});

// User search input handler
$(document).on('input', '#share-user-search', function () {
    const query = $(this).val().trim().toLowerCase();
    const $results = $('#user-search-results');
    if (!query) {
        $results.hide();
        return;
    }

    const matches = Object.keys(userMap).filter(uid => {
        if (selectedReceivers.includes(uid)) return false;
        const user = userMap[uid];
        return user.name.toLowerCase().includes(query) || (user.affiliation && user.affiliation.toLowerCase().includes(query));
    });

    if (matches.length > 0) {
        $results.empty().show();
        matches.forEach(uid => {
            const user = userMap[uid];
            const item = $(`
                <div class="user-search-item p-2 border-bottom" style="cursor: pointer; transition: background 0.2s;">
                    <div class="fw-bold" style="font-size: 14px;">${escapeHtml(user.name)}</div>
                    <div class="text-muted" style="font-size: 12px;">${escapeHtml(user.affiliation || '')}</div>
                </div>
            `);
            $results.append(item);
        });
    } else {
        $results.html('<div class="p-3 text-muted text-center" style="font-size: 13px;">일치하는 추천 멤버가 없습니다.</div>').show();
    }
});


function renderPagination() {
    const container = $('#pagination-container');
    container.empty();
    const totalPages = Math.ceil(filteredBuyers.length / itemsPerPage);
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        container.append(`<button class="btn btn-sm btn-outline-teal ${active} mx-1" style="border-color: #0d9488; color: ${i === currentPage ? 'white' : '#0d9488'}; background-color: ${i === currentPage ? '#0d9488' : 'transparent'};" onclick="changePage(${i})">${i}</button>`);
    }
}

window.changePage = function (page) {
    currentPage = page;
    renderBuyers();
    renderPagination();
};

function updateFilterOptions() {
    const $list = $('#filter-industry-list');
    $list.empty();
    const industries = ["AI", "IT·정보통신", "SaaS·솔루션", "게임", "공공·국방", "관광·레저", "교육·에듀테크", "금융·핀테크", "농·임·어업", "라이프스타일", "모빌리티", "문화예술·콘텐츠", "바이오·헬스케어", "부동산", "뷰티·패션", "에너지·환경", "외식업·소상공인", "우주·항공", "유통·물류", "제조·건설", "플랫폼·커뮤니티", "기타"];
    industries.forEach(ind => {
        $list.append(`
            <div class="filter-item">
                <input type="checkbox" class="btn-check industry-checkbox" id="filter-ind-${ind}" value="${ind}" autocomplete="off">
                <label class="industry-checkbox-label" for="filter-ind-${ind}">${ind}</label>
            </div>
        `);
    });
}

function applyFilters() {
    const keyword = ($('#search-input').val() || "").toLowerCase();
    const industries = $('.industry-checkbox:checked').map(function() { return this.value; }).get();

    filteredBuyers = allBuyers.filter(b => {
        const matchesKeyword = !keyword || (b.company_name && b.company_name.toLowerCase().includes(keyword)) || (b.summary && b.summary.toLowerCase().includes(keyword));
        const matchesIndustry = industries.length === 0 || industries.includes(b.industry);
        return matchesKeyword && matchesIndustry;
    });

    applySort($('.sort-option.active').data('sort') || 'latest');
}

function applySort(type) {
    if (type === 'latest') {
        filteredBuyers.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    } else if (type === 'oldest') {
        filteredBuyers.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
    } else if (type === 'name_asc') {
        filteredBuyers.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "", 'ko-KR'));
    } else if (type === 'name_desc') {
        filteredBuyers.sort((a, b) => (b.company_name || "").localeCompare(a.company_name || "", 'ko-KR'));
    } else if (type === 'price_desc') {
        filteredBuyers.sort((a, b) => (parseFloat(String(b.available_funds || b.price).replace(/,/g, '')) || 0) - (parseFloat(String(a.available_funds || a.price).replace(/,/g, '')) || 0));
    } else if (type === 'price_asc') {
        filteredBuyers.sort((a, b) => (parseFloat(String(a.available_funds || a.price).replace(/,/g, '')) || 0) - (parseFloat(String(b.available_funds || b.price).replace(/,/g, '')) || 0));
    }
    
    currentPage = 1;
    renderBuyers();
    renderPagination();
}

function exportToCSV() {
    if (filteredBuyers.length === 0) { alert('데이터가 없습니다.'); return; }
    const headers = ['매수자명', '산업', '투자금액', '상태', '요약', '등록일'];
    const rows = filteredBuyers.map(b => [
        b.company_name || '',
        b.industry || '',
        b.price || '',
        b.status || '',
        b.summary || '',
        (() => { const d = new Date(b.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
    ].map(field => `"${String(field).replace(/"/g, '""')}"`));
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DealChat_Buyers_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
}
