import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const userId = userData.id;

    // URL 파라미터에서 ID 추출
    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('id');

    if (sellerId) {
        loadSellerData(sellerId);
    }

    // 데이터 로드 함수
    function loadSellerData(id) {
        APIcall({
            action: 'get',
            table: 'sellers',
            id: id
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                const item = Array.isArray(data) ? data[0] : data;
                console.log(item);
                if (item) {
                    $('#seller-id').val(item.id);
                    $('#companyName').val(item.companyName);
                    $('#summary').val(item.summary);
                    $('#industry').val(item.industry);
                    $('#sale_method').val(item.sale_method);
                    $('#sale_price').val(item.sale_price);
                    $('#userId').val(item.userId);
                    $('#others').val(item.others);
                    $('#created_at').val(item.created_at);
                    $('#updated_at').val(item.updated_at);

                    // 공유 설정 (share_type) 라디오 버튼 매칭
                    if (item.share_type) {
                        $(`input[name="share_type"][value="${item.share_type}"]`).prop('checked', true);
                    }

                    // 공유 대상 (share_with) 처리
                    if (item.share_with && Array.isArray(item.share_with)) {
                        // share_with 데이터가 있으면 체크박스나 선택 UI에 반영
                        // 예: item.share_with.forEach(id => $(`#share-target-${id}`).prop('checked', true));
                    }
                }
            })
            .catch(err => console.error('Data Load Error:', err));
    }

    // 저장 버튼 이벤트
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
            share_type: $('input[name="share_type"]:checked').val(),
            share_with: [], // 공유 대상 선택 로직 추가 필요 시 여기에 배열 추가
            updated_at: new Date().toISOString(),
            table: 'sellers',
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

    // 삭제 버튼 이벤트
    $('#delete-btn').on('click', function () {
        if (!confirm('정말로 삭제하시겠습니까?')) return;

        const id = $('#seller-id').val();
        APIcall({
            action: 'delete',
            table: 'sellers',
            id: id
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(() => {
                alert('삭제되었습니다.');
                location.href = './sellers.html';
            })
            .catch(err => alert('삭제 실패: ' + err.message));
    });
});
