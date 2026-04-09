import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;

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
            id: id,
            type: 'seller'
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                const item = Array.isArray(data) ? data[0] : data;
                if (item) {
                    $('#seller-id').val(item.id);
                    $('#companyName').val(item.company_name || item.companyName);
                    $('#summary').val(item.summary);
                    $('#industry').val(item.industry);
                    $('#sale_method').val(item.sale_method);
                    $('#status').val(item.status || '대기');
                    $('#sale_price').val(item.matching_price || item.sale_price);
                    $('#user_id').val(item.user_id || item.user_id);
                    $('#others').val(item.others);
                    
                    if (item.created_at) {
                        const d = new Date(item.created_at);
                        const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        $('#created_at').val(dateStr);
                    }
                    if (item.updated_at) {
                        const d = new Date(item.updated_at);
                        const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        $('#updated_at').val(dateStr);
                    }

                    // 공유 설정 (share_type) 라디오 버튼 매칭
                    if (item.share_type) {
                        $(`input[name="share_type"][value="${item.share_type}"]`).prop('checked', true);
                    }

                    // 공유 대상 (share_with) 처리
                    if (item.share_with && Array.isArray(item.share_with)) {
                        // share_with 데이터가 있으면 체크박스나 선택 UI에 반영
                    }
                }
            })
            .catch(err => console.error('Data Load Error:', err));
    }
});
