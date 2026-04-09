import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { initExternalSharing } from './sharing_utils.js';
import { escapeHtml } from './utils.js';
import { renderPagination } from './pagination_utils.js';
import { 
    getIndustryIcon, 
    addSelectedUser, 
    renderSelectedTags, 
    initShareUserSearch, 
    submitShareHandler, 
    fetchFiles,
    initUserMap
} from './my_list_utils.js';

// 수파베이스 클라이언트 초기화 통합
const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let currentPage = 1;
const itemsPerPage = 15;
let allCompanies = [];
let userMap = {};
let filteredCompanies = [];
let currentuser_id = null;
let currentSort = 'latest';

window.currentShareCompanyId = null;
let selectedReceivers = [];

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;
    currentuser_id = user_id;

    // Header profile and menu are now initialized globally by header_loader.js

    loadCompanies(user_id);

    $('#search-icon-btn').on('click', () => { currentPage = 1; applyFilters(); });
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) { currentPage = 1; applyFilters(); }
    });

    $(document).on('change', '.industry-checkbox, .mgmt-checkbox, .visibility-checkbox', () => {
        currentPage = 1;
        applyFilters();
    });

    $(document).on('change', '.stage-checkbox', function () {
        const clickedValue = $(this).val();
        if (clickedValue === 'all' && $(this).is(':checked')) {
            $('.stage-checkbox').not(this).prop('checked', false);
        } else if (clickedValue !== 'all') {
            $('#filter-stage-all').prop('checked', false);
        }
        currentPage = 1;
        applyFilters();
    });

    $('#reset-filters').on('click', function () {
        $('.industry-checkbox, .mgmt-checkbox, .visibility-checkbox, .stage-checkbox').prop('checked', false);
        $('#filter-min-revenue, #filter-max-revenue, #filter-min-investment, #filter-max-investment').val('');
        applyFilters();
    });

    $('#new-btn').on('click', () => {
        location.href = `./dealbook_companies.html?id=new`;
    });

    $('#filter-min-revenue, #filter-max-revenue, #filter-min-investment, #filter-max-investment').on('input', applyFilters);

    $(document).on('click', '.sort-option', function (e) {
        e.preventDefault();
        $('.sort-option').removeClass('active');
        $(this).addClass('active');
        $('#current-sort-label').text($(this).text());
        currentSort = $(this).data('sort');
        applyFilters();
    });

    $('#export-csv-btn').on('click', exportToCSV);

    // 외부 공유 및 단순 URL 복사 초기화
    initExternalSharing('company', '#1A73E8');

    // --- Share Logic ---
    initShareUserSearch({
        inputSelector: '#share-user-search',
        resultsSelector: '#user-search-results',
        userMap: userMap,
        getSelectedReceivers: () => selectedReceivers,
        onSelect: (id, name) => {
            selectedReceivers = addSelectedUser(selectedReceivers, id, name, () => localRenderSelectedTags());
        }
    });

    $('#btn-submit-share').on('click', function () {
        submitShareHandler({
            itemId: window.currentShareCompanyId,
            itemType: 'company',
            senderId: currentuser_id,
            selectedReceivers: selectedReceivers,
            btnElement: this,
            supabaseEndpoint: SUPABASE_ENDPOINT,
            onSuccess: () => {
                alert(`${selectedReceivers.length}명의 팀원에게 공유되었습니다.`);
                bootstrap.Modal.getInstance(document.getElementById('share-modal')).hide();
            }
        });
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

function localRenderSelectedTags() {
    renderSelectedTags({
        containerSelector: '#selected-users-container',
        selectedReceivers: selectedReceivers,
        userMap: userMap,
        theme: { bgColor: '#eef2ff', textColor: '#1A73E8', borderColor: '#e0e7ff' },
        onRemove: (id) => {
            selectedReceivers = selectedReceivers.filter(uid => uid !== id);
            localRenderSelectedTags();
        }
    });
}

async function loadCompanies(user_id) {
    if (!user_id) return;
    $('#company-list-container').html('<tr><td colspan="8" class="text-center py-5">데이터를 불러오는 중...</td></tr>');

    try {
        // 내 기업 정보 및 전체 사용자 정보 로드
        userMap = await initUserMap(_supabase);

        const { data: companies, error: companiesError } = await _supabase.from('companies').select('*').eq('user_id', user_id).is('deleted_at', null);
        if (companiesError) throw companiesError;

        allCompanies = companies || [];
        updateFilterOptions();
        applyFilters();
    } catch (error) {
        console.error('Load Error:', error);
        $('#company-list-container').html('<tr><td colspan="8" class="text-center py-5 text-danger">오류가 발생했습니다.</td></tr>');
    } finally {
        hideLoader();
    }
}

function getLatestMetrics(data) {
    const res = { revenue: { value: "-", year: "" }, investment: { value: "-", year: "" } };
    
    // 매출액: 가장 최근 연도의 매출액
    let finArr = [];
    if (data.financial_info) {
        if (Array.isArray(data.financial_info)) {
            // 구 형식 (배열)
            finArr = data.financial_info.map(item => ({ year: parseInt(item.year) || 0, value: item.revenue || 0 }));
        } else if (data.financial_info.years && data.financial_info.items) {
            // 새 형식 (객체)
            const revItem = data.financial_info.items.find(i => i.key === 'revenue');
            if (revItem) {
                finArr = data.financial_info.years.map(y => ({
                    year: parseInt(y) || 0,
                    value: revItem.values[y] || 0
                }));
            }
        }
    }

    if (finArr.length > 0) {
        const sorted = finArr.sort((a, b) => b.year - a.year);
        
        if (sorted.length > 0 && (sorted[0].value || sorted[0].value === 0)) {
            const revInWon = extractNumber(sorted[0].value);
            // 억 단위로 변환 (천만 단위 이하 절삭 후 소수점 첫째 자리까지)
            const revInBillion = Math.trunc(revInWon / 10000000) / 10;
            res.revenue.value = revInBillion > 0 ? revInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-';
            res.revenue.year = sorted[0].year > 0 ? sorted[0].year.toString() : '';
        }
    }

    // 누적투자금: 모든 연도의 투자금 합계 계산 + 가장 최근 단계 추출
    if (data.investment_info && Array.isArray(data.investment_info) && data.investment_info.length > 0) {
        let totalVal = 0;
        let hasData = false;
        
        const sortedInv = [...data.investment_info]
            .map(item => ({ year: parseInt(item.year) || 0, stage: item.stage || '', amount: item.amount || 0 }))
            .sort((a, b) => b.year - a.year);

        data.investment_info.forEach(item => {
            const val = extractNumber(item.amount || 0);
            if (val > 0) {
                totalVal += val;
                hasData = true;
            }
        });
        if (hasData) {
            // 천만 단위 이하 절삭
            const totalInBillion = Math.floor(totalVal / 10000000) / 10;
            res.investment.value = totalInBillion > 0 ? totalInBillion.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-';
            res.investment.year = sortedInv.length > 0 && sortedInv[0].stage ? sortedInv[0].stage : "누적";
        }
    }
    return res;
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
        
        $container.append(`<tr onclick="goToCompanyDetail('${c.id}')" style="cursor: pointer;">
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                    <div style="width: 36px; height: 36px; background: ${c.is_draft ? '#e2e8f0' : '#1A73E8'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <span class="material-symbols-outlined" style="color: ${c.is_draft ? '#94a3b8' : '#ffffff'}; font-size: 20px;">${getIndustryIcon(c.industry)}</span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <span class="fw-bold text-truncate" style="display:block;font-size:14px;color:${c.is_draft ? '#94a3b8' : 'inherit'};">${escapeHtml(c.company_name || c.name)}</span>
                        ${c.is_draft ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:600;color:#cbd5e1;margin-top:2px;"><span class="material-symbols-outlined" style="font-size:11px;">lock</span>비공개</span>` : ''}
                    </div>
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <span class="industry-tag-td" style="background: ${c.is_draft ? '#f1f5f9' : '#eff6ff'}; color: ${c.is_draft ? '#94a3b8' : '#1a73e8'}; border: 1px solid ${c.is_draft ? '#e2e8f0' : '#dbeafe'};">${escapeHtml((c.industry || "기타").replace(/^기타:\s*/, ''))}</span>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                <div style="font-size: 13px; font-weight: 500; color: ${c.is_draft ? '#94a3b8' : '#1e293b'};">
                    ${metrics.revenue.value !== '-' ? `<span style="color: ${c.is_draft ? '#94a3b8' : '#000000'}; font-weight: 700;">${metrics.revenue.value}억</span>` : '-'}
                    ${metrics.revenue.year ? `<div style="font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px;">${metrics.revenue.year}</div>` : ''}
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                <div style="font-size: 13px; font-weight: 500; color: ${c.is_draft ? '#94a3b8' : '#1e293b'};">
                    ${metrics.investment.value !== '-' ? `<span style="color: ${c.is_draft ? '#94a3b8' : '#000000'}; font-weight: 700;">${metrics.investment.value}억</span>` : '-'}
                    ${metrics.investment.year ? `<div style="font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px;">${metrics.investment.year}</div>` : ''}
                </div>
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                <div class="summary-td" style="color: ${c.is_draft ? '#94a3b8' : '#1A73E8'}; font-weight: 500;">${escapeHtml(c.private_memo || "-")}</div>
                ${c.mgmt_status ? `<div><span class="mgmt-status-badge border" style="background: ${c.is_draft ? '#f8fafc' : '#f0f7ff'}; color: ${c.is_draft ? '#94a3b8' : '#1A73E8'}; border-color: ${c.is_draft ? '#e2e8f0' : '#dbeafe'} !important;">#${escapeHtml(c.mgmt_status.replace(/\s+/g, ''))}</span></div>` : ''}
            </td>
            <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;" data-user-id="${c.user_id}" class="author-cell-clickable" onclick="event.stopPropagation(); if (window.showProfileModal) { window.showProfileModal('${c.user_id}'); }">
                <div class="author-td">
                    <img src="${resolveAvatarUrl(authorData.avatar || authorData.avatar_url, 1)}" class="author-avatar-sm" style="${c.is_draft ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
                    <div class="author-info-wrap">
                        <div class="author-name-td" style="font-weight: 700; ${c.is_draft ? 'color: #94a3b8;' : 'color: #000000;'}">${escapeHtml(authorData.name)}</div>
                        <div class="author-affiliation-td" style="margin-top: 2px; ${c.is_draft ? 'color: #cbd5e1;' : ''}">${escapeHtml(authorData.affiliation)}</div>
                    </div>
                </div>
            </td>
            <td class="date-td" style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; text-align: left !important; font-size: 13px; color: ${c.is_draft ? '#cbd5e1' : '#94a3b8'}; font-family: 'Outfit', sans-serif;">${date}</td>
            <td style="padding: 20px 24px !important;" onclick="event.stopPropagation();">
                <button class="row-action-btn btn-hover-blue" onclick="window.openShareOptions('${c.id}')"><span class="material-symbols-outlined" style="font-size: 18px;">share</span></button>
            </td>
        </tr>`);
    });
}
window.goToCompanyDetail = function (id) {
    const $loader = $('#transition-loader');
    $loader.css('display', 'flex');
    setTimeout(() => {
        location.href = `./dealbook_companies.html?id=${encodeURIComponent(id)}`;
    }, 600);
};

window.openShareOptions = function (id) {
    window.currentShareCompanyId = id;
    selectedReceivers = [];
    localRenderSelectedTags();
    $('#share-memo').val('');
    fetchFiles({
        supabase: _supabase,
        entityType: 'company',
        entityId: id
    });
    const modalEl = document.getElementById('share-options-modal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

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
    const keyword = ($('#search-input').val() || "").toLowerCase();
    const selectedIndustries = $('.industry-checkbox:checked').map(function() { return this.value; }).get();
    const selectedMgmt = $('.mgmt-checkbox:checked').map(function() { return this.value; }).get();
    const selectedStages = $('.stage-checkbox:checked').map(function() { return this.value; }).get();
    const selectedVis = $('.visibility-checkbox:checked').map(function() { return this.value; }).get();
    
    const minRev = parseFloat($('#filter-min-revenue').val()) || -Infinity;
    const maxRev = parseFloat($('#filter-max-revenue').val()) || Infinity;
    const minInv = parseFloat($('#filter-min-investment').val()) || -Infinity;
    const maxInv = parseFloat($('#filter-max-investment').val()) || Infinity;

    filteredCompanies = allCompanies.filter(c => {
        const matchesKeyword = !keyword || 
            (c.company_name && c.company_name.toLowerCase().includes(keyword)) ||
            (c.name && c.name.toLowerCase().includes(keyword)) ||
            (c.industry && c.industry.toLowerCase().includes(keyword)) ||
            (c.summary && c.summary.toLowerCase().includes(keyword));
        if (!matchesKeyword) return false;

        const companyIndustry = c.industry || "기타";
        const matchesInd = selectedIndustries.length === 0 || selectedIndustries.some(ind => {
            if (ind === '기타') return companyIndustry === '기타' || companyIndustry.startsWith('기타: ');
            return companyIndustry === ind;
        });
        if (!matchesInd) return false;

        const matchesMgmt = selectedMgmt.length === 0 || (c.mgmt_status && selectedMgmt.some(m => {
            const normalizedStatus = c.mgmt_status.replace(/\s+/g, '');
            const normalizedMatch = m.replace(/\s+/g, '');
            return normalizedStatus === normalizedMatch;
        }));
        if (!matchesMgmt) return false;

        // Visibility match - public (!is_draft), private (is_draft)
        const matchesVis = selectedVis.length === 0 || selectedVis.some(v => {
            if (v === 'public') return !c.is_draft;
            if (v === 'private') return !!c.is_draft;
            return false;
        });
        if (!matchesVis) return false;

        // Investment Stage match - Bypass if 'all' is selected or nothing is selected
        if (selectedStages.length > 0 && !selectedStages.includes('all')) {
            const latestStage = getLatestStage(c);
            const matchesStage = selectedStages.some(s => matchStageFilter(latestStage, s));
            if (!matchesStage) return false;
        }
        
        const metrics = getLatestMetrics(c);
        const revVal = extractNumber(metrics.revenue.value);
        const invVal = extractNumber(metrics.investment.value);
        
        return revVal >= minRev && revVal <= maxRev && invVal >= minInv && invVal <= maxInv;
    });

    applySort(currentSort);
}

function applySort(type) {
    if (type === 'latest') {
        filteredCompanies.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    } else if (type === 'oldest') {
        filteredCompanies.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
    } else if (type === 'name_asc') {
        filteredCompanies.sort((a, b) => (a.company_name || a.name || "").localeCompare(b.company_name || b.name || "", 'ko-KR'));
    } else if (type === 'name_desc') {
        filteredCompanies.sort((a, b) => (b.company_name || b.name || "").localeCompare(b.company_name || b.name || "", 'ko-KR'));
    } else if (type === 'revenue_desc') {
        filteredCompanies.sort((a, b) => (parseFloat(getLatestMetrics(b).revenue.value.replace(/,/g, '')) || 0) - (parseFloat(getLatestMetrics(a).revenue.value.replace(/,/g, '')) || 0));
    } else if (type === 'revenue_asc') {
        filteredCompanies.sort((a, b) => (parseFloat(getLatestMetrics(a).revenue.value.replace(/,/g, '')) || 0) - (parseFloat(getLatestMetrics(b).revenue.value.replace(/,/g, '')) || 0));
    } else if (type === 'investment_desc') {
        filteredCompanies.sort((a, b) => (parseFloat(getLatestMetrics(b).investment.value.replace(/,/g, '')) || 0) - (parseFloat(getLatestMetrics(a).investment.value.replace(/,/g, '')) || 0));
    } else if (type === 'investment_asc') {
        filteredCompanies.sort((a, b) => (parseFloat(getLatestMetrics(a).investment.value.replace(/,/g, '')) || 0) - (parseFloat(getLatestMetrics(b).investment.value.replace(/,/g, '')) || 0));
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
        }
    });
}

function getLatestStage(company) {
    if (company.investment_info && Array.isArray(company.investment_info) && company.investment_info.length > 0) {
        const sorted = [...company.investment_info]
            .map(item => ({ year: parseInt(item.year) || 0, stage: (item.stage || '').trim() }))
            .sort((a, b) => b.year - a.year);
        if (sorted.length > 0 && sorted[0].stage) return sorted[0].stage;
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

function exportToCSV() {
    if (filteredCompanies.length === 0) { alert('데이터가 없습니다.'); return; }
    const headers = ['기업명', '산업', '매출액(억)', '누적투자금(억)', '비공개 메모', '등록일'];
    const rows = filteredCompanies.map(c => {
        const metrics = getLatestMetrics(c);
        const memo = (c.private_memo || "").replace(/\n/g, ' ');
        const date = (() => { const d = new Date(c.updated_at || c.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })();
        return [
            c.company_name || c.name, c.industry || "기타", 
            metrics.revenue.value || '0', metrics.investment.value || '0', 
            memo, date
        ].map(f => `"${String(f).replace(/"/g, '""')}"`);
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DealChat_MyCompanies_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

