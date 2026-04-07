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

    // 2. 게시글 카운트 로드
    await loadDashboardCounts(userData.id);

    // 로더 숨김
    hideLoader();
});

/**
 * 대시보드 카테고리별 게시글 수 로드
 */
async function loadDashboardCounts(userId) {
    try {
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

        const results = await Promise.all(queries);
        
        const counts = {
            total: {
                companies: results[0].count || 0,
                sellers: results[1].count || 0,
                buyers: results[2].count || 0
            },
            myPublic: {
                companies: results[3].count || 0,
                sellers: results[4].count || 0,
                buyers: results[5].count || 0
            },
            myPrivate: {
                companies: results[6].count || 0,
                sellers: results[7].count || 0,
                buyers: results[8].count || 0
            }
        };

        updateDashboardCountsUI(counts);
    } catch (err) {
        console.error('카운트 정보를 가져오는데 실패했습니다:', err);
    }
}

/**
 * 카운트 UI 업데이트
 */
function updateDashboardCountsUI(counts) {
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

