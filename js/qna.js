import { APIcall } from './APIcallFunction.js';
import { initUserMenu } from './auth_utils.js';

$(document).ready(function () {
    const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

    // 헤더 사용자 메뉴 초기화 (드롭다운 동작 등)
    initUserMenu();

    /**
     * 사용자 정보 자동 채우기
     * localStorage에서 로그인된 정보를 가져와 각 입력 필드에 할당합니다.
     */
    function loadUserData() {
        const userDataStr = localStorage.getItem('dealchat_users');
        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                if (userData && userData.isLoggedIn) {

                    if (userData.name) $('input[name="name"]').val(userData.name);
                    if (userData.email) $('input[name="email"]').val(userData.email);
                    if (userData.company) $('input[name="companyName"]').val(userData.company);
                    
                    // 특정 ID를 가진 필드가 있다면 해당 ID로도 접근
                    if (userData.name) $('#qna-name').val(userData.name);
                    if (userData.email) $('#qna-email').val(userData.email);
                    if (userData.company) $('#qna-company').val(userData.company);
                }
            } catch (e) {
                console.error('Error parsing user data in Q&A page', e);
            }
        }
    }

    // 초기 실행
    loadUserData();

    /**
     * 상담문의 폼 제출 핸들러
     */
    $('#qna-form').on('submit', function (e) {
        e.preventDefault();

        // 1. 유효성 검사
        const inquiryType = $('input[name="inquiryType"]:checked').val();
        if (!inquiryType) {
            alert("문의 유형을 선택해주세요.");
            return;
        }

        const formData = {
            table: 'qna',
            action: 'upload',
            inquiry_type: inquiryType,
            name: $('input[name="name"]').val().trim(),
            contact: $('input[name="contact"]').val().trim(),
            email: $('input[name="email"]').val().trim(),
            company_name: $('input[name="companyName"]').val().trim(),
            subject: $('input[name="subject"]').val().trim(),
            content: $('textarea[name="content"]').val().trim(),
            created_at: new Date().toISOString()
        };

        const $btn = $('.btn-submit');
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('제출 중...');

        // 2. API를 통해 데이터 제출
        if (typeof APIcall === 'undefined') {
            console.error("APIcall function is missing.");
            alert("시스템 오류가 발생했습니다. 관리자에게 문의해주세요.");
            $btn.prop('disabled', false).text(originalText);
            return;
        }

        APIcall(formData, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(result => {
                if (result.error) {
                    alert('제출 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert("상담 문의가 성공적으로 접수되었습니다.\n담당자 확인 후 기재하신 연락처로 회신드리겠습니다.");
                    $('#qna-form')[0].reset();
                    // 제출 후 다시 로그인 정보 채우기 (연락처/내용만 비워짐)
                    loadUserData();
                }
            })
            .catch(error => {
                console.error('Q&A Submit Error:', error);
                alert('제출 요청에 실패했습니다. 다시 시도해 주세요.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });
});
