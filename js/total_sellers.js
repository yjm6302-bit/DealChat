import { checkAuth, updateHeaderProfile, initUserMenu, hideLoader, resolveAvatarUrl, DEFAULT_MANAGER } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { initExternalSharing } from './sharing_utils.js';
import { debounce, escapeHtml, applyKeywordsMasking } from './utils.js';

// 프로필 모달 스크립트 로드
const script = document.createElement('script');
script.src = '../js/profile_modal.js';
document.head.appendChild(script);

const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let currentPage = 1;
const itemsPerPage = 8;
let allSellers = [];
let filteredSellers = [];
let userMap = {};
let currentuser_id = null;
let currentUserData = null;
window.currentShareSellerId = null;
let selectedReceivers = [];
let signedNdaIds = []; // Supabase에서 가져온 NDA 체결 ID 목록

// ==========================================
// NDA 체결 상태 관리
// ==========================================
function getSignedNdas() {
    try {
        const userId = currentuser_id || 'anonymous';
        const stored = localStorage.getItem(`dealchat_signed_ndas_sellers_${userId}`);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveSignedNda(sellerId) {
    const signed = getSignedNdas();
    const strId = String(sellerId);
    if (!signed.includes(strId)) {
        signed.push(strId);
        const userId = currentuser_id || 'anonymous';
        localStorage.setItem(`dealchat_signed_ndas_sellers_${userId}`, JSON.stringify(signed));
    }
}

$(document).ready(function () {
    currentUserData = checkAuth();
    if (!currentUserData) return;
    const user_id = currentUserData.id;
    currentuser_id = user_id;

    // Header profile and menu are now initialized globally by header_loader.js

    loadInitialData();

    // ==========================================
    // Event Handlers
    // ==========================================

    // Search
    $('#search-icon-btn').on('click', () => { currentPage = 1; loadSellers(); });
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) { currentPage = 1; loadSellers(); }
    });

    // Filter Toggle

    // Filter Change Events
    $(document).on('change', '.industry-checkbox, .method-checkbox, .visibility-checkbox, #include-negotiable', () => {
        currentPage = 1;
        applyFilters();
    });
    $('#filter-min-price, #filter-max-price').on('input', debounce(() => {
        currentPage = 1;
        applyFilters();
    }, 300));

    // Reset Filters
    $('#reset-filters').on('click', function () {
        $('.industry-checkbox, .method-checkbox, .visibility-checkbox').prop('checked', false);
        $('#include-negotiable').prop('checked', true);
        $('#filter-min-price, #filter-max-price').val('');
        applyFilters();
    });

    // Sort Options
    $(document).on('click', '.sort-option', function (e) {
        e.preventDefault();
        $('.sort-option').removeClass('active');
        $(this).addClass('active');
        const label = $(this).text();
        $('#current-sort-label').text(label);
        const sortType = $(this).data('sort');
        applySort(sortType);
    });

    // CSV Export
    $('#export-csv-btn').on('click', exportToCSV);

    // 외부 공유 및 단순 URL 복사 초기화
    initExternalSharing('seller', '#8b5cf6');

    // Share Search
    $('#share-user-search').on('input', function () {
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

    $(document).on('click', '.user-search-item', function () {
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
                item_type: 'seller',
                item_id: currentShareSellerId,
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

    // 외부 공유 초기화
    initExternalSharing('seller', '#8b5cf6');
});


// ==========================================
// Data Loading
// ==========================================

function loadInitialData() {
    $('#seller-list-container').html('<div class="col-12 text-center py-5"><div class="spinner-border" role="status" style="color: #8b5cf6 !important;"><span class="visually-hidden">Loading...</span></div></div>');
    Promise.all([
        _supabase.from('users').select('*'),
        _supabase.from('sellers').select('*, companies(*)'),
        _supabase.from('nda_logs').select('item_id').eq('user_id', currentuser_id).eq('item_type', 'seller')
    ]).then(([usersRes, sellersRes, ndasRes]) => {
        if (usersRes.error) throw usersRes.error;
        if (sellersRes.error) throw sellersRes.error;
        
        // NDA 서명 목록 저장
        signedNdaIds = (ndasRes.data || []).map(n => String(n.item_id));
        const users = usersRes.data || [];
        const sellers = sellersRes.data || [];
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
        allSellers = Array.isArray(sellers) ? sellers.map(parseSellerData).sort((a, b) => {
            const dateA = new Date(b.updated_at || b.created_at || 0);
            const dateB = new Date(a.updated_at || a.created_at || 0);
            return dateA - dateB;
        }) : [];
        updateFilterOptions();
        applyFilters();
        renderPagination();
    }).catch(error => {
        console.error('Initial Load Error:', error);
        $('#seller-list-container').html('<div class="col-12 text-center py-5 text-danger">데이터를 불러오는 중 오류가 발생했습니다.</div>');
    }).finally(() => {
        hideLoader();
    });
}

function fetchUsers() {
    return APIcall({ action: 'get', table: 'users' }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
        .then(res => res.json());
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
        '농축수산·어업': 'agriculture',
        '라이프스타일': 'person',
        '모빌리티': 'directions_car',
        '문화예술·콘텐츠': 'movie',
        '바이오·헬스케어': 'medical_services',
        '부동산': 'real_estate_agent',
        '뷰티·패션': 'content_cut',
        '에너지·환경': 'eco',
        '외식·음료·소상공인': 'restaurant',
        '우주·항공': 'rocket',
        '유통·물류': 'local_shipping',
        '제조·건설': 'factory',
        '플랫폼·커뮤니티': 'groups',
        '기타': 'person_search'
    };
    return iconMap[industry] || 'person_search';
}

function fetchSellers() {
    return _supabase.from('sellers').select('*, companies(*)');
}

function loadSellers() {
    fetchSellers()
        .then(res => {
            const data = res?.data || res;
            if (data.error) throw new Error(data.error);
            allSellers = Array.isArray(data) ? data.map(parseSellerData).sort((a, b) => {
                const dateA = new Date(b.updated_at || b.created_at || 0);
                const dateB = new Date(a.updated_at || a.created_at || 0);
                return dateA - dateB;
            }) : [];
            updateFilterOptions();
            applyFilters();
            renderPagination();
        })
        .catch(error => {
            console.error('Reload Error:', error);
            $('#seller-list-container').html('<div class="col-12 text-center py-5 text-danger">데이터를 불러오는 중 오류가 발생했습니다.</div>');
        });
}

function parseSellerData(s) {
    if (!s) return null;
    const parsed = { ...s };
    parsed.company_name = s.name || s.company_name || s.companyName || (s.companies && s.companies.name) || "정보 없음";
    parsed.user_id = s.user_id || s.user_id || null;
    parsed.industry = s.industry || (s.companies && s.companies.industry) || '기타';
    parsed.summary = s.summary || (s.companies && s.companies.summary) || "";
    parsed.matching_price = s.matching_price || s.sale_price || null;

    // Status mapping (resilience)
    if (parsed.status) {
        const validStatuses = ['대기', '진행중', '완료'];
        if (!validStatuses.includes(parsed.status)) {
            // Mapping English or other values to Korean if needed
            if (parsed.status === 'pending' || parsed.status === 'waiting') parsed.status = '대기';
            else if (parsed.status === 'ongoing' || parsed.status === 'progress') parsed.status = '진행중';
            else if (parsed.status === 'completed' || parsed.status === 'done') parsed.status = '완료';
            else parsed.status = '대기';
        }
    } else {
        parsed.status = '대기';
    }
    return parsed;
}

// ==========================================
// Rendering
// ==========================================

function renderSellers() {
    const container = $('#seller-list-container');
    container.empty();

    if (filteredSellers.length === 0) {
        container.html('<tr><td colspan="8" class="text-center py-5 text-muted">일치하는 매도자 정보가 없습니다.</td></tr>');
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredSellers.length);
    const pageItems = filteredSellers.slice(startIndex, endIndex);

    const signedNdas = getSignedNdas();

    pageItems.forEach(seller => {
        const createdDate = new Date(seller.created_at || Date.now());
        const updatedDate = seller.updated_at ? new Date(seller.updated_at) : null;
        const d = (updatedDate && updatedDate.getTime() !== createdDate.getTime()) ? updatedDate : createdDate;
        const dateDisplay = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

        const authorData = userMap[seller.user_id] || DEFAULT_MANAGER;
        
        const status = seller.status || '대기';
        const isRestricted = (status === '진행중' || status === '완료');
        
        const statusStyle = isRestricted 
            ? "background: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0;" 
            : "background: #f5f3ff; color: #8b5cf6; border: 1px solid #ddd6fe;";
            
        const industryStyle = isRestricted 
            ? "background: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0;" 
            : "background: #f5f3ff; color: #8b5cf6; border: 1px solid #ddd6fe;";

        const isOwner = String(seller.user_id) === String(currentuser_id);
        const isSigned = signedNdaIds.includes(String(seller.id)) || signedNdas.includes(String(seller.id));
        const isAuthorized = isOwner || isSigned;

        let displayName = isAuthorized ? seller.company_name : '비공개';
        let displaySummary = seller.summary || "";

        // 식별정보 블라인드 적용 (NDA 체결 이후에도 보호)
        if (seller.is_blind_active && seller.blind_keywords) {
            displaySummary = applyKeywordsMasking(displaySummary, seller.blind_keywords);
            if (isAuthorized) {
                displayName = applyKeywordsMasking(displayName, seller.blind_keywords);
            }
        }

        // 구 버전 마스킹 (NDA 미체결 시 기업명 가리기)
        if (!isAuthorized && seller.company_name) {
            const escapedName = seller.company_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const nameRegex = new RegExp(escapedName, 'gi');
            displaySummary = displaySummary.replace(nameRegex, 'OOO');
        }

        const isPriceNegotiable = !seller.matching_price || seller.matching_price === '협의';
        const priceDisplay = isPriceNegotiable ? (seller.matching_price || '협의') : `${seller.matching_price}억`;
        const priceColor = isRestricted ? "#94a3b8" : "#000000";

        const rowHtml = `
            <tr onclick="showSellerDetail('${seller.id}')" style="cursor: pointer; ${isRestricted ? 'background-color: #fbfcfd;' : ''}">
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                        <div class="company-icon-square" style="width: 36px; height: 36px; background: ${isRestricted ? '#cbd5e1' : '#8b5cf6'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 10px rgba(139, 92, 246, ${isRestricted ? '0.1' : '0.2'});">
                            <span class="material-symbols-outlined" style="color: #ffffff; font-size: 20px;">${!isAuthorized ? 'lock' : getIndustryIcon(seller.industry)}</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            ${!isAuthorized
                                ? isRestricted
                                    ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:3px 10px;white-space:nowrap;"><span class="material-symbols-outlined" style="font-size:14px;">lock</span>NDA 필요</span>`
                                    : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#8b5cf6;background:#f5f3ff;border:1px solid #8b5cf633;border-radius:8px;padding:3px 10px;white-space:nowrap;"><span class="material-symbols-outlined" style="font-size:14px;">lock</span>NDA 필요</span>`
                                : `<span class="fw-bold text-truncate" style="display: block; font-size: 14px; ${isRestricted ? 'color: #94a3b8;' : 'color: #1e293b;'}">${escapeHtml(displayName)}</span>`
                            }
                        </div>
                    </div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <span class="industry-tag-td" style="white-space: nowrap; ${industryStyle}">${escapeHtml(seller.industry)}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <span style="font-weight: 700; color: ${priceColor}; font-size: 14px;">${priceDisplay}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <span class="status-tag-td" style="font-weight: 600; font-size: 12px; padding: 4px 10px; border-radius: 6px; ${statusStyle}">${escapeHtml(status)}</span>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important;">
                    <div class="summary-td">${escapeHtml(displaySummary)}</div>
                </td>
                <td style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important; overflow: hidden; cursor: pointer;" onclick="event.stopPropagation(); showProfileModal('${seller.user_id}')">
                    <div class="author-td" style="${isRestricted ? 'color: #94a3b8;' : ''}">
                        <img src="${resolveAvatarUrl(authorData.avatar, 1)}" alt="Avatar" class="author-avatar-sm" style="${isRestricted ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
                        <div class="author-info-wrap">
                            <div class="author-name-td" style="color: #000000; font-weight: 700; ${isRestricted ? 'color: #94a3b8;' : ''}">${escapeHtml(authorData.name)}</div>
                            <div class="author-affiliation-td" style="${isRestricted ? 'color: #cbd5e1;' : ''}">${escapeHtml(authorData.affiliation)}</div>
                        </div>
                    </div>
                </td>
                <td class="date-td" style="padding: 20px 24px !important; border-right: 1px solid #f8fafc; vertical-align: middle !important; font-size: 13px; color: #94a3b8; font-family: 'Outfit', sans-serif;">${dateDisplay}</td>
                <td style="padding: 20px 24px !important; text-align: center !important; vertical-align: middle !important; white-space: nowrap;" onclick="event.stopPropagation();">
                    ${(isRestricted || !isAuthorized) ? '' : `
                    <button class="row-action-btn" style="margin-left: 0;" title="매도자 공유하기" onclick="openShareModal('${seller.id}')">
                        <span class="material-symbols-outlined" style="font-size: 18px;">share</span>
                    </button>
                    `}
                </td>
            </tr>
        `;
        container.append(rowHtml);
    });
}

// ==========================================
// Detail Modal
// ==========================================

window.showSellerDetail = function (id) {
    const seller = allSellers.find(s => String(s.id) === String(id));
    if (!seller) return;

    const authorData = userMap[seller.user_id] || DEFAULT_MANAGER;
    const createdDate = new Date(seller.created_at || Date.now());
    const updatedDate = seller.updated_at ? new Date(seller.updated_at) : null;
    const d_detail = (updatedDate && updatedDate.getTime() !== createdDate.getTime()) ? updatedDate : createdDate;
    const dateDisplay = (updatedDate && updatedDate.getTime() !== createdDate.getTime())
        ? `최종 수정: ${d_detail.getFullYear()}.${String(d_detail.getMonth()+1).padStart(2,'0')}.${String(d_detail.getDate()).padStart(2,'0')} ${String(d_detail.getHours()).padStart(2,'0')}:${String(d_detail.getMinutes()).padStart(2,'0')}`
        : `등록일: ${d_detail.getFullYear()}.${String(d_detail.getMonth()+1).padStart(2,'0')}.${String(d_detail.getDate()).padStart(2,'0')} ${String(d_detail.getHours()).padStart(2,'0')}:${String(d_detail.getMinutes()).padStart(2,'0')}`;

    const isOwner = String(seller.user_id) === String(currentuser_id);
    const localSigned = getSignedNdas();
    const isSigned = signedNdaIds.includes(String(seller.id)) || localSigned.includes(String(seller.id));
    const isAuthorized = isOwner || isSigned;

    let displayName = isAuthorized ? seller.company_name : '비공개';
    let displaySummary = seller.summary || "";
    let memo = seller.manager_memo || seller.managerMemo || "";

    // 식별정보 블라인드 적용 (NDA 체결 이후에도 보호)
    if (seller.is_blind_active && seller.blind_keywords) {
        displaySummary = applyKeywordsMasking(displaySummary, seller.blind_keywords);
        if (isAuthorized) {
            displayName = applyKeywordsMasking(displayName, seller.blind_keywords);
            if (memo) memo = applyKeywordsMasking(memo, seller.blind_keywords);
        }
    }

    // 구 버전 마스킹 (NDA 미체결 시 기업명 가리기)
    if (!isAuthorized && seller.company_name) {
        const escapedName = seller.company_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(escapedName, 'gi');
        displaySummary = displaySummary.replace(nameRegex, 'OOO');
    }

    const isPriceNegotiable = !seller.matching_price || seller.matching_price === '협의';
    const priceDisplay = isPriceNegotiable ? (seller.matching_price || '정보 없음') : `${seller.matching_price}억`;

    const status = seller.status || '대기';
    const isRestricted = (status === '진행중' || status === '완료');

    $('#detail-seller-icon').text(getIndustryIcon(seller.industry));
    $('#detail-seller-name').text(displayName);
    $('#detail-seller-price').text(priceDisplay);
    $('#detail-seller-status').text(status);
    
    $('#detail-seller-summary').css('filter', 'none');
    $('#detail-seller-memo').css('filter', 'none');
    $('#btn-go-to-dealbook').prop('disabled', false).css({'opacity': '1', 'background': '#8b5cf6'}).text('자세히 보기');

    if (isRestricted) {
        $('#detail-seller-summary').text(displaySummary);
        $('#detail-seller-memo').parent().hide();
        $('#btn-go-to-dealbook').prop('disabled', true).css({'opacity': '0.5', 'background': '#64748b'});
        $('#btn-go-to-dealbook').text(status === '진행중' ? '거래 진행 중' : '거래 완료');
    } else {
        $('#detail-seller-summary').text(displaySummary);
        if (isAuthorized && memo) {
            $('#detail-seller-memo').text(memo).css('color', '#475569').parent().show();
        } else if (!isAuthorized && memo) {
            $('#detail-seller-memo').text('NDA 체결 후 열람 가능한 정보입니다.').css('color', '#94a3b8').parent().show();
        } else {
            $('#detail-seller-memo').text('').parent().hide();
        }
    }

    const industryContainer = $('#detail-industry-container');
    industryContainer.empty();
    if (seller.industry) {
        let displayIndustry = seller.industry;
        if (seller.industry.startsWith('기타: ')) {
            displayIndustry = seller.industry.replace('기타: ', '');
        }
        industryContainer.append(`<span class="industry-tag-td" style="background:#f5f3ff; color:#8b5cf6; border:1px solid #8b5cf633;">${escapeHtml(displayIndustry)}</span>`);
    }

    const authorDisplayName = authorData.name;
    $('#detail-author-name').text(authorDisplayName);
    const authorSubInfo = authorData.affiliation || 'DealChat';
    $('#detail-author-affiliation').text(authorSubInfo);
    $('#detail-author-avatar').attr('src', resolveAvatarUrl(authorData.avatar, 1));
    
    // 상세 모달 작성자 클릭 비활성화 (요청에 따라 제거)
    $('#detail-author-info-box').css('cursor', 'default').off('click');
    $('#detail-author-name').css('color', '#1e293b').css('font-weight', '700');
    
    $('#detail-modified-date').text(dateDisplay);

    const currentUserName = currentUserData?.name || currentUserData?.email?.split('@')[0] || '사용자';
    $('#logged-in-user-name').text(currentUserName);

    $('#btn-go-to-dealbook').off('click').on('click', () => {
        if (isRestricted) {
            if (status === '진행중') alert('현재 거래가 진행 중입니다.');
            else alert('거래가 완료되었습니다.');
            return;
        }

        // NDA 체결 여부와 상관없이 상세 페이지(Dealbook)로 이동합니다.
        // 상세 페이지의 리포트 모드에서 NDA 게이트가 작동하게 됩니다.
        $('#transition-loader').css('display', 'flex');
        setTimeout(() => {
            location.href = `./dealbook_sellers.html?id=${encodeURIComponent(id)}&from=totalseller`;
        }, 600);
    });

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('seller-detail-modal'));
    modal.show();
};

// ==========================================
// Share Logic
// ==========================================

window.openShareModal = function (sellerId) {
    window.currentShareSellerId = sellerId;
    const seller = allSellers.find(s => String(s.id) === String(sellerId));
    if (!seller) return;

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

    // Fetch files associated with the seller's company and the seller itself
    const companyId = seller.company_id || (seller.companies && seller.companies.id);
    fetchFiles(companyId, sellerId);

    const modalEl = document.getElementById('share-options-modal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

function submitShare(sellerId, btnElement) {
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
            item_type: 'seller',
            item_id: sellerId,
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
            alert(`${selectedReceivers.length}명의 팀원에게 공유되었습니다.`);
            bootstrap.Modal.getInstance(document.getElementById('share-modal')).hide();
        }
    }).catch(e => {
        console.error('Share Error', e);
        alert('공유 실패: ' + (e.message || '알 수 없는 오류'));
    }).finally(() => $btn.prop('disabled', false).text(originalText));
}

$(document).on('click', '#btn-submit-share', function () {
    submitShare(window.currentShareSellerId, this);
});


async function fetchFiles(companyId, sellerId) {
    const $fileList = $('#share-file-selection-list');
    $fileList.html('<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');

    try {
        let query = _supabase.from('files').select('*');
        
        if (companyId && sellerId) {
            query = query.or(`and(entity_type.eq.company,entity_id.eq.${companyId}),and(entity_type.eq.seller,entity_id.eq.${sellerId})`);
        } else if (companyId) {
            query = query.eq('entity_id', companyId).eq('entity_type', 'company');
        } else if (sellerId) {
            query = query.eq('entity_id', sellerId).eq('entity_type', 'seller');
        } else {
            $fileList.html('<div class="text-muted p-1" style="font-size: 13px;">선택할 수 있는 파일이 없습니다.</div>');
            return;
        }

        const { data, error } = await query;

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
        $container.html('<span class="text-muted p-1" style="font-size: 13px;">이름으로 타인을 검색하세요.</span>');
        return;
    }
    $container.empty();
    selectedReceivers.forEach(uid => {
        const u = userMap[uid] || { name: 'Unknown' };
        const tag = $(`<span class="badge d-flex align-items-center gap-1 p-2" style="background: #eef2ff; color: #8b5cf6; border: 1px solid #8b5cf6; border-radius: 8px;">
            ${escapeHtml(u.name)} <span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer;">close</span>
        </span>`);
        tag.find('span').on('click', () => {
            selectedReceivers = selectedReceivers.filter(x => x !== uid);
            renderSelectedTags();
        });
        $container.append(tag);
    });
}

// ==========================================
// Pagination
// ==========================================

function renderPagination() {
    const container = $('#pagination-container');
    container.empty();
    const totalPages = Math.ceil(filteredSellers.length / itemsPerPage);
    if (totalPages <= 1) return;

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    container.append(`<button class="btn btn-outline-light pagination-btn" ${prevDisabled} onclick="changePage(1)"><span class="material-symbols-outlined">keyboard_double_arrow_left</span></button>`);
    container.append(`<button class="btn btn-outline-light pagination-btn" ${prevDisabled} onclick="changePage(${currentPage - 1})"><span class="material-symbols-outlined">chevron_left</span></button>`);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        container.append(`<button class="btn btn-outline-light pagination-btn ${activeClass}" onclick="changePage(${i})">${i}</button>`);
    }

    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    container.append(`<button class="btn btn-outline-light pagination-btn" ${nextDisabled} onclick="changePage(${currentPage + 1})"><span class="material-symbols-outlined">chevron_right</span></button>`);
    container.append(`<button class="btn btn-outline-light pagination-btn" ${nextDisabled} onclick="changePage(${totalPages})"><span class="material-symbols-outlined">keyboard_double_arrow_right</span></button>`);
}

window.changePage = function (page) {
    const totalPages = Math.ceil(filteredSellers.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderSellers();
    renderPagination();
    document.querySelector('.search-and-actions').scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// Filters & Sort
// ==========================================

function updateFilterOptions() {
    const $industryList = $('#filter-industry-list');
    const selectedIndustries = $('.industry-checkbox:checked').map(function () { return this.value; }).get();
    const categories = ["AI", "IT·정보통신", "SaaS·솔루션", "게임", "공공·국방", "관광·레저", "교육·에듀테크", "금융·핀테크", "농축수산·어업", "라이프스타일", "모빌리티", "문화예술·콘텐츠", "바이오·헬스케어", "부동산", "뷰티·패션", "에너지·환경", "외식·음료·소상공인", "우주·항공", "유통·물류", "제조·건설", "플랫폼·커뮤니티", "기타"];
    $industryList.empty();
    categories.forEach(ind => {
        const isChecked = selectedIndustries.includes(ind) ? 'checked' : '';
        $industryList.append(`<div class="filter-item"><input type="checkbox" class="btn-check industry-checkbox" id="filter-ind-${ind}" value="${ind}" ${isChecked} autocomplete="off"><label class="industry-checkbox-label" for="filter-ind-${ind}">${ind}</label></div>`);
    });
}

function applyFilters() {
    const selectedIndustries = $('.industry-checkbox:checked').map(function () { return this.value; }).get();
    const selectedStatuses = $('.method-checkbox:checked').map(function () { return this.value; }).get();
    const selectedVisibility = $('.visibility-checkbox:checked').map(function () { return this.value; }).get();
    const keyword = ($('#search-input').val() || "").trim().toLowerCase();
    const minPrice = parseFloat($('#filter-min-price').val()) || 0;
    const maxPrice = parseFloat($('#filter-max-price').val()) || Infinity;
    const includeNegotiable = $('#include-negotiable').is(':checked');

    filteredSellers = allSellers.filter(seller => {
        // [1] 공개된 것만 노출 - 비공개(is_draft: true)는 무조건 필터링
        if (seller.is_draft) return false;

        // [2] 키워드 필터
        const matchesKeyword = !keyword ||
            (seller.company_name && seller.company_name.toLowerCase().includes(keyword)) ||
            (seller.industry && seller.industry.toLowerCase().includes(keyword)) ||
            (seller.summary && seller.summary.toLowerCase().includes(keyword));
        if (!matchesKeyword) return false;

        // [3] 산업 필터
        const matchesIndustry = selectedIndustries.length === 0 || selectedIndustries.includes(seller.industry);
        if (!matchesIndustry) return false;

        // [4] 진행현황 필터
        const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(seller.status);
        if (!matchesStatus) return false;

        // [5] 공개여부 필터 (NDA 진행/미진행)
        const isOwner = String(seller.user_id) === String(currentuser_id);
        const localSigned = getSignedNdas();
        const isSigned = signedNdaIds.includes(String(seller.id)) || localSigned.includes(String(seller.id));
        const isAuthorized = isOwner || isSigned;

        const matchesVisibility = selectedVisibility.length === 0 || selectedVisibility.some(v => {
            if (v === 'public') return isAuthorized; // NDA 진행 (대기 포함)
            if (v === 'private') return !isAuthorized; // NDA 미진행
            return true;
        });
        if (!matchesVisibility) return false;


        // [7] 가격 필터 (범위 + 협의포함)
        const price = parseFloat(seller.matching_price);
        const isNegotiable = !seller.matching_price || seller.matching_price === '협의' || isNaN(price);
        
        let matchesPrice = false;
        if (isNegotiable) {
            // 협의 항목: 기본가 범위 미지정 시에는 항상 표시, 범위 지정 시에는 '협의 포함' 체크 시에만 표시
            if (minPrice === 0 && maxPrice === Infinity) {
                matchesPrice = true;
            } else {
                matchesPrice = includeNegotiable;
            }
        } else {
            // 가격 항목: 범위 내에 있을 때 표시
            matchesPrice = (price >= minPrice && price <= maxPrice);
        }

        return matchesPrice;
    });

    // 현재 정렬 유지
    const currentSort = $('.sort-option.active').data('sort') || 'latest';
    applySort(currentSort, false);

    currentPage = 1;
    renderSellers();
    renderPagination();
}

function applySort(type, shouldRender = true) {
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

    if (shouldRender) {
        currentPage = 1;
        renderSellers();
        renderPagination();
    }
}

// ==========================================
// CSV Export
// ==========================================

function exportToCSV() {
    if (filteredSellers.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }
    
    const signedNdas = getSignedNdas();
    const headers = ['매도자명', '산업', '진행 상황', '가격(억)', '요약', '담당자', '등록일'];
    
    const rows = filteredSellers.map(s => {
        const isOwner = String(s.user_id) === String(currentuser_id);
        const isSigned = signedNdas.includes(String(s.id));
        const status = s.status || '대기';
        const isRestricted = (status === '진행중' || status === '완료');
        
        // 마스킹 조건: 본인 글 아니면서 (상태가 진행중/완료이거나 NDA 미결인 경우)
        const shouldMask = !isOwner && (isRestricted || !isSigned);

        const company_name = shouldMask ? '비공개' : (s.company_name || '');
        
        let summary = s.summary || '';
        if (shouldMask && s.company_name) {
            const escapedName = s.company_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const nameRegex = new RegExp(escapedName, 'gi');
            summary = summary.replace(nameRegex, 'OOO');
        }

        const author = userMap[s.user_id]?.name || 'Unknown';
        const date = (() => { const d = new Date(s.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })();
        const price = shouldMask ? '-' : (s.sale_price || '');
        
        return [
            company_name, 
            s.industry || '', 
            status, 
            price, 
            summary, 
            author, 
            date
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DealChat_Sellers_All_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
