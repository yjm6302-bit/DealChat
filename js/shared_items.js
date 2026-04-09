import { checkAuth, hideLoader, showLoader, resolveAvatarUrl } from './auth_utils.js';
import { renderPagination } from './pagination_utils.js';


const _supabase = window.supabaseClient || supabase.createClient(
    window.config.supabase.url, window.config.supabase.anonKey
);
window.supabaseClient = _supabase;

// ── Constants ──────────────────────────────────────────────────────────────────
const NAVY           = '#1E293B';
const ITEMS_PER_PAGE = 15;

const TYPE_CONFIG = {
    company: { label: '기업',  icon: 'corporate_fare', color: '#1a73e8', bg: '#e7f1ff', detailPage: 'dealbook_companies.html' },
    buyer:   { label: '매수',  icon: 'person_search',  color: '#0d9488', bg: '#f0fdfa', detailPage: 'dealbook_buyers.html'    },
    seller:  { label: '매도',  icon: 'storefront',     color: '#8b5cf6', bg: '#f3f0ff', detailPage: 'dealbook_sellers.html'   },
};

// ── State ──────────────────────────────────────────────────────────────────────
let currentPage       = 1;
let allItems          = [];   // received items only
let filteredItems     = [];
let currentSort       = 'newest';
let currentTypeFilter = 'all';
let userMap           = {};
let currentUserId     = null;
let unreadOnly        = false;

// ── Industry Icon ──────────────────────────────────────────────────────────────
const TYPE_DEFAULTS = { company: 'corporate_fare', buyer: 'person_search', seller: 'storefront' };

function getIndustryIcon(industry, type) {
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
        '농축수산·어업': 'agriculture',
        '라이프스타일': 'person',
        '모빌리티': 'directions_car',
        '문화예술·콘텐츠': 'movie',
        '바이오·헬스케어': 'medical_services',
        '부동산': 'real_estate_agent',
        '뷰티·패션': 'content_cut',
        '에너지·환경': 'eco',
        '외식업·소상공인': 'restaurant',
        '외식·음료·소상공인': 'restaurant',
        '우주·항공': 'rocket',
        '유통·물류': 'local_shipping',
        '제조·건설': 'factory',
        '플랫폼·커뮤니티': 'groups',
    };
    return iconMap[industry] || TYPE_DEFAULTS[type] || 'corporate_fare';
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d    = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    const hh   = String(d.getHours()).padStart(2, '0');
    const min  = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function getTypeConfig(type) {
    return TYPE_CONFIG[type] || { label: type, icon: 'info', color: '#64748b', bg: '#f1f5f9', detailPage: 'index.html' };
}

// ── Initialisation ─────────────────────────────────────────────────────────────
$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    currentUserId = userData.id;

    loadData();

    // Search
    $('#search-btn').on('click', () => { currentPage = 1; applyFilters(); });
    $('#search-input').on('keypress', e => { if (e.which === 13) { currentPage = 1; applyFilters(); } });

    // Sort
    $(document).on('click', '.sort-option', function (e) {
        e.preventDefault();
        currentSort = $(this).data('sort');
        $('#current-sort-label').text($(this).text());
        $('.sort-option').removeClass('active');
        $(this).addClass('active');
        currentPage = 1;
        applyFilters();
    });

    // Type filter tabs
    $(document).on('click', '.type-tab-btn', function () {
        currentTypeFilter = $(this).data('type');
        currentPage = 1;
        $('.type-tab-btn').each(function () {
            const isActive = $(this).data('type') === currentTypeFilter;
            $(this).toggleClass('active', isActive).css({
                background:  isActive ? NAVY : '#ffffff',
                borderColor: isActive ? NAVY : '#e2e8f0',
                color:       isActive ? '#ffffff' : '#64748b',
            });
        });
        applyFilters();
    });

    // Read filter toggle
    $('#filter-tab-unread').on('click', function () {
        unreadOnly = !unreadOnly;
        $(this).toggleClass('active', unreadOnly);
        
        // Update icon based on state
        const icon = unreadOnly ? 'notifications_active' : 'notifications_paused';
        $(this).find('.material-symbols-outlined').text(icon);

        currentPage = 1;
        applyFilters();
    });
});

// ── Data Loading ───────────────────────────────────────────────────────────────
async function loadData() {
    try {
        // 1. Users (for sender name/avatar lookup)
        const { data: users, error: usersError } = await _supabase.from('users').select('*');
        if (usersError) throw usersError;

        userMap = Object.fromEntries(
            (users || []).map(u => [u.id, {
                name:        u.name       || 'Unknown',
                affiliation: u.company    || 'DealChat',
                avatar:      u.avatar_url || u.avatar || null,
            }])
        );

        // 2. Shares (sender or receiver)
        const { data: shares, error: sharesError } = await _supabase
            .from('shares')
            .select('*')
            .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
            .order('created_at', { ascending: false });
        if (sharesError) throw sharesError;

        if (!shares?.length) { hideLoader(); showEmpty(); return; }

        // 4. Fetch item details
        const extractIds = type => [...new Set(shares.filter(s => s.item_type === type).map(s => s.item_id))];
        const companyIds = extractIds('company');
        const buyerIds   = extractIds('buyer');
        const sellerIds  = extractIds('seller');

        const [companiesRes, buyersRes, sellersRes] = await Promise.all([
            companyIds.length
                ? _supabase.from('companies').select('id, name, industry, summary, is_draft, user_id').in('id', companyIds).is('deleted_at', null)
                : Promise.resolve({ data: [] }),
            buyerIds.length
                ? _supabase.from('buyers').select('id, company_name, interest_industry, interest_summary, is_draft, user_id').in('id', buyerIds)
                : Promise.resolve({ data: [] }),
            sellerIds.length
                ? _supabase.from('sellers').select('id, name, industry, summary, is_draft, user_id').in('id', sellerIds)
                : Promise.resolve({ data: [] }),
        ]);

        const companyMap = Object.fromEntries((companiesRes.data || []).map(c => [String(c.id), c]));
        const buyerMap   = Object.fromEntries((buyersRes.data   || []).map(b => [String(b.id), b]));
        const sellerMap  = Object.fromEntries((sellersRes.data  || []).map(s => [String(s.id), { ...s, _displayName: s.name || '이름 없음' }]));

        // 5. Filter to received-only and enrich each share
        allItems = shares
            .filter(s => s.receiver_id === currentUserId && !s.receiver_deleted)
            .map(share => enrichShare(share, companyMap, buyerMap, sellerMap));

        // 6. NDA 서명 이력 일괄 확인 (비소유자 항목만)
        const nonOwnedIds = allItems
            .filter(i => !i.isOwner && i.itemFound)
            .map(i => String(i.item_id));

        if (nonOwnedIds.length) {
            const { data: ndaRows } = await _supabase
                .from('nda_logs')
                .select('item_id')
                .eq('user_id', currentUserId)
                .in('item_id', nonOwnedIds);
            const signedSet = new Set((ndaRows || []).map(r => String(r.item_id)));
            allItems = allItems.map(item => ({
                ...item,
                isNdaSigned: item.isOwner || item.item_type === 'company' || signedSet.has(String(item.item_id)),
            }));
        }

        applyFilters();
    } catch (err) {
        console.error('공유 목록 로드 실패:', err);
        $('#shared-items-list').html(
            `<tr><td colspan="9" class="text-center text-danger py-5">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>`
        );
    } finally {
        hideLoader();
    }
}

function enrichShare(share, companyMap, buyerMap, sellerMap) {
    const sid        = String(share.item_id);

    let itemDetail = null, itemName = '대상 정보 없음', industry = '', itemSummary = '';

    if (share.item_type === 'company') {
        itemDetail  = companyMap[sid];
        itemName    = itemDetail?.name     || '삭제된 항목';
        industry    = itemDetail?.industry || '';
        itemSummary = itemDetail?.summary  || '';
    } else if (share.item_type === 'buyer') {
        itemDetail  = buyerMap[sid];
        itemName    = itemDetail?.company_name || '삭제된 항목';
        industry    = itemDetail?.interest_industry || '';
        itemSummary = itemDetail?.interest_summary  || '';
    } else if (share.item_type === 'seller') {
        itemDetail  = sellerMap[sid];
        itemName    = itemDetail?._displayName || '삭제된 항목';
        industry    = itemDetail?.industry || '';
        itemSummary = itemDetail?.summary  || '';
    }

    const isDraft  = !!itemDetail?.is_draft;
    const isOwner  = !!(itemDetail && String(itemDetail.user_id) === String(currentUserId));
    return {
        ...share,
        itemName,
        industry,
        itemSummary,
        itemFound:         !!itemDetail,
        is_draft:          isDraft,
        displayVisibility: isDraft ? '비공개' : '공개',
        isOwner,
        isNdaSigned:       isOwner || share.item_type === 'company', // NDA 배치 조회 후 덮어씀 (기업은 상시 허용)
    };
}

// ── Filter & Sort ──────────────────────────────────────────────────────────────
function applyFilters() {
    const keyword = ($('#search-input').val() || '').trim().toLowerCase();
    let items = [...allItems];

    if (currentTypeFilter !== 'all') {
        items = items.filter(item => item.item_type === currentTypeFilter);
    }
    if (unreadOnly) {
        items = items.filter(item => !item.is_read);
    }
    if (keyword) {
        items = items.filter(({ itemName, memo, industry, sender_id }) => {
            const senderName = (userMap[sender_id]?.name || '').toLowerCase();
            return (
                itemName.toLowerCase().includes(keyword)       ||
                (memo     || '').toLowerCase().includes(keyword) ||
                (industry || '').toLowerCase().includes(keyword) ||
                senderName.includes(keyword)
            );
        });
    }

    items.sort((a, b) => {
        const da = new Date(a.created_at), db = new Date(b.created_at);
        return currentSort === 'newest' ? db - da : da - db;
    });

    filteredItems = items;
    $('#total-count-badge').text('');

    if (!filteredItems.length) {
        showEmpty();
    } else {
        $('#empty-state').hide();
        renderList();
        renderPagination({
            containerId: 'pagination-container',
            totalItems: filteredItems.length,
            itemsPerPage: ITEMS_PER_PAGE,
            currentPage: currentPage,
            onPageChange: (newPage) => {
                currentPage = newPage;
                renderList();
            },
            scrollToSelector: '.search-and-actions'
        });
    }
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function renderList() {
    const $list = $('#shared-items-list').empty();
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    filteredItems.slice(start, start + ITEMS_PER_PAGE).forEach(item => $list.append(buildRow(item)));
}

function buildRow(item) {
    const cfg    = getTypeConfig(item.item_type);
    const sender = userMap[item.sender_id] || { name: '정보 없음', avatar: null, affiliation: '-' };

    const typeText = `<span class="type-tag-td" style="background:${cfg.bg}; color:${cfg.color}; border:1px solid ${cfg.color}33;">${cfg.label}</span>`;

    const industryHtml = item.industry
        ? `<span class="industry-tag-td"
                 style="background:${cfg.bg}; color:${cfg.color}; border:1px solid ${cfg.color}33;">
               ${escapeHtml(item.industry)}
           </span>`
        : `<span style="color:#cbd5e1; font-size:12px;">-</span>`;

    const memoHtml = item.memo
        ? escapeHtml(item.memo)
        : `<span style="color:#cbd5e1; font-style:italic;">메모 없음</span>`;

    const readStatusHtml = !item.is_read
        ? `<span class="badge"
                 style="background:#ef4444; font-size:11px; padding:3px 8px; border-radius:6px; font-weight:700;">
               읽지 않음
           </span>`
        : `<span style="font-size:13px; color:#94a3b8; font-family:'Outfit', sans-serif;">
               ${formatDateTime(item.updated_at || item.created_at)}
           </span>`;

    const nameDisplay = item.isNdaSigned
        ? `<span style="font-size:14px; font-weight:700; color:#1e293b; min-width:0;
                        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                 title="${escapeHtml(item.itemName)}">${escapeHtml(item.itemName)}</span>`
        : `<span style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700;
                        color:${cfg.color}; background:${cfg.bg}; border:1px solid ${cfg.color}33;
                        border-radius:8px; padding:3px 10px; white-space:nowrap;">
               <span class="material-symbols-outlined" style="font-size:14px;">lock</span>NDA 필요
           </span>`;

    const row = $(`
        <tr class="table-row-clickable" style="cursor:pointer;">
            <td>
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div style="width:36px; height:36px; background:${cfg.color}; border-radius:8px;
                                display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <span class="material-symbols-outlined" style="color:#fff; font-size:20px;">${item.isNdaSigned ? getIndustryIcon(item.industry, item.item_type) : 'lock'}</span>
                    </div>
                    ${nameDisplay}
                </div>
            </td>
            <td>${industryHtml}</td>
            <td class="text-center">${typeText}</td>
            <td class="text-center">
                <span style="font-size:13px; font-weight:700; color:#475569;">
                    ${item.displayVisibility}
                </span>
            </td>
            <td>
                <div style="font-size:13px; color:#334155; display:-webkit-box;
                            -webkit-line-clamp:2; -webkit-box-orient:vertical;
                            overflow:hidden; line-height:1.5;">
                    ${memoHtml}
                </div>
            </td>
            <td>
                <div class="author-td">
                    <img src="${escapeHtml(resolveAvatarUrl(sender.avatar, 1))}" class="author-avatar-sm" alt="">
                    <div class="author-info-wrap">
                        <div class="author-name-td" style="color:#000000; font-weight:700;">${escapeHtml(sender.name)}</div>
                        <div class="author-affiliation-td">${escapeHtml(sender.affiliation)}</div>
                    </div>
                </div>
            </td>
            <td class="text-center"
                style="font-size:13px; color:#94a3b8; font-family:'Outfit', sans-serif;">
                ${formatDateTime(item.created_at)}
            </td>
            <td class="text-center">${readStatusHtml}</td>
            <td class="text-center" onclick="event.stopPropagation();">
                <button class="delete-share-btn" data-id="${escapeHtml(String(item.id))}"
                        style="background:none; border:none; color:#cbd5e1; cursor:pointer;
                               padding:4px; transition:color 0.2s;">
                    <span class="material-symbols-outlined" style="font-size:18px;">close</span>
                </button>
            </td>
        </tr>
    `);

    row.find('.delete-share-btn').on('click', function (e) {
        e.stopPropagation();
        handleDeleteShare($(this).data('id'));
    });

    row.on('click', () => showItemSummaryModal(item));

    return row;
}

// ── Summary Modal ──────────────────────────────────────────────────────────────
function showItemSummaryModal(item) {
    const $modal = $('#item-summary-modal');
    const sender = userMap[item.sender_id] || { name: 'Unknown', affiliation: 'DealChat', avatar: null };
    const cfg    = getTypeConfig(item.item_type);

    // Header
    $('#summary-header-icon').css({ background: cfg.color });
    $('#summary-header-icon-symbol').text(item.isNdaSigned ? getIndustryIcon(item.industry, item.item_type) : 'lock').css({ color: '#fff' });
    $('#summary-item-name').text(item.isNdaSigned ? item.itemName : 'NDA 필요');

    // Badges
    $('#summary-type-badge').text(cfg.label).css({ background: cfg.color, color: '#fff' });

    $('#summary-visibility-badge').text(item.displayVisibility).css({
        background: '#f1f5f9',
        color:      '#64748b',
    });

    // Memo
    $('#summary-memo').html(
        item.memo ? escapeHtml(item.memo) : '<span class="summary-empty-text">기재된 메모가 없습니다.</span>'
    );

    // Attached files
    const $filesList = $('#summary-files-list');
    const $ndaNotice = $('#summary-nda-notice');

    if (item.file_ids?.length) {
        $filesList.html('<div style="font-size:12px; color:#94a3b8; padding: 10px;">파일 정보를 불러오는 중...</div>');
        $ndaNotice.toggle(!item.isNdaSigned); // NDA 미체결 시 안내 문구 표시

        // location과 storage_path를 모두 조회하여 필드명 변경에 대비
        _supabase.from('files').select('id, file_name, location, storage_path').in('id', item.file_ids)
            .then(async ({ data: files, error }) => {
                if (error) throw error;
                if (files?.length) {
                    const filePills = await Promise.all(files.map(async (f, index) => {
                        // NDA 미체결 상태인 경우
                        if (!item.isNdaSigned) {
                            return `
                            <div class="file-item-pill locked" title="NDA 체결 후 확인 가능합니다.">
                                <span class="material-symbols-outlined">lock</span>
                                <span class="file-name">비공개 파일 ${files.length > 1 ? index + 1 : ''} (NDA 체결 후 확인)</span>
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #cbd5e1;">lock</span>
                            </div>`;
                        }

                        // NDA 체결 상태인 경우 기존 로직 수행
                        const path = f.location || f.storage_path;
                        if (!path) return '';
                        try {
                            const { data, error: signedError } = await _supabase.storage
                                .from('uploads')
                                .createSignedUrl(path, 3600);
                            if (signedError) throw signedError;
                            
                            const fileUrl = data.signedUrl;
                            return `
                            <a href="${fileUrl}" target="_blank" download="${f.file_name}" class="file-item-pill">
                                <span class="material-symbols-outlined">description</span>
                                <span class="file-name">${escapeHtml(f.file_name)}</span>
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #cbd5e1;">download</span>
                            </a>`;
                        } catch (e) {
                            console.error(`Signed URL 발급 실패 (${f.file_name}):`, e);
                            return `
                            <div class="file-item-pill" style="opacity: 0.7; border-color: #fca5a5;" title="보안 주소를 가져오지 못했습니다.">
                                <span class="material-symbols-outlined" style="color: #ef4444;">error</span>
                                <span class="file-name" style="color: #ef4444;">${escapeHtml(f.file_name)} (다운로드 불가)</span>
                            </div>`;
                        }
                    }));
                    $filesList.html(filePills.join(''));
                } else {
                    $filesList.html('<div class="summary-empty-text">첨부된 파일이 없습니다.</div>');
                }
            })
            .catch(err => {
                console.error('파일 목록 로드 실패:', err);
                $filesList.html('<div style="font-size:12px; color:#ef4444;">파일 목록 로드 실패 (권한 또는 스키마 오류)</div>');
            });
    } else {
        $filesList.html('<div class="summary-empty-text">첨부된 파일이 없습니다.</div>');
        $ndaNotice.hide();
    }

    // Sender Card
    $('#summary-sender-avatar').attr('src', resolveAvatarUrl(sender.avatar));
    $('#summary-sender-name').text(sender.name);
    $('#summary-sender-meta').text(sender.affiliation);
    $('#summary-date').text(formatDateTime(item.created_at));

    // Footer buttons
    $('#btn-close-summary').off('click').on('click', () => $modal.hide());
    $('#btn-go-detail').off('click').on('click', async () => {
        $modal.hide();
        await proceedToDetail(item);
    });

    $modal.css('display', 'flex');
}

// ── Detail Navigation ──────────────────────────────────────────────────────────
async function proceedToDetail(item) {
    if (!item.is_read) {
        try {
            await _supabase.from('shares').update({ is_read: true }).eq('id', item.id);
        } catch (err) {
            console.error('읽음 처리 실패:', err);
        }
    }
    const cfg = getTypeConfig(item.item_type);
    window.location.href = `./${cfg.detailPage}?id=${encodeURIComponent(item.item_id)}&from=shared&mode=read`;
}

// ── Empty State ────────────────────────────────────────────────────────────────
function showEmpty() {
    $('#shared-items-list').empty();
    $('#pagination-container').empty();
    $('#empty-state').css('display', 'flex');
}


// ── Delete Share ───────────────────────────────────────────────────────────────
async function handleDeleteShare(shareId) {
    if (!confirm('이 공유 내역을 목록에서 삭제하시겠습니까?\n(데이터베이스에는 보존되지만 목록에서만 사라집니다.)')) return;

    try {
        const { error } = await _supabase
            .from('shares')
            .update({ receiver_deleted: true })
            .eq('id', shareId);
        if (error) throw error;

        allItems = allItems.filter(s => String(s.id) !== String(shareId));
        applyFilters();
    } catch (err) {
        console.error('삭제 오류:', err);
        alert('삭제 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
    }
}
