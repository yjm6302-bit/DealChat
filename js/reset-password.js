import { showLoader, hideLoader } from './auth_utils.js';

$(document).ready(function () {
    const $form = $('#reset-password-form');
    const $submitBtn = $('#btn-submit');

    $form.on('submit', async function (e) {
        e.preventDefault();

        const newPassword = $('#new-password').val().trim();
        const confirmPassword = $('#confirm-password').val().trim();

        if (newPassword.length < 6) {
            alert('비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        // 로딩 표시
        const originalText = $submitBtn.text();
        $submitBtn.prop('disabled', true).text('변경 중...');
        showLoader();

        try {
            // 수파베이스 클라이언트 초기화
            const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
            window.supabaseClient = _supabase;

            // 1. 수파베이스 비밀번호 업데이트
            // 재설정 링크를 통해 들어온 경우 이미 인증 세션이 활성화된 상태입니다.
            const { data, error } = await _supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            alert('비밀번호가 성공적으로 변경되었습니다. 새로운 비밀번호로 로그인해주세요.');
            
            // 변경 성공 후 로그아웃 처리 (명시적 재로그인을 유도하기 위함)
            await _supabase.auth.signOut();
            localStorage.removeItem('dealchat_users');
            
            location.href = 'signin.html';

        } catch (err) {
            console.error('Password Update Error:', err);
            alert('비밀번호 변경 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            $submitBtn.prop('disabled', false).text(originalText);
            hideLoader();
        }
    });
});
