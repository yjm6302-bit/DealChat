import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { initExternalSharing } from './sharing_utils.js';
import { debounce, escapeHtml } from './utils.js';
import { renderPagination } from './pagination_utils.js';

// 프로필 모달 스크립트 로드
const script = document.createElement('script');
script.src = '../js/profile_modal.js';
document.head.appendChild(script);

// Supabase 클라이언트 초기화
const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;
const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let currentPage = 1;
const itemsPerPage = 15;
let allCompanies = [];
let filteredCompanies = [];
let userMap = {};
let currentuser_id = null;

let currentSort = 'latest'; // 'latest', 'name', 'revenue', 'investment'

// Inbox state
let inboxItems = []; // Received
let currentInboxSort = 'newest';
let selectedInboxItems = new Set();
window.currentShareCompanyId = null;
let selectedReceivers = [];

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    currentuser_id = userData.id;

    // Header profile and menu are now initialized globally by header_loader.js

    loadInitialData();

    // --- Search & Filters ---
    $('#search-icon-btn').on('click', () => { applyFilters(); });
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) { applyFilters(); }
    });


    $(document).on('change', '.industry-checkbox, .mgmt-checkbox, .visibility-checkbox', () => {
        applyFilters();
    });

    // Stage filter with "전체" toggle logic
    $(document).on('change', '.stage-checkbox', function () {
        const clickedValue = $(this).val();
        if (clickedValue === 'all' && $(this).is(':checked')) {
            $('.stage-checkbox').not(this).prop('checked', false);
        } else if (clickedValue !== 'all') {
            $('#filter-stage-all').prop('checked', false);
        }
        applyFilters();
    });

    $('#filter-min-revenue, #filter-max-revenue, #filter-min-investment, #filter-max-investment').on('input', debounce(applyFilters, 300));

    $('#reset-filters').on('click', function () {
        $('.industry-checkbox, .mgmt-checkbox, .stage-checkbox').prop('checked', false);
        $('#filter-min-revenue, #filter-max-revenue, #filter-min-investment, #filter-max-investment').val('');
        applyFilters();
    });

    // --- Sorting ---
    $('.sort-option').on('click', function (e) {
        e.preventDefault();
        const sortType = $(this).data('sort');
        currentSort = sortType;
        $('#current-sort-label').text($(this).text());
        $('.sort-option').removeClass('active');
        $(this).addClass('active');
        applyFilters();
    });

    // --- Export ---
    $('#export-csv-btn').on('click', exportToCSV);

    // 외부 공유 및 단순 URL 복사 초기화
    initExternalSharing('company', '#1A73E8');

    // --- Inbox & Share ---



    $(document).on('click', '.inbox-sort-option', function(e) {
        e.preventDefault();
        currentInboxSort = $(this).data('sort');
        $('#current-inbox-sort').text($(this).text());
        $('.inbox-sort-option').removeClass('active');
        $(this).addClass('active');
        renderInbox();
    });

    $(document).on('change', '.item-checkbox', function(e) {
        e.stopPropagation();
        const val = $(this).val();
        if ($(this).is(':checked')) selectedInboxItems.add(val);
        else selectedInboxItems.delete(val);
        updateInboxControls();
    });

    $(document).on('change', '#inbox-select-all', function(e) {
        e.stopPropagation();
        const isChecked = $(this).is(':checked');
        const items = inboxItems;
        selectedInboxItems.clear();
        if (isChecked) items.forEach(item => selectedInboxItems.add(item.id));
        $('.item-checkbox').prop('checked', isChecked);
        updateInboxControls();
    });

    $('#btn-delete-inbox').on('click', async function() {
        const count = selectedInboxItems.size;
        if (count === 0) return;
        if (confirm(`선택하신 ${count}개의 공유 내역을 수함에서 삭제하시겠습니까?`)) {
            const arr = Array.from(selectedInboxItems);
            await Promise.all(arr.map(id => {
                // 물리적 삭제 대신 논리적 삭제(receiver_deleted = true) 진행
                return APIcall({ table: 'shares', action: 'update', id: id, receiver_deleted: true }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
                    .catch(e => console.error('Delete fail', e));
            }));
            inboxItems = inboxItems.filter(item => !selectedInboxItems.has(item.id));
            selectedInboxItems.clear();
            updateInboxBadge();
            renderInbox();
            alert('삭제되었습니다.');
        }
    });

    // --- Share Logic ---
    $('#share-user-search').on('input', function() {
        const keyword = $(this).val().toLowerCase().trim();
        const $results = $('#user-search-results');
        if (!keyword) { $results.hide(); return; }
        const matches = Object.entries(userMap)
            .filter(([id, u]) => u.name.toLowerCase().includes(keyword) || (u.affiliation && u.affiliation.toLowerCase().includes(keyword)))
            .slice(0, 10);
        if (matches.length === 0) { $results.hide(); return; }
        $results.empty().show();
        matches.forEach(([id, u]) => {
            $results.append(`<div class="p-3 border-bottom user-search-item" style="cursor: pointer; transition: background 0.2s;" data-id="${id}" data-name="${u.name}">
                <div class="fw-bold" style="font-size: 14px; color: #1e293b;">${escapeHtml(u.name)}</div>
                <div style="font-size: 11px; color: #64748b;">${escapeHtml(u.affiliation)}</div>
            </div>`);
        });
    });

    $(document).on('click', '.user-search-item', function() {
        const user_id = $(this).data('id');
        const userName = $(this).data('name');
        addSelectedUser(user_id, userName);
        $('#share-user-search').val('');
        $('#user-search-results').hide();
    });

    $('#btn-submit-share').on('click', async function () {
        if (selectedReceivers.length === 0) { alert('공유할 타인을 한 명 이상 선택해 주세요.'); return; }
        const memo = $('#share-memo').val().trim();
        const btn = this;
        $(btn).prop('disabled', true).text('전송 중...');
        const selectedFileIds = [];
        $('.share-file-checkbox:checked').each(function() {
            selectedFileIds.push($(this).val());
        });

        const sharePromises = selectedReceivers.map(uid => {
            return APIcall({
                table: 'shares',
                action: 'create',
                item_type: 'company',
                item_id: shareTargetCompanyId,
                sender_id: currentuser_id,
                receiver_id: uid,
                memo: memo,
                file_ids: selectedFileIds,
                is_read: false
            }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }).then(res => res.json());
        });
        Promise.all(sharePromises).then(results => {
            const errs = results.filter(r => r.error);
            if (errs.length > 0) alert(`${errs.length}건의 공유 중 오류 발생.`);
            else {
                alert(`${selectedReceivers.length}명의 팀원에게 공유되었습니다.`);
                bootstrap.Modal.getInstance(document.getElementById('share-modal')).hide();
                fetchInbox(); // 인박스 갱신 (보낸 내역 확인용)
            }
        }).catch(e => {
            console.error('Share Error', e);
            alert('공유 요청 실패: ' + (e.message || '알 수 없는 오류'));
        }).finally(() => $(btn).prop('disabled', false).text('보내기'));
    });

    $('#btn-share-with-user-trigger').on('click', function () {
        const modalEl = document.getElementById('share-options-modal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        const shareModalEl = document.getElementById('share-modal');
        const shareModal = new bootstrap.Modal(shareModalEl);
        shareModal.show();
    });
});

async function fetchFiles(companyId) {
    const $fileList = $('#share-file-selection-list');
    $fileList.html('<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');

    try {
        const { data, error } = await _supabase
            .from('files')
            .select('*')
            .eq('entity_type', 'company')
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

function addSelectedUser(id, name) {
    if (selectedReceivers.includes(id)) return;
    selectedReceivers.push(id);
    renderSelectedTags();
}

function renderSelectedTags() {
    const $container = $('#selected-users-container');
    if (selectedReceivers.length === 0) {
        $container.html('<span class="text-muted p-1" style="font-size: 13px;">이름으로 대상을 검색하세요.</span>');
        return;
    }
    $container.empty();
    selectedReceivers.forEach(uid => {
        const u = userMap[uid];
        const tag = $(`<span class="badge d-flex align-items-center gap-1 p-2" style="background: #eef2ff; color: #1A73E8; border: 1px solid #e0e7ff; border-radius: 8px;">
            ${escapeHtml(u.name)} <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">close</span>
        </span>`);
        tag.find('span').on('click', () => {
            selectedReceivers = selectedReceivers.filter(x => x !== uid);
            renderSelectedTags();
        });
        $container.append(tag);
    });
}

async function loadInitialData() {
    $('#company-list-container').html('<tr><td colspan="8" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">데이터를 불러오는 중...</div></td></tr>');
    
    try {
        const [{ data: users, error: uError }, { data: companies, error: cError }] = await Promise.all([
            _supabase.from('users').select('*'),
            _supabase.from('companies').select('*').is('deleted_at', null)
        ]);

        if (uError) throw uError;
        if (cError) throw cError;

        userMap = {};
        if (Array.isArray(users)) {
            users.forEach(u => { 
                userMap[u.id] = { 
                    name: u.name || "정보 없음", 
                    affiliation: u.company || 'DealChat',
                    email: u.email || '',
                    avatar: u.avatar_url || u.avatar || null
                }; 
            });
        }
        allCompanies = Array.isArray(companies) ? companies.map(parseCompanyData).sort((a, b) => {
            const dateA = new Date(b.updated_at || b.created_at || 0);
            const dateB = new Date(a.updated_at || a.created_at || 0);
            return dateA - dateB;
        }) : [];
        updateFilterOptions();
        applyFilters();
    } catch (err) {
        console.error('Load Error:', err);
        $('#company-list-container').html('<tr><td colspan="8" class="text-center py-5 text-danger">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>');
    } finally {
        hideLoader();
        $('#transition-loader').hide();
    }
}

function fetchInbox() {
    if (!currentuser_id) return;
    const rPayload = { table: 'shares', action: 'get', receiver_id: currentuser_id, receiver_deleted: false };
    APIcall(rPayload, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
    .then(res => res.json())
    .then(rData => {
        inboxItems = (Array.isArray(rData) ? rData : rData?.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        updateInboxBadge();
    }).catch(e => console.error('Inbox Error', e));
}

function updateInboxBadge() {
    const unread = inboxItems.filter(i => !i.is_read).length;
    const $badge = $('#inbox-badge');
    if (unread > 0) $badge.text(unread > 99 ? '99+' : unread).show();
    else $badge.hide();
}

function updateFilterOptions() {
    const $list = $('#filter-industry-list');
    const selected = $('.industry-checkbox:checked').map(function () { return this.value; }).get();
    const categories = ["AI", "IT·정보통신", "SaaS·솔루션", "게임", "공공·국방", "관광·레저", "교육·에듀테크", "금융·핀테크", "농축산·어업", "라이프스타일", "모빌리티", "문화예술·콘텐츠", "바이오·헬스케어", "부동산", "뷰티·패션", "에너지·환경", "외식·중소상공인", "우주·항공", "유통·물류", "제조·건설", "플랫폼·커뮤니티", "기타"];
    $list.empty();
    categories.forEach(ind => {
        const isChecked = selected.includes(ind) ? 'checked' : '';
        $list.append(`<div class="filter-item">
            <input type="checkbox" class="btn-check industry-checkbox" id="filter-ind-${ind}" value="${ind}" ${isChecked} autocomplete="off">
            <label class="industry-checkbox-label" for="filter-ind-${ind}">${ind}</label>
        </div>`);
    });
}

function applyFilters() {
    const selectedIndustries = $('.industry-checkbox:checked').map(function () { return this.value; }).get();
    const selectedMgmt = $('.mgmt-checkbox:checked').map(function () { return this.value; }).get();
    const selectedStages = $('.stage-checkbox:checked').map(function () { return this.value; }).get();
    
    const minRev = parseFloat($('#filter-min-revenue').val()) || -Infinity;
    const maxRev = parseFloat($('#filter-max-revenue').val()) || Infinity;
    const minInv = parseFloat($('#filter-min-investment').val()) || -Infinity;
    const maxInv = parseFloat($('#filter-max-investment').val()) || Infinity;
    
    const keyword = ($('#search-input').val() || "").trim().toLowerCase();

    filteredCompanies = allCompanies.filter(company => {
        const isPublic = !company.is_draft;

        // [중요] 공개된 것만 보여주기
        if (!isPublic) return false;

        const metrics = getLatestMetrics(company);
        const revVal = extractNumber(metrics.revenue.value);
        const invVal = extractNumber(metrics.investment.value);

        // Keyword match
        const matchesKeyword = !keyword ||
            (company.company_name && company.company_name.toLowerCase().includes(keyword)) ||
            (company.industry && company.industry.toLowerCase().includes(keyword)) ||
            (company.summary && company.summary.toLowerCase().includes(keyword));
        if (!matchesKeyword) return false;

        // Industry match
        const companyIndustry = company.industry || "기타";
        const matchesIndustry = selectedIndustries.length === 0 || selectedIndustries.some(ind => {
            if (ind === '기타') return companyIndustry === '기타' || companyIndustry.startsWith('기타: ');
            return companyIndustry === ind;
        });
        if (!matchesIndustry) return false;

        // Management Status match
        const companyMgmt = company.mgmt_status || "";
        const matchesMgmt = selectedMgmt.length === 0 || (companyMgmt && selectedMgmt.some(m => {
            const normalizedStatus = companyMgmt.replace(/\s+/g, '');
            const normalizedMatch = m.replace(/\s+/g, '');
            if (normalizedMatch === '기타') return !['발굴기업', '보육기업', '투자기업'].includes(normalizedStatus);
            return normalizedStatus === normalizedMatch;
        }));
        if (!matchesMgmt) return false;

        // Investment Stage match - Bypass if 'all' is selected or nothing is selected
        if (selectedStages.length > 0 && !selectedStages.includes('all')) {
            const latestStage = getLatestStage(company);
            const matchesStage = selectedStages.some(s => matchStageFilter(latestStage, s));
            if (!matchesStage) return false;
        }
        
        const matchesRev = revVal >= minRev && revVal <= maxRev;
        const matchesInv = invVal >= minInv && invVal <= maxInv;

        return matchesRev && matchesInv;
    });

    // Sort
    if (currentSort === 'latest') {
        filteredCompanies.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    } else if (currentSort === 'oldest') {
        filteredCompanies.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
    } else if (currentSort === 'name_asc') {
        filteredCompanies.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "", 'ko-KR'));
    } else if (currentSort === 'name_desc') {
        filteredCompanies.sort((a, b) => (b.company_name || "").localeCompare(a.company_name || "", 'ko-KR'));
    } else if (currentSort === 'revenue_desc') {
        filteredCompanies.sort((a, b) => extractNumber(getLatestMetrics(b).revenue.value) - extractNumber(getLatestMetrics(a).revenue.value));
    } else if (currentSort === 'revenue_asc') {
        filteredCompanies.sort((a, b) => extractNumber(getLatestMetrics(a).revenue.value) - extractNumber(getLatestMetrics(b).revenue.value));
    } else if (currentSort === 'investment_desc') {
        filteredCompanies.sort((a, b) => extractNumber(getLatestMetrics(b).investment.value) - extractNumber(getLatestMetrics(a).investment.value));
    } else if (currentSort === 'investment_asc') {
        filteredCompanies.sort((a, b) => extractNumber(getLatestMetrics(a).investment.value) - extractNumber(getLatestMetrics(b).investment.value));
    }

    currentPage = 1;
    renderCompanies();
    renderPagination({
        totalItems: filteredCompanies.length,
        itemsPerPage: itemsPerPage,
        currentPage: currentPage,
        onPageChange: (p) => {
            currentPage = p;
            renderCompanies();
        },
        scrollToSelector: '.search-and-actions'
    });
}

function renderCompanies() {
    const $container = $('#company-list-container');
    $container.empty();
    if (filteredCompanies.length === 0) { $container.html('<tr><td colspan="8" class="text-center py-5 text-muted">일치하는 기업 정보가 없습니다.</td></tr>'); return; }
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, filteredCompanies.length);
    const items = filteredCompanies.slice(start, end);

    items.forEach(c => {
        const d = new Date(c.updated_at || c.created_at);
        const date = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const authorData = userMap[c.user_id] || DEFAULT_MANAGER;
        const metrics = getLatestMetrics(c);
        
        $container.append(`<tr onclick="showCompanyDetail('${c.id}')" style="cursor: pointer;">
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                    <div style="width: 36px; height: 36px; background: #1A73E8; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <span class="material-symbols-outlined" style="color: #ffffff; font-size: 20px;">${getIndustryIcon(c.industry)}</span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <span class="fw-bold text-truncate" style="display: block; font-size: 14px;">${escapeHtml(c.company_name)}</span>
                    </div>
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <span class="industry-tag-td" style="background: #eff6ff; color: #1a73e8; border: 1px solid #dbeafe;">${escapeHtml((c.industry || "기타").replace(/^기타:\s*/, ''))}</span>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                <div style="font-size: 13px; font-weight: 500; color: #1e293b;">
                    ${metrics.revenue.value !== '-' ? `<span style="color: #000000; font-weight: 700;">${metrics.revenue.value}억</span>` : '-'}
                    ${metrics.revenue.year ? `<div style="font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px;">${metrics.revenue.year}</div>` : ''}
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                <div style="font-size: 13px; font-weight: 500; color: #1e293b;">
                    ${metrics.investment.value !== '-' ? `<span style="color: #000000; font-weight: 700;">${metrics.investment.value}억</span>` : '-'}
                    ${metrics.investment.year ? `<div style="font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px;">${metrics.investment.year}</div>` : ''}
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <div class="summary-td">${escapeHtml(c.summary)}</div>
                ${c.mgmt_status ? `<div><span class="mgmt-status-badge border" style="background: #f0f7ff; color: #1A73E8; border: 1px solid #dbeafe;">#${escapeHtml(c.mgmt_status.replace(/\s+/g, ''))}</span></div>` : ''}
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important; cursor: pointer;" onclick="event.stopPropagation(); showProfileModal('${c.user_id}')">
                <div class="author-td">
                    <img src="${resolveAvatarUrl(authorData.avatar, 1)}" class="author-avatar-sm" style="flex-shrink: 0;">
                    <div class="author-info-wrap">
                        <div class="author-name-td" style="color: #000000; font-weight: 700;">${escapeHtml(authorData.name)}</div>
                        <div class="author-affiliation-td" style="margin-top: 2px;">${escapeHtml(authorData.affiliation)}</div>
                    </div>
                </div>
            </td>
            <td class="date-td" style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; text-align: left !important; font-size: 13px; color: #94a3b8; font-family: 'Outfit', sans-serif;">${date}</td>
            <td style="padding: 20px 24px !important;" onclick="event.stopPropagation();">
                <button class="row-action-btn" onclick="window.openShareOptions('${c.id}')"><span class="material-symbols-outlined" style="font-size: 18px;">share</span></button>
            </td>
        </tr>`);
    });
}

window.showCompanyDetail = function (id) {
    const c = allCompanies.find(x => x.id === id);
    if (!c) return;
    const authorData = userMap[c.user_id] || DEFAULT_MANAGER;
    const d_reg = new Date(c.created_at);
    const dateStr = `등록일: ${d_reg.getFullYear()}.${String(d_reg.getMonth()+1).padStart(2,'0')}.${String(d_reg.getDate()).padStart(2,'0')}`;

    $('#detail-company-icon').text(getIndustryIcon(c.industry));
    $('#detail-company-name').text(c.company_name);
    $('#detail-company-summary').text(c.summary);

    // 핵심 지표 주입
    const metrics = getLatestMetrics(c);
    $('#detail-company-revenue').text(metrics.revenue.value !== '-' ? metrics.revenue.value + '억' : '-');
    $('#detail-company-investment').text(metrics.investment.value !== '-' ? metrics.investment.value + '억' : '-');

    const indContainer = $('#detail-industry-container').empty();
    if (c.industry) indContainer.append(`<span class="badge bg-primary bg-opacity-10 text-primary px-3 py-2 rounded-pill" style="font-weight: 600; font-size: 13px; color: #1A73E8 !important; background-color: rgba(26, 115, 232, 0.1) !important;">#${escapeHtml(c.industry)}</span>`);

    const createdDate = new Date(c.created_at);
    const updatedDate = c.updated_at ? new Date(c.updated_at) : null;
    const d_detail = (updatedDate && updatedDate.getTime() !== createdDate.getTime()) ? updatedDate : createdDate;
    const dateDisplay = (updatedDate && updatedDate.getTime() !== createdDate.getTime())
        ? `최종 수정: ${d_detail.getFullYear()}.${String(d_detail.getMonth()+1).padStart(2,'0')}.${String(d_detail.getDate()).padStart(2,'0')} ${String(d_detail.getHours()).padStart(2,'0')}:${String(d_detail.getMinutes()).padStart(2,'0')}`
        : `등록일: ${d_detail.getFullYear()}.${String(d_detail.getMonth()+1).padStart(2,'0')}.${String(d_detail.getDate()).padStart(2,'0')} ${String(d_detail.getHours()).padStart(2,'0')}:${String(d_detail.getMinutes()).padStart(2,'0')}`;

    const authorDisplayName = authorData.name || DEFAULT_MANAGER.name;
    $('#detail-author-name').text(authorDisplayName);
    const authorSubInfo = authorData.affiliation || 'DealChat';
    $('#detail-author-affiliation').text(authorSubInfo);
    
    $('#detail-modified-date').text(dateDisplay);

    const avatarUrl = resolveAvatarUrl(authorData.avatar || authorData.avatar_url, 1);
    $('#detail-author-avatar').attr('src', avatarUrl);

    // 상세 모달 작성자 클릭 비활성화 (요청에 따라 제거)
    $('#detail-author-info-box').css('cursor', 'default').off('click');
    $('#detail-author-name').css('color', '#1e293b').css('font-weight', '700');

    $('#btn-go-to-dealbook').off('click').on('click', () => {
        const $loader = $('#transition-loader');
        $loader.css('display', 'flex'); // Show loading overlay
        
        setTimeout(() => {
            location.href = `./dealbook_companies.html?id=${encodeURIComponent(id)}&from=totalstartup`;
        }, 600);
    });

    bootstrap.Modal.getOrCreateInstance(document.getElementById('company-detail-modal')).show();
};

window.openShareOptions = function (id) {
    window.currentShareCompanyId = id;
    selectedReceivers = [];
    renderSelectedTags();
    $('#share-memo').val('');
    fetchFiles(id);
    const modalEl = document.getElementById('share-options-modal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

function submitShare(companyId, btnElement) {
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
            item_type: 'company',
            item_id: companyId,
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
        alert('공유 실패: ' + (e.message || '알 수 없는 오류'));
    }).finally(() => $btn.prop('disabled', false).text(originalText));
}

$(document).on('click', '#btn-submit-share', function () {
    submitShare(window.currentShareCompanyId, this);
});

window.handleInboxClick = function (shareId, companyId, event) {
    if ($(event.target).is('input[type="checkbox"]')) return;
    const item = inboxItems.find(i => i.id === shareId);
    if (item && !item.is_read) {
        item.is_read = true;
        updateInboxBadge();
        renderInbox();
        APIcall({ table: 'shares', action: 'update', id: shareId, is_read: true }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' });
    }
    bootstrap.Modal.getInstance(document.getElementById('inbox-modal')).hide();
    setTimeout(() => { if (allCompanies.find(c => c.id === companyId)) showCompanyDetail(companyId); else alert('데이터를 찾을 수 없습니다.'); }, 300);
};

function renderInbox() {
    const $list = $('#inbox-list').empty();
    let items = [...inboxItems];

    items.sort((a, b) => {
        const dA = new Date(a.created_at);
        const dB = new Date(b.created_at);
        if (currentInboxSort === 'oldest') return dA - dB;
        if (currentInboxSort === 'status') return a.is_read === b.is_read ? dB - dA : (a.is_read ? 1 : -1);
        return dB - dA;
    });

    updateInboxControls();

    if (items.length === 0) { $list.append(`<div class="text-center text-muted py-5">공유받은 내역이 없습니다.</div>`); return; }

    items.forEach(item => {
        const otherId = item.sender_id;
        const other = userMap[otherId] || { name: '정보 없음' };
        const company = allCompanies.find(c => c.id === item.company_id) || { company_name: '삭제된 기업', industry: '기타' };
        const date = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const check = selectedInboxItems.has(item.id) ? 'checked' : '';
        const statusHtml = item.is_read ? '<span style="color: #cbd5e1; font-size: 12px;">확인완료</span>' : '<span class="badge" style="background: #1A73E8; font-size: 11px;">미확인</span>';

        $list.append(`<div class="inbox-row d-flex align-items-center px-3 py-3 mb-2" style="border-radius: 16px; border: 1px solid #eef2f6; background: ${!item.is_read ? '#f5faff' : '#ffffff'}; cursor: pointer;" onclick="handleInboxClick('${item.id}', '${item.company_id}', event)">
            <div style="width: 5%;" class="text-center" onclick="event.stopPropagation();"><input class="form-check-input item-checkbox" type="checkbox" value="${item.id}" ${check}></div>
            <div style="width: 30%;" class="d-flex align-items-center gap-2">
                <div style="width: 32px; height: 32px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">${getIndustryIcon(company.industry)}</span></div>
                <div class="text-truncate fw-bold" style="font-size: 14px;">${escapeHtml(company.company_name)}</div>
            </div>
            <div style="width: 20%;" class="d-flex align-items-center gap-2">
                <img src="${resolveAvatarUrl(other.avatar || other.avatar_url, 1)}" style="width: 24px; height: 24px; border-radius: 50%;">
                <div class="text-truncate" style="font-size: 13px;">${escapeHtml(other.name)}</div>
            </div>
            <div style="width: 25%; font-size: 13px; color: #94a3b8;">${date}</div>
            <div style="width: 20%;" class="text-center">${statusHtml}</div>
        </div>`);
    });
}

function updateInboxControls() {
    const items = inboxItems;
    $('#header-target-label').text('보낸 사람');
    $('#header-date-label').text('수신일시');
    const count = selectedInboxItems.size;
    $('#selected-count').text(count);
    $('#btn-delete-inbox').prop('disabled', count === 0);
    $('#inbox-select-all').prop('disabled', items.length === 0).prop('checked', items.length > 0 && count === items.length);
}


function parseCompanyData(company) {
    const parsed = { ...company };
    
    // [Resilience] Handle Id / id, Industry / industry, Name / name etc.
    // Supabase sometimes returns capitalized keys depending on how it was created
    parsed.id = company.id || company.Id || company.ID;
    parsed.company_name = company.name || company.Name || company.company_name || company.companyName || "정보 없음";
    parsed.user_id = company.user_id || company.User_id || company.user_id || company.user_id || null;
    parsed.industry = company.industry || company.Industry || company.interest_industry || '기타';

    if (!company.summary) {
        return parsed;
    }
    const company_nameText = company.summary;
    try {
        let mainSummary = ""; let metaText = "";
        if (company_nameText.includes('[상세 정보]')) {
            const parts = company_nameText.split('[상세 정보]');
            mainSummary = parts[0].trim(); metaText = parts[1] || "";
        } else {
            const metaKeywords = ["관리현황:", "발굴 경로:", "투자 유무:", "투자 밸류:", "투자 금액:", "대표자명:", "이메일:", "설립일자:", "주소:", "투자 현황:", "재무 현황:", "재무 분석:", "담당자 메모:", "담당자 의견:"];
            let firstIndex = -1;
            metaKeywords.forEach(kw => {
                const idx = company_nameText.indexOf(kw);
                if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) firstIndex = idx;
            });
            if (firstIndex !== -1) { mainSummary = company_nameText.substring(0, firstIndex).trim(); metaText = company_nameText.substring(firstIndex); }
            else { mainSummary = company_nameText; metaText = ""; }
        }
        parsed.summary = mainSummary.replace(/^(\[.*?\]|#\S+)\s*/, '').trim();
        if (metaText) {
            const mgmtMatch = metaText.match(/관리\s*현황\s*:\s*(.*)/); if (mgmtMatch) parsed.mgmt_status = mgmtMatch[1].split('\n')[0].trim();
            const invStatusMatch = metaText.match(/투자\s*현황\s*:\s*((?:.|\n)*?)(?=(관리현황:|발굴 경로:|투자 유무:|투자 밸류:|투자 금액:|대표자명:|이메일:|설립일자:|주소:|재무 현황:|재무 분석:|담당자 메모:|담당자 의견:|$))/); if (invStatusMatch) parsed.investmentStatusDesc = invStatusMatch[1].trim();
            const finStatusMatch = metaText.match(/재무\s*현황\s*:\s*((?:.|\n)*?)(?=(관리현황:|발굴 경로:|투자 유무:|투자 밸류:|투자 금액:|대표자명:|이메일:|설립일자:|주소:|투자 현황:|재무 분석:|담당자 메모:|담당자 의견:|$))/); if (finStatusMatch) parsed.financialStatusDesc = finStatusMatch[1].trim();
            const amountMatch = metaText.match(/투자\s*금액\s*:\s*(.*)/); if (amountMatch) parsed.investmentAmount = amountMatch[1].split('\n')[0].trim();
        }
    } catch (e) { console.error('Error parsing company summary in Total Companies:', e); }

    // [New Schema Support] DB에서 직접 데이터(JSONB 배열)가 있으면 우선
    if (Array.isArray(company.financial_info) && company.financial_info.length > 0) parsed.financialDataArr = company.financial_info;
    if (Array.isArray(company.investment_info) && company.investment_info.length > 0) parsed.investmentDataArr = company.investment_info;
    if (company.mgmt_status) parsed.mgmt_status = company.mgmt_status;
    if (company.manager_memo) parsed.managerMemo = company.manager_memo;
    if (company.ceo_name) parsed.ceoName = company.ceo_name;
    if (company.establishment_date) parsed.establishmentDate = company.establishment_date;
    if (company.address) parsed.companyAddress = company.address;
    if (company.email) parsed.companyEmail = company.email;

    return parsed;
}

function getLatestMetrics(data) {
    const res = { revenue: { value: "-", year: "" }, investment: { value: "-", year: "" } };

    // Helper: 각 줄의 데이터를 객체로 변환
    const parseLineToObj = (line) => {
        const obj = {};
        if (!line) return obj;
        line.split(/,\s+/).forEach(part => {
            const colonIdx = part.indexOf(':');
            if (colonIdx !== -1) {
                const key = part.substring(0, colonIdx).trim();
                const val = part.substring(colonIdx + 1).trim();
                obj[key] = val;
            }
        });
        return obj;
    };

    // 매출액: 가장 최근 연도의 매출액
    if (data.financialDataArr && Array.isArray(data.financialDataArr) && data.financialDataArr.length > 0) {
        const sorted = data.financialDataArr
            .map(item => ({ year: parseInt(item.year) || 0, value: item.revenue || item.sales || 0 }))
            .sort((a, b) => b.year - a.year);
        
        if (sorted.length > 0 && (sorted[0].value || sorted[0].value === 0)) {
            const revInWon = extractNumber(sorted[0].value);
            // 억 단위로 변환
            const revInBillion = Math.trunc(revInWon / 10000000) / 10;
            res.revenue.value = revInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
            res.revenue.year = sorted[0].year > 0 ? sorted[0].year.toString() : '';
        }
    } else if (data.financialStatusDesc) {
        const lines = data.financialStatusDesc.split(/\r?\n/).filter(l => l.trim());
        const sortedLines = lines.map(line => {
            const obj = parseLineToObj(line);
            return { year: parseInt(obj['연도']) || 0, data: obj };
        }).sort((a, b) => b.year - a.year);

        if (sortedLines.length > 0) {
            const top = sortedLines[0];
            const revValue = top.data['매출액'];
            if (revValue || revValue === 0) {
                const revInWon = extractNumber(revValue);
                const revInBillion = Math.trunc(revInWon / 10000000) / 10;
                res.revenue.value = revInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                res.revenue.year = top.year > 0 ? top.year.toString() : '';
            }
        }
    }

    // 누적투자금: 모든 연도의 투자금 합계 계산 + 가장 최근 단계 추출
    if (data.investmentDataArr && Array.isArray(data.investmentDataArr) && data.investmentDataArr.length > 0) {
        let totalVal = 0;
        let hasData = false;
        
        // 최근 단계 추출을 위해 연도별 정렬
        const sortedInv = [...data.investmentDataArr]
            .map(item => ({ year: parseInt(item.year) || 0, stage: item.stage || '', amount: item.amount || 0 }))
            .sort((a, b) => b.year - a.year);

        data.investmentDataArr.forEach(item => {
            const val = extractNumber(item.amount || 0);
            if (val > 0) {
                totalVal += val;
                hasData = true;
            }
        });
        if (hasData) {
            // 천만 단위 이하 절삭
            const totalInBillion = Math.floor(totalVal / 10000000) / 10;
            res.investment.value = totalInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
            res.investment.year = sortedInv.length > 0 && sortedInv[0].stage ? sortedInv[0].stage : "누적";
        }
    } else if (data.investmentStatusDesc) {
        const lines = data.investmentStatusDesc.split(/\r?\n/).filter(l => l.trim());
        let totalVal = 0;
        let hasData = false;
        
        const parsedLines = lines.map(line => {
            const obj = parseLineToObj(line);
            return { year: parseInt(obj['연도']) || 0, stage: obj['투자단계'] || '', amount: obj['금액'] || 0 };
        }).sort((a, b) => b.year - a.year);

        lines.forEach(line => {
            const obj = parseLineToObj(line);
            if (obj['금액']) {
                totalVal += extractNumber(obj['금액']);
                hasData = true;
            }
        });
        if (hasData) {
            // 천만 단위 이하 절삭
            const totalInBillion = Math.floor(totalVal / 10000000) / 10;
            res.investment.value = totalInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
            res.investment.year = parsedLines.length > 0 && parsedLines[0].stage ? parsedLines[0].stage : "누적";
        }
    }

    if (res.investment.value === '-' && data.investmentAmount) res.investment.value = data.investmentAmount;
    return res;
}

// 가장 최근 투자 단계를 추출하는 헬퍼 함수
function getLatestStage(company) {
    if (company.investmentDataArr && Array.isArray(company.investmentDataArr) && company.investmentDataArr.length > 0) {
        const sorted = [...company.investmentDataArr]
            .map(item => ({ year: parseInt(item.year) || 0, stage: (item.stage || '').trim() }))
            .sort((a, b) => b.year - a.year);
        if (sorted.length > 0 && sorted[0].stage) return sorted[0].stage;
    }
    if (company.investmentStatusDesc) {
        const lines = company.investmentStatusDesc.split(/\r?\n/).filter(l => l.trim());
        const parsed = lines.map(line => {
            const obj = {};
            line.split(/,\s+/).forEach(part => {
                const ci = part.indexOf(':');
                if (ci !== -1) obj[part.substring(0, ci).trim()] = part.substring(ci + 1).trim();
            });
            return { year: parseInt(obj['연도']) || 0, stage: obj['투자단계'] || '' };
        }).sort((a, b) => b.year - a.year);
        if (parsed.length > 0 && parsed[0].stage) return parsed[0].stage;
    }
    return '';
}

function matchStageFilter(actualStage, filterValue) {
    if (!actualStage) return false;
    const s = actualStage.toLowerCase().replace(/\s+/g, '');
    const f = filterValue.toLowerCase().replace(/\s+/g, '');
    if (s === f) return true;
    switch (f) {
        case 'seed': return s.includes('seed') || s.includes('시드');
        case 'pre-a': return s.includes('pre-a') || s.includes('pre a') || s.includes('프리a') || s.includes('프리에이');
        case 'seriesa': return (s.includes('series') || s.includes('시리즈')) && s.includes('a') && !s.includes('pre') && !s.includes('프리');
        case 'seriesb+': return (s.includes('series') || s.includes('시리즈')) && /[bcd]/.test(s);
        case 'm&a': return s.includes('m&a') || s.includes('인수') || s.includes('합병');
        case 'ipo': return s.includes('ipo');
        default: return s.includes(f);
    }
}

function extractNumber(str) {
    if (!str || str === '-') return 0;
    const sanitized = String(str).replace(/,/g, '');
    const match = sanitized.match(/-?[0-9.]+/);
    return match ? parseFloat(match[0]) : 0;
}

function getIndustryIcon(ind) {
    const map = { 'AI': 'smart_toy', 'IT·정보통신': 'computer', 'SaaS·솔루션': 'cloud', '게임': 'sports_esports', '공공·국방': 'policy', '관광·레저': 'beach_access', '교육·에듀테크': 'school', '금융·핀테크': 'payments', '농축산·어업': 'agriculture', '라이프스타일': 'person', '모빌리티': 'directions_car', '문화예술·콘텐츠': 'movie', '바이오·헬스케어': 'medical_services', '부동산': 'real_estate_agent', '뷰티·패션': 'content_cut', '에너지·환경': 'eco', '외식·중소상공인': 'restaurant', '우주·항공': 'rocket', '유통·물류': 'local_shipping', '제조·건설': 'factory', '플랫폼·커뮤니티': 'groups' };
    return map[ind] || 'corporate_fare';
}

function exportToCSV() {
    if (filteredCompanies.length === 0) { alert('데이터가 없습니다.'); return; }
    const headers = ['기업명', '산업', '매출액(억)', '누적투자금(억)', '요약', '담당자', '등록일'];
    const rows = filteredCompanies.map(c => {
        const metrics = getLatestMetrics(c);
        const summary = (c.summary || "").replace(/\n/g, ' ');
        return [
            c.company_name, c.industry, metrics.revenue.value || '0', metrics.investment.value || '0', summary,
            userMap[c.user_id]?.name || '미상', (() => { const d = new Date(c.updated_at || c.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
        ].map(f => `"${String(f).replace(/"/g, '""')}"`);
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DealChat_TotalStartupHub_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
