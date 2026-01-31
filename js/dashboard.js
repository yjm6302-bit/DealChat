import { checkAuth, signStoreOut } from './auth_utils.js';

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;

    const userName = userData.name;
    $('#userName').text(userName);
    $('#userName2').text(userName);

    // User Menu Toggle
    $('#user-menu-trigger').on('click', function (e) {
        e.stopPropagation();
        $('#user-menu-dropdown').fadeToggle(150);
    });

    $(document).on('click', function () {
        $('#user-menu-dropdown').fadeOut(150);
    });

    $('#btn-signout').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        signStoreOut();
    });

    $('#user-menu-dropdown').on('click', function (e) {
        e.stopPropagation();
    });
});
