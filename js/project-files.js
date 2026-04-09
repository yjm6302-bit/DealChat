import { checkAuth, updateHeaderProfile, initUserMenu } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { addAiResponse } from './AI_Functions.js';
import {
    filetypecheck,
    fileUpload,
    fileDelete
} from './File_Functions.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;

let companyMap = {};
let currentFile = null;
let gridApi;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const user_id = userData.id;
    updateHeaderProfile(userData);
    initUserMenu();

    const gridDiv = document.querySelector('#fileGrid');

    const datasource = {
        getRows: (params) => {

            params.successCallback([], 0);
        }
    };

    const columnDefs = [
        { field: "id", headerName: "ID", sortable: true, filter: false, width: 100, hide: true },
        { field: "file_name", headerName: "파일명", sortable: true, filter: false, flex: 1.5 },
        {
            field: "companyId",
            headerName: "프로젝트명",
            sortable: true,
            filter: false,
            flex: 1,
            valueGetter: params => {
                if (!params.data) return "-";
                const cId = params.data.companyId || params.data.company_id;
                if (!cId) return "-";
                return companyMap[cId] || cId;
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
                a.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; color: #0891B2;">download</span>';
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
        rowModelType: 'infinite',
        cacheBlockSize: 100,
        maxConcurrentDatasourceRequests: 1,
        infiniteInitialRowCount: 1,
        theme: 'legacy',
        defaultColDef: {
            resizable: false,
            sortable: true,
            filter: false
        },
        pagination: true,
        paginationPageSize: 20
    };

    fetchCompanies(user_id).then(data => {
        const companies = Array.isArray(data) ? data : (data.Items || []);
        if (Array.isArray(companies)) {
            companies.forEach(c => {
                companyMap[c.id] = c.company_name || c.companyName;
            });
        }
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
        gridApi.setGridOption('datasource', datasource);
    });

    $('#search-btn').on('click', () => {
        gridApi.setGridOption('datasource', datasource);
    });

    $('#search-input').on('keypress', (e) => {
        if (e.which === 13) {
            gridApi.setGridOption('datasource', datasource);
        }
    });

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
            } else {
                throw new Error('응답 데이터가 없습니다.');
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
            alert('태그를 추출할 내용이 없습니다.');
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
            } else {
                throw new Error('응답 데이터가 없습니다.');
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
            location: $('#modal-location').val(),
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
                if (result.error) {
                    alert('저장 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('저장되었습니다.');
                    const modalEl = document.getElementById('file-modal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                    gridApi.setGridOption('datasource', datasource);
                }
            })
            .catch(error => {
                console.error('Save Error:', error);
                alert('저장 요청이 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    $('#delete-file-btn').on('click', async function () {
        if (!currentFile) return;
        if (confirm(`정말로 "${currentFile.file_name}" 파일을 삭제하시겠습니까?`)) {
            executeDelete(currentFile.id, currentFile.file_name);
        }
    });

    async function executeDelete(id, fileName) {
        const $modalBtn = $('#delete-file-btn');
        $modalBtn.prop('disabled', true);
        try {
            const response = await fileDelete(id, fileName, user_id);
            const result = await response.json();
            if (result.error) {
                alert('삭제 중 오류가 발생했습니다: ' + result.error);
            } else {
                alert('삭제되었습니다.');
                const modalEl = document.getElementById('file-modal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                gridApi.setGridOption('datasource', datasource);
            }
        } catch (error) {
            console.error('Delete Error:', error);
            alert('삭제 요청이 실패했습니다.');
        } finally {
            $modalBtn.prop('disabled', false);
        }
    }

    function fetchCompanies(user_id) {
        return APIcall({ action: 'get', table: 'companies', user_id: user_id }, SUPABASE_ENDPOINT, { 'Content-Type': 'application/json' })
            .then(res => res.json());
    }
});
