import { showLoader, hideLoader } from './auth_utils.js';

$(document).ready(function () {
    const $form = $('#forgot-password-form');
    const $submitBtn = $('#btn-submit');

    $form.on('submit', async function (e) {
        e.preventDefault();

        const email = $('#user-email').val().trim();
        if (!email) {
            alert('이메일 주소를 입력해주세요.');
            return;
        }

        // 로딩 표시
        const originalText = $submitBtn.text();
        $submitBtn.prop('disabled', true).text('요청 중...');
        showLoader();

        try {
            // 수파베이스 클라이언트 초기화
            const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
            window.supabaseClient = _supabase;

            // 재설정 링크가 랜딩될 URL (개발/배포 환경에 따라 조정될 수 있음)
            const resetUrl = `${window.location.origin}${window.location.pathname.replace('forgot-password.html', 'reset-password.html')}`;

            // 1. 수파베이스 비밀번호 재설정 요청
            const { data, error } = await _supabase.auth.resetPasswordForEmail(email, {
                redirectTo: resetUrl,
            });

            if (error) throw error;

            alert('비밀번호 재설정 링크를 이메일로 보내드렸습니다. 메일함을 확인해주세요.');
            // 로그인 페이지로 돌아가기
            location.href = 'signin.html';

        } catch (err) {
            console.error('Password Reset Request Error:', err);
            alert('요청 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            $submitBtn.prop('disabled', false).text(originalText);
            hideLoader();
        }
    });
});
