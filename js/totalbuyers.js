import { APIcall } from './APIcallFunction.js';

const LAMBDA_URL = 'https://fx4w4useafzrufeqxfqui6z5p40aazkb.lambda-url.ap-northeast-2.on.aws/';

let gridApi;

// 전역에서 접근 가능하도록 함수 선언 (gridOptions에서 참조)
let openBuyerModal;

$(document).ready(function () {
    const userData = JSON.parse(localStorage.getItem('dealchat_users'));
    const userId = userData.id;

    if (!userData || !userData.isLoggedIn) {
        alert('로그인 후 이용해주세요.');
        location.href = './signin.html';
        return;
    }
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
                table: 'buyers',
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
    const $modalTitle = $modal.find('.modal-header h3');
    const $saveBtn = $('#save-buyer-btn');
    const $deleteBtn = $('#delete-buyer-btn');
    let currentAction = 'create';

    openBuyerModal = function (data = null) {
        $form[0].reset();

        if (data) {
            // 상세/수정 모드
            currentAction = 'update';
            $modalTitle.text('바이어 상세');
            $saveBtn.text('저장');
            $deleteBtn.show();

            $('input[name="id"]').val(data.id || '');
            $('input[name="companyName"]').val(data.companyName || '');
            $('textarea[name="summary"]').val(data.summary || '');
            $('textarea[name="interest_summary"]').val(data.interest_summary || '');
            $('input[name="interest_industry"]').val(data.interest_industry || '');
            $('input[name="investment_amount"]').val(data.investment_amount || '');
            $('input[name="etc"]').val(data.etc || '');
        } else {
            // 신규 등록 모드
            currentAction = 'create';
            $modalTitle.text('바이어 등록');
            $saveBtn.text('등록');
            $deleteBtn.hide();

            const randomId = crypto.randomUUID();
            $('input[name="id"]').val(randomId);
        }

        $modal.css('display', 'flex');
    }

    $('#new-btn').on('click', () => {
        openBuyerModal();
    });

    $('#close-modal, #cancel-btn').on('click', () => {
        $modal.hide();
    });

    $('#save-buyer-btn').on('click', function () {
        const formData = {
            id: $('input[name="id"]').val(),
            companyName: $('input[name="companyName"]').val().trim(),
            summary: $('textarea[name="summary"]').val().trim(),
            interest_summary: $('textarea[name="interest_summary"]').val().trim(),
            interest_industry: $('input[name="interest_industry"]').val().trim(),
            investment_amount: $('input[name="investment_amount"]').val().trim(),
            etc: $('input[name="etc"]').val().trim(),
            userId: "67b320626fc0e9133183cb8b",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            table: 'buyers',
            action: currentAction
        };

        if (currentAction === 'create') {
            formData.createdAt = new Date().toISOString();
        }

        if (!formData.companyName) {
            alert('회사명을 입력해주세요.');
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('등록 중...');

        APIcall(formData, LAMBDA_URL, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('등록 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('성공적으로 등록되었습니다.');
                    $modal.hide();
                    gridApi.setGridOption('datasource', datasource); // 그리드 새로고침
                }
            })
            .catch(error => {
                console.error('Create Error:', error);
                alert('등록 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    // 삭제 처리
    $deleteBtn.on('click', function () {
        const id = $('input[name="id"]').val();
        if (!id) return;

        if (!confirm('정말로 이 바이어 정보를 삭제하시겠습니까?')) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('삭제 중...');

        APIcall({
            id: id,
            table: 'buyers',
            action: 'delete'
        }, LAMBDA_URL, {
            'Content-Type': 'application/json'
        }, 'DELETE')
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('삭제 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('성공적으로 삭제되었습니다.');
                    $modal.hide();
                    gridApi.setGridOption('datasource', datasource); // 그리드 새로고침
                }
            })
            .catch(error => {
                console.error('Delete Error:', error);
                alert('삭제 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });
});
