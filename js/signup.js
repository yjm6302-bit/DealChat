import { APIcall } from './APIcallFunction.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';

$(document).ready(function () {
    const $form = $('#signup-form');
    const $signupBtn = $('.btn-signup');
    const $agreeAll = $('#agree-all');
    const $agreeItems = $('.agree-item');

    // 전체 동의 체크박스 처리
    $agreeAll.on('change', function () {
        const isChecked = $(this).prop('checked');
        $agreeItems.prop('checked', isChecked);
    });

    // 개별 체크박스 처리
    $agreeItems.on('change', function () {
        const allChecked = $agreeItems.filter(':checked').length === $agreeItems.length;
        $agreeAll.prop('checked', allChecked);
    });

    // 비밀번호 유효성 검사
    function validatePassword(password) {
        // 8자 이상, 영문/숫자/특수문자 조합
        const minLength = password.length >= 8;
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return minLength && hasLetter && hasNumber && hasSpecial;
    }

    // 이메일 유효성 검사
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    $form.on('submit', function (e) {
        e.preventDefault();

        const email = $('#user-email').val().trim();
        const password = $('#user-password').val();
        const passwordConfirm = $('#user-password-confirm').val();
        const name = $('#user-name').val().trim();
        const company = $('#user-company').val().trim();
        const agreeTerms = $('#agree-terms').prop('checked');
        const agreePrivacy = $('#agree-privacy').prop('checked');
        const agreeMarketing = $('#agree-marketing').prop('checked');

        // 유효성 검사
        if (!email || !password || !passwordConfirm || !name) {
            alert('필수 항목을 모두 입력해주세요.');
            return;
        }

        if (!validateEmail(email)) {
            alert('올바른 이메일 주소를 입력해주세요.');
            return;
        }

        if (!validatePassword(password)) {
            alert('비밀번호는 8자 이상, 영문/숫자/특수문자를 포함해야 합니다.');
            return;
        }

        if (password !== passwordConfirm) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (!agreeTerms || !agreePrivacy) {
            alert('필수 약관에 동의해주세요.');
            return;
        }

        // 로딩 상태
        const originalText = $signupBtn.text();
        $signupBtn.prop('disabled', true).text('가입 처리 중...');

        // dealchat_users 테이블에 사용자 정보 저장
        const userData = {
            id: crypto.randomUUID(), // 고유 ID 생성
            email: email,
            password: password, // 실제 환경에서는 암호화 필요
            name: name,
            company: company || '',
            agreeTerms: agreeTerms,
            agreePrivacy: agreePrivacy,
            agreeMarketing: agreeMarketing,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            table: 'users',
            action: 'create'
        };

        APIcall(userData, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    // 이메일 중복 등의 에러 처리
                    if (data.error.includes('duplicate') || data.error.includes('already exists')) {
                        alert('이미 가입된 이메일입니다.');
                    } else {
                        alert('회원가입 중 오류가 발생했습니다: ' + data.error);
                    }
                } else {
                    alert('회원가입이 완료되었습니다!\n로그인 페이지로 이동합니다.');
                    location.href = './signin.html';
                }
            })
            .catch(err => {
                console.error('Signup Error:', err);
                alert('회원가입 처리 중 오류가 발생했습니다.');
            })
            .finally(() => {
                $signupBtn.prop('disabled', false).text(originalText);
            });
    });
});
