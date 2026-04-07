import { checkAuth, hideLoader } from './auth_utils.js';

const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
window.supabaseClient = _supabase;

$(document).ready(async function () {
    const userData = checkAuth();
    if (!userData) return;

    // 1. 프로필 정보 업데이트 (웰컴 메시지의 '홍길동'을 실제 이름으로 변경)
    if (userData && userData.name) {
        const welcomeName = document.getElementById('userName2');
        if (welcomeName) welcomeName.textContent = userData.name;
    }

    // [RBAC] 매수자 등급 메뉴 제한
    if (userData.role === 'buyer') {
        const cardsToHide = ['.group-startup', '.group-ma-buyer', '.card-companies', '.card-sellers', '.card-buyers'];
        cardsToHide.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.style.display = 'none';
        });
        
        // 웰컴 메시지 수정 (선택 사항)
        const welcomeP = document.querySelector('.welcome-header p');
        if (welcomeP) welcomeP.textContent = 'M&A 매도 매물 정보를 탐색하고 상세 정보를 열람하세요.';
    }

    // 2. 게시글 카운트 로드 (매수자는 필요한 카운트만 로드하거나 전체 로드 후 필터링)
    await loadDashboardCounts(userData);

    // 로더 숨김
    hideLoader();
});

/**
 * 대시보드 카테고리별 게시글 수 로드
 */
async function loadDashboardCounts(userData) {
    const userId = userData.id;
    const isBuyer = userData.role === 'buyer';

    try {
        let results;
        if (isBuyer) {
            // 매수자는 'Sellers' 통합 목록 카운트만 가져오면 됨 (NDA 등 개인 열람용이면 NDA 개수도 고려 가능)
            const query = _supabase.from('sellers').select('*', { count: 'exact', head: true }).eq('is_draft', false);
            const { count, error } = await query;
            if (error) throw error;
            results = { totalSellers: count || 0 };
        } else {
            const queries = [
                // Total Counts (Public only)
                _supabase.from('companies').select('*', { count: 'exact', head: true }).eq('is_draft', false).is('deleted_at', null),
                _supabase.from('sellers').select('*', { count: 'exact', head: true }).eq('is_draft', false),
                _supabase.from('buyers').select('*', { count: 'exact', head: true }).eq('is_draft', false),
                
                // My Counts (Public)
                _supabase.from('companies').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', false).is('deleted_at', null),
                _supabase.from('sellers').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', false),
                _supabase.from('buyers').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', false),
                
                // My Counts (Private/Draft)
                _supabase.from('companies').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', true).is('deleted_at', null),
                _supabase.from('sellers').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', true),
                _supabase.from('buyers').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', true)
            ];

            const res = await Promise.all(queries);
            results = {
                total: {
                    companies: res[0].count || 0,
                    sellers: res[1].count || 0,
                    buyers: res[2].count || 0
                },
                myPublic: {
                    companies: res[3].count || 0,
                    sellers: res[4].count || 0,
                    buyers: res[5].count || 0
                },
                myPrivate: {
                    companies: res[6].count || 0,
                    sellers: res[7].count || 0,
                    buyers: res[8].count || 0
                }
            };
        }

        updateDashboardCountsUI(results, isBuyer);
    } catch (err) {
        console.error('카운트 정보를 가져오는데 실패했습니다:', err);
    }
}

/**
 * 카운트 UI 업데이트
 */
function updateDashboardCountsUI(counts, isBuyer) {
    if (isBuyer) {
        animateCount('count-total-sellers', counts.totalSellers, '건');
    } else {
        // Total
        animateCount('count-total-companies', counts.total.companies, '건');
        animateCount('count-total-sellers', counts.total.sellers, '건');
        animateCount('count-total-buyers', counts.total.buyers, '건');

        // My Companies
        animateCount('count-my-companies-public', counts.myPublic.companies);
        animateCount('count-my-companies-private', counts.myPrivate.companies);

        // My Sellers
        animateCount('count-my-sellers-public', counts.myPublic.sellers);
        animateCount('count-my-sellers-private', counts.myPrivate.sellers);

        // My Buyers
        animateCount('count-my-buyers-public', counts.myPublic.buyers);
        animateCount('count-my-buyers-private', counts.myPrivate.buyers);
    }
}

/**
 * 카운트 애니메이션 효과
 */
function animateCount(id, target, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;

    let current = 0;
    const duration = 1000;
    const step = Math.ceil(target / (duration / 16)) || 1;
    
    const timer = setInterval(() => {
        current += step;
        if (current >= target) {
            el.textContent = target.toLocaleString() + suffix;
            clearInterval(timer);
        } else {
            el.textContent = current.toLocaleString() + suffix;
        }
    }, 16);
}

