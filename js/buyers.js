import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let gridApi;

// 전역에서 접근 가능하도록 함수 선언 (gridOptions에서 참조)
let openBuyerModal;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
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
                userId: userId,
                keyword: keyword
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

    // --- Tag Handling Logic ---
    let selectedUsers = [];

    const updateHiddenInput = () => {
        $('input[name="selective_users"]').val(selectedUsers.join(','));
    };

    const renderTags = () => {
        const $wrapper = $('#tag-wrapper');
        const $input = $('#selective-users-input');

        // Remove existing tags only (keep the input)
        $wrapper.find('.tag-item').remove();

        selectedUsers.forEach(user => {
            const tagHtml = `
                <div class="tag-item" data-user="${user}">
                    <span>${user}</span>
                    <span class="tag-remove material-symbols-outlined">close</span>
                </div>
            `;
            $input.before(tagHtml);
        });

        updateHiddenInput();
    };

    // Tag Input Event Listener
    $('#selective-users-input').on('keydown', function (e) {
        // IME composition check for Korean input
        if (e.originalEvent.isComposing) {
            return;
        }

        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = $(this).val().trim().replace(/,/g, '');

            if (val && !selectedUsers.includes(val)) {
                selectedUsers.push(val);
                renderTags();
            }
            $(this).val('');
        }
        // Backspace to remove last tag if input is empty
        if (e.key === 'Backspace' && $(this).val() === '' && selectedUsers.length > 0) {
            selectedUsers.pop();
            renderTags();
        }
    });

    // Tag Remove Event Listener (Delegate)
    $('#tag-wrapper').on('click', '.tag-remove', function () {
        const userToRemove = $(this).closest('.tag-item').data('user');
        selectedUsers = selectedUsers.filter(user => user !== userToRemove);
        renderTags();
    });

    openBuyerModal = function (data = null) {
        $form[0].reset();
        selectedUsers = []; // Reset tags
        $('#tag-wrapper .tag-item').remove(); // Clear UI

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

            // Visibility scope
            const visibilityScope = data.visibility_scope || 'private';
            $('select[name="visibility_scope"]').val(visibilityScope);

            // Load tags from comma-separated string
            const usersStr = data.selective_users || '';
            if (usersStr) {
                selectedUsers = usersStr.split(',').map(s => s.trim()).filter(s => s);
                renderTags();
            }

            // Show/hide selective users input based on current value
            if (visibilityScope === 'selective') {
                $('#selective-users-row').show();
            } else {
                $('#selective-users-row').hide();
            }

            // Format and display timestamps
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                return date.toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            };
            $('input[name="created_at"]').val(formatDate(data.created_at));
            $('input[name="updated_at"]').val(formatDate(data.updated_at));
        } else {
            // 신규 등록 모드
            currentAction = 'create';
            $modalTitle.text('바이어 등록');
            $saveBtn.text('등록');
            $deleteBtn.hide();

            const randomId = crypto.randomUUID();
            $('input[name="id"]').val(randomId);

            // Set default visibility to private
            $('select[name="visibility_scope"]').val('private');
            $('#selective-users-row').hide();

            // Clear timestamp fields for new entries
            $('input[name="created_at"]').val('');
            $('input[name="updated_at"]').val('');
        }

        $modal.css('display', 'flex');
    }

    $('#new-btn').on('click', () => {
        openBuyerModal();
    });

    $('#close-modal, #cancel-btn').on('click', () => {
        $modal.hide();
    });

    // Visibility scope change handler
    $('#visibility-scope').on('change', function () {
        const selectedValue = $(this).val();
        if (selectedValue === 'selective') {
            $('#selective-users-row').show();
        } else {
            $('#selective-users-row').hide();
        }
    });

    $('#save-buyer-btn').on('click', function () {
        const now = new Date().toISOString();

        const formData = {
            id: $('input[name="id"]').val(),
            companyName: $('input[name="companyName"]').val().trim(),
            summary: $('textarea[name="summary"]').val().trim(),
            interest_summary: $('textarea[name="interest_summary"]').val().trim(),
            interest_industry: $('input[name="interest_industry"]').val().trim(),
            investment_amount: $('input[name="investment_amount"]').val().trim(),
            etc: $('input[name="etc"]').val().trim(),
            visibility_scope: $('select[name="visibility_scope"]').val(),
            selective_users: $('input[name="selective_users"]').val().trim(),
            userId: userId,
            table: 'buyers',
            action: currentAction === 'create' ? 'upload' : 'update'
        };

        // 생성 시: created_at, updated_at 모두 설정
        // 수정 시: updated_at만 설정 (Edge Function에서 자동 처리되지만 명시적으로 전달)
        if (currentAction === 'create') {
            formData.created_at = now;
            formData.updated_at = now;
        } else {
            formData.updated_at = now;
        }

        if (!formData.companyName) {
            alert('회사명을 입력해주세요.');
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('등록 중...');

        APIcall(formData, SUPABASE_ENDPOINT, {
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
        }, SUPABASE_ENDPOINT, {
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
