import { checkAuth } from './auth_utils.js';
const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

const columnDefs = [
    { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true },
    { field: "companyName", headerName: "기업명", sortable: true, filter: true, flex: 1 },
    { field: "industry", headerName: "산업", sortable: true, filter: true, flex: 1 },
    { field: "summary", headerName: "요약", sortable: true, filter: true, flex: 2.5 }
];

const gridOptions = {
    columnDefs: columnDefs,
    rowModelType: 'infinite',
    cacheBlockSize: 100,
    maxConcurrentDatasourceRequests: 1,
    infiniteInitialRowCount: 1,
    theme: 'legacy', // 최신 AG Grid 라이브러리에서 레거시 CSS 테마를 사용하기 위한 필수 설정
    defaultColDef: {
        resizable: true,
        sortable: true,
        filter: true
    },
    pagination: true,
    paginationPageSize: 20,
    onRowClicked: (params) => {
        const id = params.data.id;
        if (id) {
            window.location.href = `./html/dealbook.html?id=${encodeURIComponent(id)}`;
        }
    }
};

let gridApi;

$(document).ready(function () {
    const gridDiv = document.querySelector('#companyGrid');
    // AG Grid v30+ 초기화 방식
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();

            // 람다 함수가 POST를 지원하고, keyword가 없어도 전체 조회를 지원하도록 수정되었으므로
            // 명확하게 JSON 바디를 담아 POST 요청을 보냅니다.
            window.APIcall({
                table: 'companies',
                keyword: keyword,
                action: 'get' // Added action: 'get' to match Supabase function expectation
            }, SUPABASE_ENDPOINT, {
                'Content-Type': 'application/json'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        console.error('API Error:', data.error);
                        params.failCallback();
                        return;
                    }

                    const rows = Array.isArray(data) ? data : [];
                    // Infinite Row Model은 전체 데이터 개수를 알 수 없을 때 -1을 넘길 수 있지만,
                    // 람다가 전체 리스트를 반환하므로 rows.length를 정확히 넘겨줍니다.
                    params.successCallback(rows, rows.length);
                })
                .catch(error => {
                    console.error('Fetch Error:', error);
                    params.failCallback();
                });
        }
    };

    // 초기 데이터 로드 (데이터소스 설정)
    gridApi.setGridOption('datasource', datasource);

    // 검색 버튼 이벤트
    $('#search-btn').on('click', () => {
        gridApi.setGridOption('datasource', datasource);
    });

    // 엔터키 검색 이벤트
    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) {
            gridApi.setGridOption('datasource', datasource);
        }
    });

    // 로고 클릭 시 새로고침 효과
    $('.logo').on('click', () => {
        $('#search-input').val('');
        gridApi.setGridOption('datasource', datasource);
    });
});
