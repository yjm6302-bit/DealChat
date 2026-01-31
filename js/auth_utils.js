
/**
 * Shared authentication and user-related utilities
 */

/**
 * Checks if the user is logged in. 
 * If not, alerts and redirects to signin.html.
 * @returns {Object|null} User data if logged in, null otherwise.
 */
export function checkAuth() {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        // Adjust path based on current location
        const currentPath = window.location.pathname;
        if (currentPath.includes('/html/')) {
            location.href = './signin.html';
        } else {
            location.href = './html/signin.html';
        }
        return null;
    }
    return userData;
}

/**
 * Logs out the user and redirects to the index page.
 */
export function signStoreOut() {
    if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('dealchat_users');
        const currentPath = window.location.pathname;
        if (currentPath.includes('/html/')) {
            location.href = '../index.html';
        } else {
            location.href = './index.html';
        }
    }
}
