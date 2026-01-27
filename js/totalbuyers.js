import { APIcall } from './APIcallFunction.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';

let gridApi;

// 전역에서 접근 가능하도록 함수 선언 (gridOptions에서 참조)
let openBuyerModal;

$(document).ready(function () {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }
    const userId = userData.id;
    const columnDefs = [
        { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true },
        { field: "companyName", headerName: "바이어", sortable: true, filter: true, flex: 1 },
        { field: "summary", headerName: "바이어요약", sortable: true, filter: true, flex: 1.5 },
        { field: "investment_amount", headerName: "투자규모", sortable: true, filter: true, flex: 1 },
        { field: "interest_industry", headerName: "관심산업", sortable: true, filter: true, flex: 1.5 }
    ];

    const gridOptions = {
        columnDefs: columnDefs,
        rowModelType: 'infinite',
        cacheBlockSize: 100,
        maxConcurrentDatasourceRequests: 1,
        infiniteInitialRowCount: 1,
        theme: 'legacy',
        defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true
        },
        pagination: true,
        paginationPageSize: 20,
        onRowClicked: (params) => {
            const data = params.data;
            if (data) {
                openBuyerModal(data);
            }
        }
    };

    const gridDiv = document.querySelector('#buyerGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();

            APIcall({
                action: 'get',
                table: 'buyers',
                scanMode: true,
                keyword: keyword
            }, LAMBDA_URL, {
                'Content-Type': 'application/json'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        console.error('Lambda Error:', data.error);
                        params.failCallback();
                        return;
                    }

                    const rows = Array.isArray(data) ? data : [];
                    params.successCallback(rows, rows.length);
                })
                .catch(error => {
                    console.error('Fetch Error:', error);
                    params.failCallback();
                });
        }
    };

    gridApi.setGridOption('datasource', datasource);

    $('#search-btn').on('click', () => {
        gridApi.setGridOption('datasource', datasource);
    });

    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) {
            gridApi.setGridOption('datasource', datasource);
        }
    });

    $('.logo').on('click', () => {
        $('#search-input').val('');
        gridApi.setGridOption('datasource', datasource);
    });

    // --- Modal Logic ---
    const $modal = $('#buyer-modal');
    const $form = $('#buyer-form');

    openBuyerModal = function (data = null) {
        $form[0].reset();

        // 기본 정보 채우기
        $('#buyer-id').val(data.id || '');
        $('#companyName').val(data.companyName || '');
        $('#summary').val(data.summary || '');
        $('#interest_industry').val(data.interest_industry || '');
        $('#investment_method').val(data.investment_method || '');
        $('#investment_amount').val(data.investment_amount || '');
        $('#userId').val(data.userId || userId);
        $('#etc').val(data.etc || '');

        // 공유 파일 처리
        $('#shared-files-container').empty();
        if (data.shared_files && Array.isArray(data.shared_files)) {
            data.shared_files.forEach(file => {
                const chip = $(`
                    <div class="chip">
                        <span class="material-symbols-outlined" style="font-size: 16px;">description</span>
                        <span>${file}</span>
                    </div>
                `);
                $('#shared-files-container').append(chip);
            });
        }

        $modal.css('display', 'flex');
    }

    $('#close-modal, #cancel-btn').on('click', () => {
        $modal.hide();
    });

});
