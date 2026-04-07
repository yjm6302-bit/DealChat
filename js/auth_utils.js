
/**
 * Shared authentication and user-related utilities
 */

/**
 * Checks if the user is logged in. 
 * If not, alerts and redirects to signin.html.
 * @returns {Object|null} User data if logged in, null otherwise.
 */
export function checkAuth() {
    let userData = null;
    try {
        userData = JSON.parse(localStorage.getItem('dealchat_users'));
    } catch (e) {
        console.warn('checkAuth: localStorage 파싱 실패', e);
    }
    
    const currentPath = window.location.pathname;
    const signinPath = currentPath.includes('/html/') ? './signin.html' : './html/signin.html';

    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = signinPath;
        return null;
    }

    // 승인 상태 확인
    if (userData.status === 'pending') {
        alert('관리자의 가입 승인을 기다리는 중입니다.');
        localStorage.removeItem('dealchat_users');
        location.href = signinPath;
        return null;
    } else if (userData.status === 'rejected') {
        alert('가입 승인이 거부되었습니다. 관리자에게 문의해 주세요.');
        localStorage.removeItem('dealchat_users');
        location.href = signinPath;
        return null;
    }

    // [RBAC] 매수자 등급 전역 보안 및 접근 제어 적용
    if (userData.role === 'buyer') {
        applyBuyerRestrictions();
        
        // 허용되지 않은 페이지 접근 시 리다이렉트 (Total Sellers 및 Dashboard만 허용)
        const allowedPages = ['index.html', 'total_sellers.html', 'dealbook_sellers.html', 'signin.html', 'signup.html', 'mypage.html'];
        const isAllowed = allowedPages.some(page => currentPath.includes(page));
        
        // 루트(/) 또는 빈 경로인 경우(index.html) 허용
        const isRoot = currentPath.endsWith('/') || currentPath.endsWith('DealChat');
        
        if (!isAllowed && !isRoot) {
            alert('해당 페이지에 접근할 권한이 없습니다.');
            location.href = signinPath.replace('signin.html', 'total_sellers.html');
            return null;
        }
    }

    return userData;
}

/**
 * Applies global security restrictions for the 'buyer' role.
 * Prevents dragging, text selection, and context menu.
 */
function applyBuyerRestrictions() {
    // 1. CSS를 통한 텍스트 선택 방지
    const style = document.createElement('style');
    style.innerHTML = `
        body {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
        }
    `;
    document.head.appendChild(style);

    // 2. JS를 통한 드래그 및 우클릭 차단
    window.addEventListener('dragstart', (e) => e.preventDefault(), true);
    window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
    
    // 3. 복사 키 조합 차단 (Ctrl+C, Ctrl+V, Ctrl+U 등)
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'u', 's', 'p'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            return false;
        }
    }, true);
}

/**
 * Logs out the user and redirects to the index page.
 */
export function signStoreOut() {
    if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('dealchat_users');
        const currentPath = window.location.pathname;
        if (currentPath.includes('/html/')) {
            location.href = './signin.html';
        } else {
            location.href = './html/signin.html';
        }
    }
}

/**
 * Updates the header profile name with the logged-in user's name.
 * @param {Object} userData - User data object from checkAuth()
 */
export function updateHeaderProfile(userData) {
    if (userData && userData.name) {
        const userNameElements = document.querySelectorAll('#userName, #userName2'); // Update both header and welcome message
        userNameElements.forEach(el => {
            if (el) el.textContent = userData.name;
        });

        // Update avatar if available (optional)
        if (userData.avatar || userData.avatar_url) {
            const avatarUrl = resolveAvatarUrl(userData.avatar || userData.avatar_url, 1);
            const avatarElements = document.querySelectorAll('.avatar');
            avatarElements.forEach(el => {
                if (el) el.src = avatarUrl;
            });
        }
    }
}

/**
 * Default manager information for unknown/deleted users
 */
export const DEFAULT_MANAGER = {
    name: '딜챗',
    company: '딜챗 주식회사',
    affiliation: '딜챗 주식회사',
    department: 'M&A팀',
    email: 'info@dealchat.co.kr',
    avatar: 'img/dealchat-favicon.png'
};

/**
 * Resolves avatar URL based on its type (URL, Data URL, or local path).
 * @param {string} path - The avatar path or URL
 * @param {number} depth - Number of levels to go up (../) for local paths. Default is 1.
 * @returns {string} The resolved URL or path
 */
export function resolveAvatarUrl(path, depth = 1) {
    if (!path) return '../'.repeat(depth) + 'img/avatars/default-avatar.png';
    
    // If the path is specifically for the manager
    if (path === 'img/dealchat-manager.png' || path === 'img/dealchat-favicon.png') {
        return '../'.repeat(depth) + path;
    }
    
    // If it's a full URL or a Data URL, return as is
    if (path.startsWith('http') || path.startsWith('data:')) {
        return path;
    }
    
    // If it already has ../, return as is (to avoid double prefixing)
    if (path.startsWith('../')) {
        return path;
    }
    
    // Otherwise, it's a relative local path. Prepend ../ based on depth.
    return '../'.repeat(depth) + path;
}

/**
 * Initializes the user menu dropdown interactions.
 * Expects #user-menu-trigger, #user-menu-dropdown, and #btn-signout to exist.
 */
export function initUserMenu() {
    // Deprecated: User menu interaction is now handled globally by header_loader.js
}

/**
 * Shows the global loading overlay.
 */
export function showLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.style.opacity = '1';
    }
}

/**
 * Hides the global loading overlay with a fade effect.
 */
export function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }
}
