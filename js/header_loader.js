/**
 * Header Loader
 * 모든 페이지에 공통 상단바(Header)를 동적으로 주입하고,
 * 알림 체크를 위한 Supabase 의존성을 자동으로 로드합니다.
 */

(function () {
    async function loadDependencies() {
        const isSubPage = window.location.pathname.includes('/html/');
        const basePath = isSubPage ? '../' : './';

        // 1. Supabase 라이브러리 체크 및 로드
        if (!window.supabase) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/supabase/dist/umd/supabase.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }

        // 2. Front Config 체크 및 로드 (Supabase 키 정보)
        if (!window.config || !window.config.supabase) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = basePath + 'js/front-config.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }
    }

    async function loadHeader() {
        const globalHeader = document.getElementById('global-header');
        if (!globalHeader) return;

        const isSubPage = window.location.pathname.includes('/html/');
        const basePath = isSubPage ? '../' : './';

        const userDataStr = localStorage.getItem('dealchat_users');
        let userName = '홍길동';
        let avatarUrl = basePath + 'img/avatars/default-avatar.png';
        let userData = null;

        if (userDataStr) {
            try {
                userData = JSON.parse(userDataStr);
                if (userData && userData.isLoggedIn && userData.name) {
                    userName = userData.name;
                    if (userData.avatar) {
                        if (userData.avatar.startsWith('img/avatars/')) {
                            avatarUrl = basePath + userData.avatar;
                        } else {
                            avatarUrl = userData.avatar;
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing user data in header loader', e);
            }
        }

        const htmlPath = isSubPage ? '' : 'html/';
        const myPagePath = isSubPage ? 'mypage.html' : 'html/mypage.html';
        const dashboardPath = isSubPage ? 'index.html' : 'html/index.html';
        const qnaPath = isSubPage ? 'qna.html' : 'html/qna.html';
        const ndaPath = isSubPage ? 'nda_management.html' : 'html/nda_management.html';

        const headerHtml = `
            <style>
                #user-menu-trigger {
                    overflow: visible !important;
                }
                .user-menu-dropdown.active {
                    display: block !important;
                    opacity: 1 !important;
                    transform: translateY(0) !important;
                    pointer-events: auto !important;
                }
                .unread-dot-badge {
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    background: #ef4444 !important;
                    border-radius: 50%;
                    border: 2px solid #fff;
                    display: none;
                    z-index: 1000;
                    box-shadow: 0 0 5px rgba(239, 68, 68, 0.4);
                }
                #shared-unread-dot {
                    top: -2px;
                    right: -2px;
                }
                #shared-menu-unread-dot {
                    position: relative;
                    margin-left: 8px;
                    width: 7px;
                    height: 7px;
                    background: #ef4444 !important;
                    border-radius: 50%;
                    display: none;
                    flex-shrink: 0;
                }
                .shared-count-badge {
                    background: #ef4444 !important;
                    color: #fff !important;
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    padding: 2px 8px !important;
                    border-radius: 20px !important;
                    margin-left: auto !important;
                    display: none;
                    line-height: 1 !important;
                    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
                }
                /* Systemic Unification: Bootstrap overrides */
                .layout-navbar {
                    min-height: 80px !important;
                    display: flex !important;
                    align-items: center !important;
                    background: #ffffff !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                }
                .layout-navbar .container-xxl {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    height: 100%;
                }
                .navbar.landing-navbar {
                    padding: 0 !important;
                }
                .brand-text {
                    font-size: 24px;
                    font-weight: 800;
                    color: #1e293b;
                    font-family: 'Outfit', sans-serif;
                    letter-spacing: -0.5px;
                }
                .dropdown-user .avatar {
                    width: 40px;
                    height: 40px;
                }
                /* Hide Dropdown Arrow */
                .dropdown-toggle::after {
                    display: none !important;
                }
            </style>
            <nav class="layout-navbar navbar navbar-expand-lg landing-navbar shadow-none">
                <div class="container-xxl">
                    <!-- Brand (Left) -->
                    <div class="navbar-brand app-brand demo d-flex py-0 me-4" onclick="location.href='${dashboardPath}'" style="cursor:pointer;">
                        <span class="brand-text">DealChat</span>
                    </div>

                    <!-- User Actions (Right) -->
                    <div class="navbar-nav-right d-flex align-items-center" id="navbar-collapse">
                        <ul class="navbar-nav flex-row align-items-center ms-auto">
                            <!-- User Dropdown -->
                            <li class="nav-item dropdown-user navbar-dropdown dropdown" style="list-style: none; position: relative;">
                                <div class="nav-link dropdown-toggle hide-arrow p-0" id="user-menu-trigger" style="cursor: pointer; display: flex; align-items: center; gap: 12px;">
                                    <div class="avatar avatar-online" style="position: relative;">
                                        <span class="unread-dot-badge" id="shared-unread-dot"></span>
                                        <img src="${avatarUrl}" alt="User Avatar" class="rounded-circle" style="width: 40px; height: 40px; object-fit: cover; border: 1.5px solid #f1f5f9;">
                                    </div>
                                    <span class="user-name d-none d-sm-inline-block" style="color:#1e293b; font-weight: 700; font-size: 15px;">${userName}</span>
                                </div>
                                
                                <!-- Dropdown Menu (Moved outside trigger) -->
                                <div class="user-menu-dropdown" id="user-menu-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: #fff; border-radius: 12px; box-shadow: 0 12px 32px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06); width: 240px; padding: 0; z-index: 9999; border: 1px solid #e2e8f0; opacity: 0; transform: translateY(10px); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); pointer-events: none; margin-top: 10px; overflow: hidden;">
                                    <!-- 메뉴 본체 -->
                                    <div style="padding: 12px 8px;">
                                        <!-- 섹션 1: 관리 도구 (향후 운영자 전용 예정) -->
                                        <div style="padding: 4px 10px 8px 10px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">관리 도구</div>
                                        
                                                        <a href="${isSubPage ? 'shared_items.html' : 'html/shared_items.html'}" class="user-menu-item" style="padding: 9px 10px; display: flex; align-items: center; gap: 10px; color: #475569; text-decoration: none; border-radius: 8px; font-size: 13.5px; transition: background 0.15s;">
                                            <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">share</span>
                                            <span style="flex: 1;">공유목록</span>
                                            <span class="shared-count-badge" id="shared-count-badge">0</span>
                                        </a>

                                        <div style="height: 1px; background: #f1f5f9; margin: 8px 2px;"></div>

                                        <!-- 섹션 2: 내 활동 -->
                                        <div style="padding: 4px 10px 8px 10px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">내 활동</div>
                                        
                                        <a href="${myPagePath}" class="user-menu-item" style="padding: 9px 10px; display: flex; align-items: center; gap: 10px; color: #475569; text-decoration: none; border-radius: 8px; font-size: 13.5px; transition: background 0.15s;">
                                            <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">manage_accounts</span>
                                            <span>마이페이지</span>
                                        </a>
                                        <a href="${ndaPath}" class="user-menu-item" style="padding: 9px 10px; display: flex; align-items: center; gap: 10px; color: #475569; text-decoration: none; border-radius: 8px; font-size: 13.5px; transition: background 0.15s;">
                                            <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">history</span>
                                            <span>열람기록</span>
                                        </a>
                                        <a href="${qnaPath}" class="user-menu-item" style="padding: 9px 10px; display: flex; align-items: center; gap: 10px; color: #475569; text-decoration: none; border-radius: 8px; font-size: 13.5px; transition: background 0.15s;">
                                            <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">help_outline</span>
                                            <span>문의하기</span>
                                        </a>

                                        <div style="height: 1px; background: #f1f5f9; margin: 8px 2px;"></div>

                                        <!-- 섹션 3: 세션 -->
                                        <div class="user-menu-item" id="btn-signout" style="padding: 9px 10px; display: flex; align-items: center; gap: 10px; color: #ef4444; border-radius: 8px; font-size: 13.5px; transition: background 0.15s; cursor: pointer;">
                                            <span class="material-symbols-outlined" style="font-size: 18px;">logout</span>
                                            <span style="font-weight: 600;">로그아웃</span>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
        `;

        globalHeader.innerHTML = headerHtml;
        globalHeader.style.display = 'block';

        if (userData && userData.isLoggedIn) {
            // UI 인터랙션은 즉시 초기화하여 사용자 경험 보장
            initHeaderInteractions();

            // 세션 검증 및 알림 업데이트는 비동기로 처리하여 상단바 동작을 방해하지 않음
            (async () => {
                try {
                    await loadDependencies();

                        if (window.supabase && window.config && window.config.supabase) {
                            // 클라이언트 초기화 로직 강화
                            if (!window.supabaseClient) {
                                if (window.supabase.createClient) {
                                    window.supabaseClient = window.supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
                                } else if (typeof supabase !== 'undefined' && supabase.createClient) {
                                    window.supabaseClient = supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
                                }
                            }
                            
                            const _supabase = window.supabaseClient;
                            if (_supabase) {
                                const { data: { session }, error: sessionError } = await _supabase.auth.getSession();

                                if (sessionError || !session) {
                                    console.warn('Supabase session expired or invalid. Logging out.');
                                    localStorage.removeItem('dealchat_users');
                                    const signinPath = isSubPage ? 'signin.html' : 'html/signin.html';
                                    window.location.href = signinPath;
                                    return;
                                }

                                // 세션이 유효한 경우에만 알림 업데이트
                                updateUnreadStatus(userData);
                            }
                        }
                } catch (err) {
                    console.error('Session validation or unread status update failed:', err);
                }
            })();
        } else {
            // 로그인이 안 된 상태라도 인터랙션 초기화
            initHeaderInteractions();
        }
    }

    async function updateUnreadStatus(userData) {
        if (!userData || !userData.id) return;
        try {
            if (!window.supabaseClient) return;
            const _supabase = window.supabaseClient;

            // 1. 수신된 공유 중 읽지 않은 항목
            const { count: receivedCount, error: rError } = await _supabase
                .from('shares')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', userData.id)
                .eq('is_read', false)
                .eq('receiver_deleted', false);

            if (rError) throw rError;

            const totalUnread = receivedCount || 0;

            if (totalUnread > 0) {
                const dot1 = document.getElementById('shared-unread-dot');
                const badge = document.getElementById('shared-count-badge');
                if (dot1) dot1.style.display = 'block';
                if (badge) {
                    badge.textContent = totalUnread;
                    badge.style.display = 'inline-block';
                }
            } else {
                const dot1 = document.getElementById('shared-unread-dot');
                const badge = document.getElementById('shared-count-badge');
                if (dot1) dot1.style.display = 'none';
                if (badge) badge.style.display = 'none';
            }
        } catch (err) {
            console.error('Failed to update unread status in header:', err);
        }
    }

    /**
     * 상단바 전용 인터랙션 초기화 (드롭다운 토글, 로그아웃 등)
     * 외부 스크립트 의존 없이 스스로 동작하게 함.
     */
    function initHeaderInteractions() {
        const header = document.getElementById('global-header');
        if (!header) return;

        // 이벤트 위임(Event Delegation)을 사용하여 클릭 이벤트 처리
        header.addEventListener('click', (e) => {
            const trigger = e.target.closest('#user-menu-trigger');
            const dropdown = document.getElementById('user-menu-dropdown');
            const signOutBtn = e.target.closest('#btn-signout');

            // 토글 버튼 클릭 시
            if (trigger && dropdown) {
                e.preventDefault();
                e.stopPropagation();
                
                const isActive = dropdown.classList.contains('active');
                
                if (!isActive) {
                    dropdown.style.display = 'block';
                    dropdown.offsetHeight; 
                    dropdown.classList.add('active');
                } else {
                    dropdown.classList.remove('active');
                    setTimeout(() => {
                        if (!dropdown.classList.contains('active')) {
                            dropdown.style.display = 'none';
                        }
                    }, 200);
                }
            }

            // 로그아웃 버튼 클릭 시
            if (signOutBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('로그아웃 하시겠습니까?')) {
                    localStorage.removeItem('dealchat_users');
                    const isSubPage = window.location.pathname.includes('/html/');
                    const signinPath = isSubPage ? 'signin.html' : 'html/signin.html';
                    window.location.href = signinPath;
                }
            }
            
            // 기타 메뉴 아이템(태그 a) 클릭 시는 기본 동작(이동)을 허용함
        });

        // 외부 클릭 시 드롭다운 닫기
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('user-menu-dropdown');
            if (dropdown && dropdown.classList.contains('active')) {
                // 트리거 버튼이나 드롭다운 영역 내부가 아니면 닫기
                if (!e.target.closest('#user-menu-trigger') && !e.target.closest('#user-menu-dropdown')) {
                    dropdown.classList.remove('active');
                    setTimeout(() => {
                        if (!dropdown.classList.contains('active')) {
                            dropdown.style.display = 'none';
                        }
                    }, 200);
                }
            }
        });
    }

    if (document.getElementById('global-header')) {
        loadHeader();
    } else {
        document.addEventListener('DOMContentLoaded', loadHeader);
    }
})();
