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
let allSellers = [];
let userMap = {};
let filteredSellers = [];
let currentuser_id = null;
window.currentShareSellerId = null;
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


    $(document).on('change', '.industry-checkbox, .method-checkbox, .visibility-checkbox, .negotiable-checkbox', () => {
        currentPage = 1;
        applyFilters();
    });

    $('#reset-filters').on('click', function () {
        $('.industry-checkbox, .method-checkbox, .visibility-checkbox, .negotiable-checkbox').prop('checked', false);
        $('#filter-min-price, #filter-max-price').val('');
        applyFilters();
    });

    $('#new-btn').on('click', () => { location.href = './dealbook_sellers.html?id=new'; });

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

    // --- Share User Search Logic ---
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
        if (window.currentShareSellerId) {
            submitShareHandler({
                itemId: window.currentShareSellerId,
                itemType: 'seller',
                senderId: currentuser_id,
                selectedReceivers: selectedReceivers,
                btnElement: this,
                supabaseEndpoint: SUPABASE_ENDPOINT,
                onSuccess: () => {
                    alert(`${selectedReceivers.length}명의 팀원에게 공유되었습니다.`);
                    bootstrap.Modal.getInstance(document.getElementById('share-modal')).hide();
                }
            });
        }
    });

    // 외부 공유 및 단순 URL 복사 초기화
    initExternalSharing('seller', '#8b5cf6');
});

async function loadInitialData(user_id) {
    $('#seller-list-container').html('<tr><td colspan="8" class="text-center py-5">데이터 로딩 중...</td></tr>');

    try {
        userMap = await initUserMap(_supabase);

        const { data: sellers, error: sellersError } = await _supabase.from('sellers').select('*, companies(*)').eq('user_id', user_id);
        if (sellersError) throw sellersError;

        allSellers = (sellers || []).map(s => {
            const parsed = { ...s };
            parsed.company_name = s.company_name || s.name || s.companyName || (s.companies && s.companies.name) || "정보 없음";
             parsed.industry = s.industry || (s.companies && s.companies.industry) || "기타";
             parsed.summary = s.private_memo || s.summary || (s.companies && s.companies.summary) || "";
             return parsed;
        });

        updateFilterOptions();
        applyFilters();
    } catch (error) {
        console.error('Load Error:', error);
        $('#seller-list-container').html('<tr><td colspan="8" class="text-center py-5 text-danger">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>');
    } finally {
        hideLoader();
    }
}

function renderSellers() {
    const container = $('#seller-list-container');
    container.empty();

    if (filteredSellers.length === 0) {
        container.html('<tr><td colspan="8" class="text-center py-5 text-muted">일치하는 매도 정보가 없습니다.</td></tr>');
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = filteredSellers.slice(startIndex, startIndex + itemsPerPage);

    pageItems.forEach(seller => {
        const d = new Date(seller.updated_at || seller.created_at);
        const date = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const isDraft = seller.is_draft || false;
        const authorData = userMap[seller.user_id] || DEFAULT_MANAGER;
        const rowHtml = `
            <tr onclick="showSellerDetail('${seller.id}')" style="cursor: pointer;">
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                        <div style="width: 36px; height: 36px; background: ${isDraft ? '#e2e8f0' : '#8b5cf6'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="color: ${isDraft ? '#94a3b8' : '#ffffff'}; font-size: 20px;">${getIndustryIcon(seller.industry)}</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <span class="fw-bold text-truncate" style="display:block;font-size:14px;color:${isDraft ? '#94a3b8' : 'inherit'};">${escapeHtml(seller.company_name)}</span>
                            ${isDraft ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:600;color:#cbd5e1;margin-top:2px;"><span class="material-symbols-outlined" style="font-size:11px;">lock</span>비공개</span>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <span class="industry-tag-td" style="background: ${isDraft ? '#f1f5f9' : '#f5f3ff'}; color: ${isDraft ? '#94a3b8' : '#8b5cf6'}; border: 1px solid ${isDraft ? '#e2e8f0' : '#ddd6fe'};">${escapeHtml(seller.industry || "기타")}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <div style="font-size: 13px; font-weight: 700; color: ${isDraft ? '#64748b' : '#000000'};">
                        ${(seller.matching_price || seller.sale_price) ? ((seller.matching_price || seller.sale_price) === '협의' ? '협의' : (seller.matching_price || seller.sale_price) + '억') : '-'}
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                    <span class="status-tag-td" style="background: ${isDraft ? '#f1f5f9' : '#f5f3ff'}; color: ${isDraft ? '#94a3b8' : '#8b5cf6'}; border: 1px solid ${isDraft ? '#e2e8f0' : '#ddd6fe'};">${escapeHtml(seller.status || "대기")}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc;">
                     <div class="summary-td" style="color: #8b5cf6; font-weight: 500; ${isDraft ? 'color: #cbd5e1 !important;' : ''}">${escapeHtml(seller.private_memo || "-")}</div>
                 </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;" data-user-id="${seller.user_id}" class="author-cell-clickable" onclick="event.stopPropagation(); if (window.showProfileModal) { window.showProfileModal('${seller.user_id}'); }">
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
                    <button class="row-action-btn btn-hover-purple" onclick="window.openShareModal('${seller.id}')"><span class="material-symbols-outlined" style="font-size: 18px;">share</span></button>
                </td>
            </tr>
        `;
        container.append(rowHtml);
    });
}

window.showSellerDetail = function (id) {
    const $loader = $('#transition-loader');
    $loader.css('display', 'flex');
    setTimeout(() => {
        location.href = `./dealbook_sellers.html?id=${encodeURIComponent(id)}`;
    }, 600);
};

window.openShareModal = function (sellerId) {
    window.currentShareSellerId = sellerId;
    const seller = allSellers.find(s => String(s.id) === String(sellerId));
    if (!seller) return;

    // 초기화
    selectedReceivers = [];
    localRenderSelectedTags();
    const $input = $('#share-user-search');
    const $results = $('#user-search-results');

    $input.val('');
    $results.hide();
    $('#share-memo').val('');

    // 외부 공유용 입력 필드 초기화
    $('#ext-share-recipient').val('');
    $('#ext-share-org').val('');
    $('#ext-share-reason').val('');

    // Fetch files associated with the seller's company and the seller itself
    const companyId = seller.company_id || (seller.companies && seller.companies.id);
    fetchFiles({
        supabase: _supabase,
        entityType: 'seller',
        entityId: sellerId,
        companyId: companyId
    });

    const modalEl = document.getElementById('share-options-modal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
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

function localRenderSelectedTags() {
    renderSelectedTags({
        containerSelector: '#selected-users-container',
        selectedReceivers: selectedReceivers,
        userMap: userMap,
        theme: { bgColor: '#ede9fe', textColor: '#8b5cf6', borderColor: '#8b5cf6' },
        onRemove: (id) => {
            selectedReceivers = selectedReceivers.filter(uid => uid !== id);
            localRenderSelectedTags();
        }
    });
}

function applyFilters() {
    const keyword = ($('#search-input').val() || "").toLowerCase();
    const industries = $('.industry-checkbox:checked').map(function() { return this.value; }).get();
    const methods = $('.method-checkbox:checked').map(function() { return this.value; }).get();
    const selectedVis = $('.visibility-checkbox:checked').map(function() { return this.value; }).get();
    const negotiableOnly = $('.negotiable-checkbox').is(':checked');

    filteredSellers = allSellers.filter(s => {
        const matchesKeyword = !keyword || (s.company_name && s.company_name.toLowerCase().includes(keyword)) || (s.summary && s.summary.toLowerCase().includes(keyword));
        const matchesIndustry = industries.length === 0 || industries.includes(s.industry);
        const matchesMethod = methods.length === 0 || methods.includes(s.status);
        const matchesVis = selectedVis.length === 0 || selectedVis.some(v => {
            if (v === 'public') return !s.is_draft;
            if (v === 'private') return !!s.is_draft;
            return false;
        });
        const matchesNegotiable = !negotiableOnly || (s.matching_price && String(s.matching_price).includes('협의'));
        return matchesKeyword && matchesIndustry && matchesMethod && matchesVis && matchesNegotiable;
    });

    applySort($('.sort-option.active').data('sort') || 'latest');
}

function applySort(type) {
    if (type === 'latest') {
        filteredSellers.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    } else if (type === 'oldest') {
        filteredSellers.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
    } else if (type === 'name_asc') {
        filteredSellers.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "", 'ko-KR'));
    } else if (type === 'name_desc') {
        filteredSellers.sort((a, b) => (b.company_name || "").localeCompare(a.company_name || "", 'ko-KR'));
    } else if (type === 'price_desc') {
        filteredSellers.sort((a, b) => (parseFloat(String(b.matching_price || b.sale_price || 0).replace(/,/g, '')) || 0) - (parseFloat(String(a.matching_price || a.sale_price || 0).replace(/,/g, '')) || 0));
    } else if (type === 'price_asc') {
        filteredSellers.sort((a, b) => (parseFloat(String(a.matching_price || a.sale_price || 0).replace(/,/g, '')) || 0) - (parseFloat(String(b.matching_price || b.sale_price || 0).replace(/,/g, '')) || 0));
    }
    
    currentPage = 1;
    renderSellers();
    renderPagination({
        totalItems: filteredSellers.length,
        itemsPerPage: itemsPerPage,
        currentPage: currentPage,
        onPageChange: (p) => {
            currentPage = p;
            renderSellers();
        }
    });
}

function exportToCSV() {
    if (filteredSellers.length === 0) { alert('데이터가 없습니다.'); return; }
     const headers = ['매도자명', '산업', '희망가격', '상태', '비공개 메모', '등록일'];
     const rows = filteredSellers.map(s => [
        s.company_name || '',
        s.industry || '',
        s.matching_price || s.sale_price || '',
         s.status || '',
         s.private_memo || s.summary || '',
         (() => { const d = new Date(s.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
    ].map(field => `"${String(field).replace(/"/g, '""')}"`));
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DealChat_Sellers_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
}
