import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

const columnDefs = [
    { field: "check", headerName: "CH", sortable: false, filter: false, flex: 0.2, checkboxSelection: true, headerCheckboxSelection: true },
    { field: "companyName", headerName: "기업명", sortable: true, filter: true, flex: 1 },
    { field: "industry", headerName: "산업", sortable: true, filter: true, flex: 1 },
    { field: "summary", headerName: "요약", sortable: true, filter: true, flex: 2.5 },
    { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true }
];

const gridOptions = {
    columnDefs: columnDefs,
    rowModelType: 'infinite',
    rowSelection: 'multiple',
    getRowId: (params) => params.data.id, // ID를 기반으로 행 식별 (선택 상태 유지에 중요)
    suppressRowClickSelection: true,
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
        // 체크박스 영역이나 체크박스 자체를 클릭한 경우 이동하지 않음
        const target = params.event.target;
        if (target.classList.contains('ag-selection-checkbox') ||
            target.closest('.ag-selection-checkbox') ||
            target.type === 'checkbox') {
            return;
        }

        const id = params.data.id;
        if (id) {
            window.location.href = `./dealbook.html?id=${encodeURIComponent(id)}`;
        }
    }
};

let gridApi;

$(document).ready(function () {
    // 로그인 체크
    const userData = checkAuth();
    if (!userData) return;
    const userId = userData.id;

    const gridDiv = document.querySelector('#companyGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();
            const payload = {
                action: 'get',
                table: 'companies',
                userId: userId,
                keyword: keyword
            };

            APIcall(payload, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        params.failCallback();
                        return;
                    }
                    const rows = Array.isArray(data) ? data : [];
                    params.successCallback(rows, rows.length);
                })
                .catch(error => {
                    params.failCallback();
                });
        }
    };

    gridApi.setGridOption('datasource', datasource);

    // 삭제 기능 구현
    $('#delete-btn').on('click', function () {
        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length === 0) {
            alert('삭제할 항목을 선택해주세요.');
            return;
        }

        if (!confirm(`선택한 ${selectedRows.length}개의 기업 정보를 삭제하시겠습니까?`)) {
            return;
        }

        const deletePromises = selectedRows.map(row => {
            const payload = {
                action: 'delete',
                id: row.id,
                table: 'companies',
                userId: userId
            };

            return APIcall(payload, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' }, 'DELETE')
                .then(res => res.json());
        });

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('삭제 중...');

        Promise.all(deletePromises)
            .then(results => {
                const errors = results.filter(r => r.error);
                if (errors.length > 0) {
                    alert(`${errors.length}건의 삭제 작업 중 오류가 발생했습니다.`);
                } else {
                    alert('성공적으로 삭제되었습니다.');
                }
                gridApi.setGridOption('datasource', datasource);
            })
            .catch(err => {
                console.error('Batch Delete Error:', err);
                alert('삭제 요청 중 오류가 발생했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    // 검색/이벤트 핸들러들
    $('#search-btn').on('click', () => gridApi.setGridOption('datasource', datasource));
    $('#search-input').on('keypress', (e) => { if (e.which === 13) gridApi.setGridOption('datasource', datasource); });
    $('.logo').on('click', () => { $('#search-input').val(''); gridApi.setGridOption('datasource', datasource); });
    $('#new-btn').on('click', () => {
        const modalEl = document.getElementById('new-company-modal');
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });

    $('#save-new-company').on('click', function () {
        const companyName = $('#new-company-name').val().trim();
        const industry = $('#new-company-industry').val().trim();
        const summary = $('#new-company-summary').val().trim();

        if (!companyName || !industry || !summary) {
            alert('모든 필드를 입력해 주세요.');
            return;
        }

        const now = new Date().toISOString();
        const payload = {
            companyName: companyName,
            industry: industry,
            summary: summary,
            table: 'companies',
            action: 'upload',
            userId: userId,
            created_at: now,
            updated_at: now
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('등록 중...');

        APIcall(payload, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            .then(response => response.json())
            .then(result => {
                if (result.error) alert('등록 중 오류 발생: ' + result.error);
                else {
                    alert('새 기업이 등록되었습니다.');
                    bootstrap.Modal.getInstance(document.getElementById('new-company-modal')).hide();
                    $('#new-company-form')[0].reset();
                    gridApi.setGridOption('datasource', datasource);
                }
            })
            .catch(() => alert('등록 요청 실패'))
            .finally(() => $btn.prop('disabled', false).text(originalText));
    });
});
