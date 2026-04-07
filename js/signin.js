import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

$(document).ready(function () {
  const $form = $('#signin-form');
  const $loginBtn = $('.btn-login');

  $form.on('submit', async function (e) {
    e.preventDefault();

    const email = $('#user-email').val().trim();
    const password = $('#user-password').val().trim();

    if (!email || !password) {
      alert('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    // 로딩 상태
    const originalText = $loginBtn.text();
    $loginBtn.prop('disabled', true).text('로그인 중...');

    try {
      // 수파베이스 클라이언트 초기화
      const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
      window.supabaseClient = _supabase;

      // 1. 수파베이스 인증 로그인
      const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) throw error;

      // 2. 로그인 성공 시 사용자 데이터 구성
      const user = data.user;
      
      // public.users 테이블에서 상세 프로필 조회 (동기화 용도)
      const { data: dbUser } = await _supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

      const userData = {
        id: user.id,
        email: user.email,
        name: (dbUser && dbUser.name) || user.user_metadata.name || '사용자',
        company: (dbUser && dbUser.company) || user.user_metadata.company || '',
        avatar: (dbUser && dbUser.avatar_url) || user.user_metadata.avatar_url || user.user_metadata.avatar || null,
        status: (dbUser && dbUser.status) || 'pending',
        role: (dbUser && dbUser.role) || 'reviewer',
        isLoggedIn: true
      };

      // 3. 승인 상태 체크
      if (userData.status === 'pending') {
        alert('관리자의 가입 승인을 기다리는 중입니다. 승인 후 이용 가능합니다.');
        await _supabase.auth.signOut();
        return;
      } else if (userData.status === 'rejected') {
        alert('가입 승인이 거부되었습니다. 관리자에게 문의해 주세요.');
        await _supabase.auth.signOut();
        return;
      }

      alert(`환영합니다, ${userData.name}님!`);
      localStorage.setItem('dealchat_users', JSON.stringify(userData));
      
      // 페이지 이동
      const currentPath = location.pathname;
      const isSubPage = currentPath.includes('/html/') || currentPath.endsWith('/html');
      if (userData.role === 'buyer') {
        location.href = isSubPage ? './total_sellers.html' : './html/total_sellers.html';
      } else {
        location.href = isSubPage ? './index.html' : './html/index.html';
      }

    } catch (err) {
      console.error('Login Error:', err);
      if (err.message.includes('Invalid login credentials')) {
        alert('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        alert('로그인 처리 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      $loginBtn.prop('disabled', false).text(originalText);
    }
  });
});
