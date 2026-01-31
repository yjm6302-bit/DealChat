import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const userId = userData.id;

    const urlParams = new URLSearchParams(window.location.search);
    const buyerId = urlParams.get('id');

    if (buyerId) {
        loadBuyerData(buyerId);
    }

    function loadBuyerData(id) {
        APIcall({
            action: 'get',
            table: 'buyers',
            id: id
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                const item = Array.isArray(data) ? data[0] : data;
                if (item) {
                    $('#seller-id').val(item.id); // ID 필드명이 seller-id로 되어 있음 (HTML 기준)
                    $('#companyName').val(item.companyName);
                    $('#summary').val(item.summary);
                    $('#industry').val(item.industry);
                    $('#sale_method').val(item.sale_method);
                    $('#sale_price').val(item.sale_price);
                    $('#userId').val(item.userId);
                    $('#others').val(item.others);
                }
            })
            .catch(err => console.error('Data Load Error:', err));
    }

    $('#save-btn').on('click', function () {
        const formData = {
            id: $('#seller-id').val(),
            companyName: $('#companyName').val(),
            summary: $('#summary').val(),
            industry: $('#industry').val(),
            sale_method: $('#sale_method').val(),
            sale_price: $('#sale_price').val(),
            userId: $('#userId').val(),
            others: $('#others').val(),
            table: 'buyers',
            action: 'update'
        };

        const $btn = $(this);
        $btn.prop('disabled', true).text('저장 중...');

        APIcall(formData, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('저장 오류: ' + result.error);
                } else {
                    alert('저장되었습니다.');
                }
            })
            .catch(err => alert('요청 실패: ' + err.message))
            .finally(() => $btn.prop('disabled', false).text('Update'));
    });

    $('#delete-btn').on('click', function () {
        if (!confirm('정말로 삭제하시겠습니까?')) return;

        const id = $('#seller-id').val();
        APIcall({
            action: 'delete',
            table: 'buyers',
            id: id
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(() => {
                alert('삭제되었습니다.');
                location.href = './buyers.html';
            })
            .catch(err => alert('삭제 실패: ' + err.message));
    });
});
