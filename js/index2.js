$(document).ready(function () {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }
    const userId = userData.id;
    const userName = userData.name;

    $('#userName').text(userName);
    $('#userName2').text(userName);
});