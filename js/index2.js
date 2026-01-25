$(document).ready(function () {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    const userId = userData.id;
    const userName = userData.name;
    console.log(userData);
    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }

    $('#userName').text(userName);
    $('#userName2').text(userName);
});