import { APIcall } from './APIcallFunction.js';
import { checkAuth, updateHeaderProfile, initUserMenu, signStoreOut, resolveAvatarUrl } from './auth_utils.js';

$(document).ready(function () {
    // 1. 인증 확인
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;

    // 초기화
    updateHeaderProfile(userData);
    initUserMenu();

    let currentAvatar = userData.avatar || userData.avatar_url;
    let selectedFile = null;

    // 수파베이스 클라이언트 초기화 통합
    const _supabase = window.supabaseClient || supabase.createClient(window.config.supabase.url, window.config.supabase.anonKey);
    window.supabaseClient = _supabase;

    // 2. 탭 전환 로직
    $('.menu-item').on('click', function () {
        const targetTab = $(this).data('tab');
        $('.menu-item').removeClass('active');
        $(this).addClass('active');

        $('.tab-pane').removeClass('active');
        $(`#tab-${targetTab}`).addClass('active');
    });

    // 3. 사용자 정보 로드
    async function loadUserDetails() {
        try {
            const { data: { user: authUser }, error: authError } = await _supabase.auth.getUser();
            
            if (authError || !authUser) {
                console.error('Auth error:', authError);
                return;
            }

            const { data: user, error } = await _supabase
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .maybeSingle();

            if (error) {
                console.error('Database fetch error:', error);
                const meta = authUser.user_metadata || {};
                $('#edit-name').val(meta.name || '');
                $('#edit-email').val(authUser.email || '');
                $('#edit-phone').val(meta.phone || '');
                $('#edit-company').val(meta.company || '');
                $('#edit-department').val(meta.department || '');
                
                const metaAvatar = meta.avatar_url || meta.avatar;
                if (metaAvatar) {
                    currentAvatar = metaAvatar;
                    highlightAvatar(currentAvatar);
                }
                return;
            }

            const meta = authUser.user_metadata || {};
            if (user) {
                $('#edit-name').val(user.name || meta.name || '');
                $('#edit-email').val(user.email || authUser.email || '');
                $('#edit-phone').val(user.phone || meta.phone || '');
                $('#edit-company').val(user.company || meta.company || '');
                $('#edit-department').val(user.department || meta.department || '');
                
                // 약관 동의 상태 로드
                const marketingConsent = user.agree_marketing ?? (meta.agree_marketing || false);
                $('#agree-marketing').prop('checked', marketingConsent);

                if (user.avatar_url) {
                    currentAvatar = user.avatar_url;
                    highlightAvatar(currentAvatar);
                } else {
                    const metaAvatar = meta.avatar_url || meta.avatar;
                    if (metaAvatar) {
                        currentAvatar = metaAvatar;
                        highlightAvatar(currentAvatar);
                    }
                }
            } else {
                $('#edit-name').val(meta.name || '');
                $('#edit-email').val(authUser.email || '');
                $('#edit-phone').val(meta.phone || '');
                $('#edit-company').val(meta.company || '');
                $('#edit-department').val(meta.department || '');
                
                // 약관 동의 상태 로드
                $('#agree-marketing').prop('checked', meta.agree_marketing || false);

                const metaAvatar = meta.avatar_url || meta.avatar;
                if (metaAvatar) {
                    currentAvatar = metaAvatar;
                    highlightAvatar(currentAvatar);
                }
            }
        } catch (err) {
            console.error('Failed to load user details:', err);
        }
    }

    loadUserDetails();
    
    if (userData.avatar) {
        highlightAvatar(userData.avatar);
    }

    // 4. 아바타 선택 로직
    $('.avatar-option:not(.custom-upload)').on('click', function () {
        $('.avatar-option').removeClass('selected');
        $(this).addClass('selected');
        currentAvatar = $(this).data('avatar');
        selectedFile = null;
    });

    // 전화번호 포맷팅
    $('#edit-phone').on('input', function() {
        let val = $(this).val().replace(/[^0-9]/g, '');
        if (val.length > 3 && val.length <= 7) {
            val = val.slice(0, 3) + '-' + val.slice(3);
        } else if (val.length > 7) {
            val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7);
        }
        $(this).val(val);
    });

    function highlightAvatar(url) {
        $('.avatar-option').removeClass('selected');
        const resolvedUrl = resolveAvatarUrl(url, 1);
        
        if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('data:image'))) {
            $('#btn-custom-avatar').addClass('selected');
            $('#btn-custom-avatar').html(`<img src="${resolvedUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`);
        } else if (url) {
            $(`.avatar-option[data-avatar="${url}"]`).addClass('selected');
        }
    }

    // 5. 커스텀 아바타 업로드
    $('#btn-custom-avatar').on('click', () => $('#custom-avatar-input').click());

    $('#custom-avatar-input').on('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert('파일 용량이 너무 큽니다. 2MB 이하의 이미지를 선택해주세요.');
            return;
        }

        const btn = $('#btn-custom-avatar');
        const originalHtml = btn.html();
        btn.html('<div class="spinner-border spinner-border-sm text-secondary" role="status"></div>');

        try {
            // Supabase Storage에 업로드
            const fileExt = file.name.split('.').pop();
            const fileName = `${user_id}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { data, error } = await _supabase.storage
                .from('uploads') // 기존에 존재하는 uploads 버킷 사용
                .upload(filePath, file, { upsert: true });

            if (error) throw error;

            const { data: { publicUrl } } = _supabase.storage
                .from('uploads')
                .getPublicUrl(filePath);

            $('.avatar-option').removeClass('selected');
            btn.addClass('selected');
            btn.html(`<img src="${publicUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`);
            currentAvatar = publicUrl;
            selectedFile = file;
            


        } catch (err) {
            console.error('Avatar upload error:', err);
            alert('이미지 업로드 중 오류가 발생했습니다: ' + err.message);
            btn.html(originalHtml);
        }
    });

    // 6. 회원 정보 저장
    $('#btn-save-profile').on('click', async function () {
        const name = $('#edit-name').val().trim();
        const phone = $('#edit-phone').val().trim();
        const company = $('#edit-company').val().trim();
        const department = $('#edit-department').val().trim();
        const agreeMarketing = $('#agree-marketing').prop('checked');

        if (!name) {
            alert('이름은 필수 입력 항목입니다.');
            return;
        }

        const btn = $(this);
        const originalText = btn.text();
        btn.prop('disabled', true).text('저장 중...');

        try {
            const { data: { user: authUser }, error: authError } = await _supabase.auth.getUser();
            
            if (authError || !authUser) {
                alert('인증 세션이 만료되었습니다. 다시 로그인해주세요.');
                location.href = './signin.html';
                return;
            }

            const currentuser_id = authUser.id;

            const updateData = {
                id: currentuser_id,
                name: name,
                phone: phone,
                company: company,
                department: department,
                avatar_url: currentAvatar,
                email: authUser.email,
                agree_marketing: agreeMarketing,
                is_active: true,
                updated_at: new Date().toISOString()
            };

            const { error: upsertError } = await _supabase
                .from('users')
                .upsert(updateData, { onConflict: 'id' });

            if (upsertError) throw upsertError;

            await _supabase.auth.updateUser({
                data: { 
                    name: name, 
                    company: company,
                    phone: phone,
                    department: department,
                    avatar_url: currentAvatar,
                    agree_marketing: agreeMarketing
                }
            });

            alert('회원 정보가 성공적으로 수정되었습니다.');
            
            const updatedUserData = {
                ...userData,
                name: name,
                company: company,
                avatar: currentAvatar,
                avatar_url: currentAvatar,
                agree_marketing: agreeMarketing
            };
            localStorage.setItem('dealchat_users', JSON.stringify(updatedUserData));
            updateHeaderProfile(updatedUserData);
            
            // 페이지 새로고침
            location.reload();

        } catch (err) {
            console.error('Update error:', err);
            alert('정보 수정 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
        } finally {
            btn.prop('disabled', false).text(originalText);
        }
    });

    // 7. 비밀번호 변경
    $('#btn-change-password').on('click', async function () {
        const newPwd = $('#new-password').val();
        const newPwdConfirm = $('#new-password-confirm').val();

        if (!newPwd || !newPwdConfirm) {
            alert('비밀번호 정보를 모두 입력해주세요.');
            return;
        }

        if (newPwd !== newPwdConfirm) {
            alert('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        const pwdRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!pwdRegex.test(newPwd)) {
            alert('비밀번호는 8자 이상, 영문/숫자/특수문자를 포함해야 합니다.');
            return;
        }

        const btn = $(this);
        btn.prop('disabled', true).text('변경 중...');

        try {
            const { error } = await _supabase.auth.updateUser({
                password: newPwd
            });

            if (error) throw error;

            alert('비밀번호가 성공적으로 변경되었습니다.');
            $('#current-password, #new-password, #new-password-confirm').val('');
        } catch (err) {
            console.error('Password update error:', err);
            alert('비밀번호 변경 중 오류가 발생했습니다: ' + err.message);
        } finally {
            btn.prop('disabled', false).text('비밀번호 변경');
        }
    });

    // 8. 회원 탈퇴
    $('#btn-delete-user').on('click', async function () {
        if (confirm('정말로 회원 탈퇴를 진행하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
            try {
                const { error } = await _supabase
                    .from('users')
                    .delete()
                    .eq('id', user_id);

                if (error) throw error;

                await _supabase.auth.signOut();
                localStorage.removeItem('dealchat_users');
                alert('회원 탈퇴가 완료되었습니다.');
                location.href = '../index.html';

            } catch (err) {
                console.error('Delete user error:', err);
                alert('탈퇴 처리 중 오류가 발생했습니다.');
            }
        }
    });
});
