import { APIcall } from './APIcallFunction.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';

$(document).ready(function () {
  const $form = $('#signin-form');
  const $loginBtn = $('.btn-login');

  $form.on('submit', function (e) {
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

    // users 테이블에서 사용자 조회
    APIcall({
      table: 'users',
      action: 'read',
      email: email,
      password: password
    }, LAMBDA_URL, {
      'Content-Type': 'application/json'
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }

        // 이메일로 사용자 찾기
        const user = data.find(u => u.email === email);

        if (!user) {
          alert('등록되지 않은 이메일입니다.');
          $loginBtn.prop('disabled', false).text(originalText);
          return;
        }

        // 비밀번호 확인
        if (user.password !== password) {
          alert('비밀번호가 올바르지 않습니다.');
          $loginBtn.prop('disabled', false).text(originalText);
          return;
        }

        const userData = {
          id: user.id,
          email: user.email,
          name: user.name,
          company: user.company || '',
          isLoggedIn: true
        };

        alert(`환영합니다, ${user.name}님!`);
        localStorage.setItem('dealchat_users', JSON.stringify(userData));
        location.href = './index.html';
      })
      .catch(err => {
        console.error('Login Error:', err);
        alert('로그인 처리 중 오류가 발생했습니다.');
        $loginBtn.prop('disabled', false).text(originalText);
      });
  });
});
