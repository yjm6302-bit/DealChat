import { hideLoader, resolveAvatarUrl, DEFAULT_MANAGER as AUTH_DEFAULT_MANAGER } from './auth_utils.js';
import { renderPagination } from './pagination_utils.js';

let supabase;

$(document).ready(async function () {
    if (typeof showLoader === 'function') showLoader();
    
    try {
        // Initialize Supabase from global if available (set by header_loader.js)
        // or wait for it if it's still loading
        let retryCount = 0;
        while (!window.supabaseClient && retryCount < 10) {
            await new Promise(resolve => setTimeout(resolve, 200));
            retryCount++;
        }
        
        supabase = window.supabaseClient;
        
        if (!supabase) {
            console.error("Supabase client not initialized.");
            alert("시스템 초기화 중 오류가 발생했습니다.");
            return;
        }

        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("로그인이 필요합니다.");
            location.href = "./signin.html";
            return;
        }

        // Load data
        await loadNdaLogs();

        // Event listeners
        $('#nda-search-input').on('input', function() {
            const searchTerm = $(this).val().toLowerCase();
            filterTable(searchTerm);
        });

        // 정렬 드롭다운
        $(document).on('click', '.sort-option', function(e) {
            e.preventDefault();
            const sort = $(this).data('sort');
            $('.sort-option').removeClass('active');
            $(this).addClass('active');
            $('#current-sort-label').text($(this).text());
            if (sort === 'oldest') {
                renderLogs([...allLogs].reverse());
            } else {
                renderLogs(allLogs);
            }
        });

    } catch (error) {
        console.error("Initialization error:", error);
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
});

const DEFAULT_MANAGER = AUTH_DEFAULT_MANAGER;

const TYPE_CONFIG = {
    buyer:  { color: '#0d9488', bg: '#f0fdfa' },
    seller: { color: '#8b5cf6', bg: '#f3f0ff' },
};

function getIndustryShortName(industry) {
    const shortMap = {
        'AI': 'AI', 'IT·정보통신': 'IT·정보통신', 'SaaS·솔루션': 'SaaS',
        '게임': '게임', '공공·국방': '공공·국방', '관광·레저': '관광·레저',
        '교육·에듀테크': '교육·에듀테크', '금융·핀테크': '금융·핀테크',
        '농축수산·어업': '농·임·어업', '라이프스타일': '라이프스타일',
        '모빌리티': '모빌리티', '문화예술·콘텐츠': '문화예술',
        '바이오·헬스케어': '바이오·헬스케어', '부동산': '부동산',
        '뷰티·패션': '뷰티·패션', '에너지·환경': '에너지·환경',
        '외식·음료·소상공인': '외식·음료', '우주·항공': '우주·항공',
        '유통·물류': '유통·물류', '제조·건설': '제조·건설',
        '플랫폼·커뮤니티': '플랫폼', '기타': '기타'
    };
    return shortMap[industry] || industry;
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

let allLogs = [];
const ITEMS_PER_PAGE = 15;
let currentPage = 1;
let filteredLogs = [];

async function loadNdaLogs() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. Fetch NDA logs
        const { data: logs, error: logsError } = await supabase
            .from('nda_logs')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (logsError) throw logsError;

        // 2. Fetch all buyers, sellers, and users (signers) to resolve details
        const [{ data: buyers }, { data: sellers }, { data: users }] = await Promise.all([
            supabase.from('buyers').select('*'),
            supabase.from('sellers').select('*'),
            supabase.from('users').select('*')
        ]);

        const getCompanyName = (item) => item.company_name || item.companyName || item.name || item.Name || '정보 없음';

        const buyerMap = new Map(buyers?.map(b => [b.id, { 
            name: getCompanyName(b), 
            summary: b.summary || '',
            industry: b.industry || b.interest_industry || '기타'
        }]) || []);
        const sellerMap = new Map(sellers?.map(s => [s.id, { 
            name: getCompanyName(s), 
            summary: s.summary || '',
            industry: s.industry || '기타'
        }]) || []);
        
        const profileMap = new Map(users?.map(u => [u.id, {
            name: u.name || '정보 없음',
            affiliation: u.company || u.affiliation || 'DealChat',
            avatar: u.avatar_url || u.avatar || null
        }]) || []);

        // 3. Process logs
        allLogs = logs.map(log => {
            let itemName = '-';
            let itemSummary = '';
            let itemIndustry = '기타';
            const targetId = log.item_id || log.seller_id;

            if (log.item_type === 'buyer') {
                const entry = buyerMap.get(targetId) || buyerMap.get(String(targetId));
                itemName = entry?.name || '삭제된 항목';
                itemSummary = entry?.summary || '';
                itemIndustry = entry?.industry || '기타';
            } else if (log.item_type === 'seller' || !log.item_type || log.seller_id) {
                const entry = sellerMap.get(targetId) || sellerMap.get(String(targetId));
                itemName = entry?.name || '삭제된 항목';
                itemSummary = entry?.summary || '';
                itemIndustry = entry?.industry || '기타';
            }

            const profileMatch = profileMap.get(log.user_id) || profileMap.get(String(log.user_id));
            const profile = profileMatch || {
                ...DEFAULT_MANAGER,
                name: log.signature || DEFAULT_MANAGER.name
            };

            const isBuyer = log.item_type === 'buyer';
            return {
                ...log,
                itemName,
                itemSummary,
                itemIndustry,
                signerProfile: profile,
                displayType: isBuyer ? '매수' : '매도',
                typeClass: isBuyer ? 'type-buyer' : 'type-seller'
            };
        });

        renderLogs(allLogs);

    } catch (error) {
        console.error("Load logs error:", error);
        $('#nda-logs-container').html('<tr><td colspan="7" class="text-center text-danger">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>');
    }
}

function renderLogs(logs) {
    filteredLogs = logs;
    currentPage = 1;
    renderCurrentPage();
}

function renderCurrentPage() {
    const $container = $('#nda-logs-container');
    $container.empty();

    if (filteredLogs.length === 0) {
        $('#empty-state').css('display', 'flex');
        $('#pagination-container').empty();
        return;
    }
    $('#empty-state').css('display', 'none');

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageLogs = filteredLogs.slice(start, start + ITEMS_PER_PAGE);

    pageLogs.forEach((log) => {
        const date = new Date(log.created_at);
        const formattedDate = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;

        const targetId = log.item_id || log.seller_id;
        const itemLink = log.item_type === 'buyer'
            ? `./dealbook_buyers.html?id=${targetId}&from=total_buyers`
            : `./dealbook_sellers.html?id=${targetId}&from=totalseller`;
        const summaryText = log.itemSummary
            ? (log.itemSummary.length > 60 ? log.itemSummary.slice(0, 60) + '...' : log.itemSummary)
            : '-';

        const signer = log.signerProfile;
        let avatarUrl = resolveAvatarUrl(signer.avatar, 1);
        if (!signer.avatar || signer.avatar.includes('default-avatar.png') || signer.avatar.includes('dealchat-favicon.png')) {
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(signer.name)}&background=random&size=128`;
        }

        const typeCfg = TYPE_CONFIG[log.item_type] || TYPE_CONFIG.seller;
        const shortIndustry = getIndustryShortName(log.itemIndustry);
        const industryHtml = log.itemIndustry
            ? `<span class="industry-tag-td" style="background:${typeCfg.bg}; color:${typeCfg.color}; border:1px solid ${typeCfg.color}33;">${shortIndustry}</span>`
            : `<span style="color:#cbd5e1; font-size:12px;">-</span>`;

        const $row = $(`
            <tr class="table-row-clickable" style="cursor: pointer;" onclick="window.location.href='${itemLink}'">
                <td>
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <div style="width:36px; height:36px; background:${typeCfg.color}; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <span class="material-symbols-outlined" style="color:#fff; font-size:20px;">${getIndustryIcon(log.itemIndustry)}</span>
                        </div>
                        <span style="font-size:14px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${log.itemName}</span>
                    </div>
                </td>
                <td>${industryHtml}</td>
                <td>
                    <span class="type-tag-td" style="background:${typeCfg.bg}; color:${typeCfg.color}; border:1px solid ${typeCfg.color}33;">${log.displayType}</span>
                </td>
                <td>
                    <div style="font-size:13px; color:#334155; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.5;">${summaryText}</div>
                </td>
                <td>
                    <div class="author-td">
                        <img src="${avatarUrl}" alt="Avatar" class="author-avatar-sm" style="width: 28px; height: 28px;">
                        <div class="author-info-wrap">
                            <div class="author-name-td" style="font-weight: 700;">${signer.name}</div>
                            <div class="author-affiliation-td">${signer.affiliation}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center" style="font-size:13px; color:#94a3b8; font-family:'Outfit', sans-serif;">${formattedDate}</td>
                <td class="text-center" onclick="event.stopPropagation();">
                    <button class="btn-download btn-download-pdf" data-id="${log.id}">
                        <span class="material-symbols-outlined">download</span>
                        PDF
                    </button>
                </td>
            </tr>
        `);

        $row.find('.btn-download-pdf').on('click', function() {
            downloadPdf(log);
        });

        $container.append($row);
    });

    renderPagination({
        containerId: 'pagination-container',
        totalItems: filteredLogs.length,
        itemsPerPage: ITEMS_PER_PAGE,
        currentPage: currentPage,
        onPageChange: (newPage) => {
            currentPage = newPage;
            renderCurrentPage();
        },
        scrollToSelector: '.search-and-actions'
    });
}

function filterTable(term) {
    const filtered = allLogs.filter(log => 
        (log.signature && log.signature.toLowerCase().includes(term)) ||
        (log.itemName && log.itemName.toLowerCase().includes(term))
    );
    renderLogs(filtered);
}

async function downloadPdf(log) {
    const $template = $('#nda-pdf-template');
    
    // Fill template
    $template.find('#pdf-item-name').text(log.itemName);

    const isBuyer = log.item_type === 'buyer';
    $template.find('#pdf-item-type')
        .text(log.displayType)
        .css({
            'background': isBuyer ? '#f0fdfa' : '#eff6ff',
            'color':      isBuyer ? '#0d9488' : '#1e3a8a',
            'border':     isBuyer ? '1px solid #ccfbf1' : '1px solid #bfdbfe'
        });
    $template.find('#pdf-signer-name').text(log.signature || '비공개');
    
    const date = new Date(log.created_at);
    const dateStr = `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`;
    $template.find('#pdf-signed-date').text(dateStr);
    $template.find('#pdf-signature-display').text(log.signature || '');

    // Options for html2pdf
    const filename = `NDA_${log.itemName.replace(/\s+/g, '_')}_${log.signature || 'Signed'}.pdf`;
    const opt = {
        margin: [10, 10, 10, 10], // Increased margin to ensure content stays on one page
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Show template briefly for capture, though html2pdf can handle hidden elements if specified correctly
    // But it's safer to ensure it's "renderable"
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
}
