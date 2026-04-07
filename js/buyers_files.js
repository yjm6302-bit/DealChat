import { checkAuth, updateHeaderProfile, initUserMenu } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { addAiResponse } from './AI_Functions.js';
import { fileDelete } from './File_Functions.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let buyerMap = {};
let currentFile = null;
let gridApi;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;
    updateHeaderProfile(userData);
    initUserMenu();

    const gridDiv = document.querySelector('#fileGrid');

    function loadFileData() {
        const keyword = ($('#search-input').val() || "").trim();

        APIcall({
            action: 'get',
            table: 'files',
            user_id: user_id,
            keyword: keyword
        }, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('API Error:', data.error);
                    return;
                }
                let rows = Array.isArray(data) ? data : (data.Items || []);
                rows = rows.filter(row => {
                    const bId = row.companyId || row.company_id;
                    return buyerMap[bId];
                });
                if (gridApi) {
                    gridApi.setGridOption('rowData', rows);
                }
            })
            .catch(error => {
                console.error('Fetch Error:', error);
            });
    }

    const columnDefs = [
        {
            headerName: "",
            width: 50,
            checkboxSelection: true,
            headerCheckboxSelection: true,
            suppressMenu: true,
            pinned: 'left'
        },
        { field: "id", headerName: "ID", sortable: true, filter: false, width: 100, hide: true },
        { field: "file_name", headerName: "파일명", sortable: true, filter: false, flex: 1.5 },
        {
            field: "companyId",
            headerName: "매수자명",
            sortable: true,
            filter: false,
            flex: 1,
            valueGetter: params => {
                if (!params.data) return "-";
                const bId = params.data.companyId || params.data.company_id;
                if (!bId) return "-";
                return buyerMap[bId] || "-";
            }
        },
        { field: "summary", headerName: "요약", sortable: true, flex: 2 },
        {
            field: "updated_at",
            headerName: "수정일",
            sortable: true,
            flex: 0.8,
            valueFormatter: params => { if (!params.value) return ""; const d = new Date(params.value); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }
        },
        {
            headerName: "다운로드",
            width: 120,
            cellRenderer: params => {
                if (!params.data || !params.data.location) return null;
                const a = document.createElement('a');
                a.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; color: #0d9488;">download</span>';
                const supabaseUrl = window.config.supabase.url;
                a.href = `${supabaseUrl}/storage/v1/object/public/uploads/${params.data.location}`;
                a.target = '_blank';
                a.style.display = 'flex';
                a.style.alignItems = 'center';
                a.style.justifyContent = 'flex-start';
                a.style.height = '100%';
                a.style.textDecoration = 'none';
                a.onclick = (e) => e.stopPropagation();
                return a;
            }
        },
        {
            headerName: "삭제",
            width: 100,
            cellRenderer: params => {
                const btn = document.createElement('button');
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">delete</span>';
                btn.style.border = 'none';
                btn.style.background = 'transparent';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.height = '100%';
                btn.onmouseover = () => { btn.querySelector('span').style.color = '#ef4444'; };
                btn.onmouseout = () => { btn.querySelector('span').style.color = '#64748b'; };
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`정말로 "${params.data.file_name}" 파일을 삭제하시겠습니까?`)) {
                        executeDelete(params.data.id, params.data.file_name);
                    }
                };
                return btn;
            }
        }
    ];

    const gridOptions = {
        columnDefs: columnDefs,
        theme: 'legacy',
        defaultColDef: {
            resizable: false,
            sortable: true,
            filter: false
        },
        pagination: true,
        paginationPageSize: 20,
        rowSelection: 'multiple',
        onRowClicked: (params) => {
            if (params.data) {
                openFileDetail(params.data);
            }
        }
    };

    fetchBuyers(user_id).then(data => {
        const buyers = Array.isArray(data) ? data : (data.Items || []);
        if (Array.isArray(buyers)) {
            buyers.forEach(b => {
                buyerMap[b.id] = b.company_name || b.companyName;
            });
        }
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
        loadFileData();
    });

    $('#search-btn').on('click', () => {
        loadFileData();
    });

    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) {
            loadFileData();
        }
    });

    function openFileDetail(file) {
        currentFile = file;
        $('#modal-id').val(file.id || '');
        $('#modal-file-name-input').val(file.file_name || '');
        $('#modal-summary').val(file.summary || '');
        $('#modal-tags').val(file.tags || '');
        $('#modal-comments').val(file.comments || '');
        $('#modal-createdAt').val(file.created_at ? (d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`)(new Date(file.created_at)) : '');
        $('#modal-updatedAt').val(file.updated_at ? (d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`)(new Date(file.updated_at)) : '');

        const supabaseUrl = window.config.supabase.url;
        const fileUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${file.location}`;
        $('#modal-location-icon').attr('href', fileUrl);
        $('#modal-location-btn').attr('href', fileUrl);

        const modalEl = document.getElementById('file-modal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }

    $('#AI-generate-summary').on('click', async function () {
        const sourceText = currentFile?.parsedText || currentFile?.summary || $('#modal-summary').val();
        if (!sourceText || sourceText.length < 10) {
            alert('요약할 내용이 없습니다.');
            return;
        }
        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');
        try {
            const prompt = `다음 문서의 핵심 내용을 1000자 이내의 한글로 요약해주세요. 마크다운 형식으로 작성하되, 제목이나 추가 설명 없이 요약 내용만 작성해주세요.\n\n문서 내용:\n${sourceText}`;
            const response = await addAiResponse(prompt, "");
            const data = await response.json();
            if (data.answer) {
                $('#modal-summary').val(data.answer.trim());
            }
        } catch (error) {
            console.error('AI Summary Error:', error);
            const errMsg = error.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                alert('⚠️ AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (무료 플랜 기준 분당/일일 한도 초과)');
            } else {
                alert('요약 생성 중 오류가 발생했습니다.');
            }
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    $('#AI-generate-tags').on('click', async function () {
        const sourceText = currentFile?.parsedText || $('#modal-summary').val();
        if (!sourceText || sourceText.length < 10) {
            alert('태그 추출을 위한 내용이 없습니다.');
            return;
        }
        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');
        try {
            const prompt = "Identify the top 5 core keywords most related to the provided document in Korean. Your response must contain only the keywords separated by commas, with no additional text.";
            const response = await addAiResponse(prompt, sourceText);
            const data = await response.json();
            if (data.answer) {
                const cleanTags = data.answer.replace(/태그:\s*/i, '').trim();
                $('#modal-tags').val(cleanTags);
            }
        } catch (error) {
            console.error('AI Tags Error:', error);
            const errMsg = error.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
                alert('⚠️ AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (무료 플랜 기준 분당/일일 한도 초과)');
            } else {
                alert('태그 생성 중 오류가 발생했습니다.');
            }
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    $('#save-file-btn').on('click', function () {
        if (!currentFile) return;
        const payload = {
            ...currentFile,
            id: $('#modal-id').val(),
            file_name: $('#modal-file-name-input').val(),
            comments: $('#modal-comments').val(),
            summary: $('#modal-summary').val(),
            tags: $('#modal-tags').val(),
            table: 'files',
            action: 'update',
            user_id: user_id
        };
        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('저장 중...');
        APIcall(payload, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            .then(response => response.json())
            .then(result => {
                if (result.error) alert('저장 중 오류: ' + result.error);
                else {
                    alert('저장되었습니다.');
                    bootstrap.Modal.getInstance(document.getElementById('file-modal')).hide();
                    loadFileData();
                }
            })
            .catch(error => alert('저장 요청 실패'))
            .finally(() => $btn.prop('disabled', false).text(originalText));
    });

    $('#delete-file-btn').on('click', function () {
        if (!currentFile) return;
        if (confirm(`정말로 "${currentFile.file_name}" 파일을 삭제하시겠습니까?`)) {
            executeDelete(currentFile.id, currentFile.file_name);
        }
    });

    async function executeDelete(id, fileName) {
        try {
            const response = await fileDelete(id, fileName, user_id);
            const result = await response.json();
            if (result.error) alert('삭제 실패: ' + result.error);
            else {
                alert('삭제되었습니다.');
                const modal = bootstrap.Modal.getInstance(document.getElementById('file-modal'));
                if (modal) modal.hide();
                loadFileData();
            }
        } catch (error) {
            alert('삭제 요청 실패');
        }
    }

    function fetchBuyers(user_id) {
        return APIcall({ action: 'get', table: 'buyers', user_id: user_id }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            .then(res => res.json());
    }

    $('#batch-download-btn').on('click', async function () {
        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length === 0) {
            alert('다운로드할 파일을 선택해주세요.');
            return;
        }
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 22px;">sync</span>');
        try {
            const zip = new JSZip();
            const supabaseUrl = window.config.supabase.url;
            const downloadPromises = selectedRows.map(async (file) => {
                const fileUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${file.location}`;
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error(`Failed to download ${file.file_name}`);
                const blob = await response.blob();
                zip.file(file.file_name, blob);
            });
            await Promise.all(downloadPromises);
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `buyers_files_${new Date().getTime()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Batch Download Error:', error);
            alert('파일 다운로드 중 오류가 발생했습니다.');
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    $('#batch-delete-btn').on('click', async function () {
        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length === 0) {
            alert('삭제할 파일을 선택해주세요.');
            return;
        }
        if (!confirm(`선택한 ${selectedRows.length}개의 파일을 정말로 삭제하시겠습니까?`)) {
            return;
        }
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 22px;">sync</span>');
        try {
            let successCount = 0;
            let failCount = 0;
            for (const file of selectedRows) {
                try {
                    const response = await fileDelete(file.id, file.file_name, user_id);
                    const result = await response.json();
                    if (result.error) failCount++;
                    else successCount++;
                } catch (err) {
                    failCount++;
                }
            }
            if (failCount > 0) {
                alert(`${successCount}개 삭제 성공, ${failCount}개 삭제 실패하였습니다.`);
            } else {
                alert(`선택한 ${successCount}개의 파일이 모두 삭제되었습니다.`);
            }
            loadFileData();
        } catch (error) {
            console.error('Batch Delete Error:', error);
            alert('파일 삭제 중 오류가 발생했습니다.');
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });
});
