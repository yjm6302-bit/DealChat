import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let gridApi;
let openSellerModal;

const columnDefs = [
    { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true },
    { field: "companyName", headerName: "매도자명", sortable: true, filter: true, flex: 1 },
    { field: "industry", headerName: "산업", sortable: true, filter: true, flex: 1 },
    { field: "sale_price", headerName: "가격(억원)", sortable: true, filter: true, flex: 1 },
    { field: "summary", headerName: "요약", sortable: true, filter: true, flex: 2.5 }
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
            openSellerModal(data);
        }
    }
};

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const userId = userData.id;

    const gridDiv = document.querySelector('#sellerGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();

            APIcall({
                action: 'get',
                table: 'sellers',
                scanMode: true,
                keyword: keyword
            }, SUPABASE_ENDPOINT, {
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
    const $modal = $('#seller-modal');
    const $form = $('#seller-form');

    openSellerModal = function (data = null) {
        $form[0].reset();

        // 기본 정보 채우기
        $('#seller-id').val(data.id || '');
        $('#companyName').val(data.companyName || '');
        $('#summary').val(data.summary || '');
        $('#industry').val(data.industry || '');
        $('#sale_method').val(data.sale_method || '');
        $('#sale_price').val(data.sale_price || '');
        $('#userId').val(data.userId || userId);
        $('#others').val(data.others || '');

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
