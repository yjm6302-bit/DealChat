import { checkAuth } from './auth_utils.js';
import { APIcall } from './APIcallFunction.js';
import { addAiResponse, getRAGdata } from './AI_Functions.js';
import {
    filetypecheck,
    fileUpload,
    fileDelete
} from './File_Functions.js';

const SUPABASE_ENDPOINT = window.config.supabase.uploadHandlerUrl;
const S3_BASE_URL = 'https://dealchat.co.kr.s3.ap-northeast-2.amazonaws.com/';

const columnDefs = [
    { field: "id", headerName: "ID", sortable: true, filter: true, width: 100, hide: true },
    { field: "file_name", headerName: "파일명", sortable: true, filter: true, flex: 1.5 },
    { field: "tags", headerName: "태그", sortable: true, filter: true, flex: 1 },
    { field: "summary", headerName: "요약", sortable: true, flex: 2 },
    {
        field: "updated_at",
        headerName: "수정일",
        sortable: true,
        flex: 0.8,
        valueFormatter: params => params.value ? new Date(params.value).toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : ""
    }
];

let currentFile = null;

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
        currentFile = params.data;
        if (currentFile) {
            $('#modal-id').val(currentFile.id || '');
            $('#modal-file-name-input').val(currentFile.file_name || '');
            $('#modal-comments').val(currentFile.comments || '');
            $('#modal-summary').val(currentFile.summary || '');
            $('#modal-tags').val(currentFile.tags || '');

            // Preserve parsedText for AI processing (not displayed in modal)
            // currentFile.parsedText is already available from params.data

            // Format timestamps for display
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
            $('#modal-createdAt').val(formatDate(currentFile.created_at));
            $('#modal-updatedAt').val(formatDate(currentFile.updated_at));

            // Generate Supabase Storage download URL
            if (currentFile.location) {
                const supabaseUrl = window.config.supabase.url;
                const downloadUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${currentFile.location}`;
                $('#modal-location-icon').attr('href', downloadUrl);
                $('#modal-location-btn').attr('href', downloadUrl);
            } else {
                $('#modal-location-icon').attr('href', '#');
                $('#modal-location-btn').attr('href', '#');
            }

            const modalEl = document.getElementById('file-modal');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    }
};

let gridApi;

$(document).ready(function () {
    const userData = checkAuth();
    if (!userData) return;
    const userId = userData.id;
    const gridDiv = document.querySelector('#fileGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const datasource = {
        getRows: (params) => {
            const keyword = ($('#search-input').val() || "").trim();

            APIcall({
                action: 'get',
                table: 'files',
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

                    // API 응답 형식 대응
                    const rows = Array.isArray(data) ? data : (data.Items || []);
                    params.successCallback(rows, rows.length || (data.Count || 0));
                })
                .catch(error => {
                    console.error('Fetch Error:', error);
                    params.failCallback();
                });
        }
    };

    // 초기 데이터 로드
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

    // AI 요약 생성 이벤트
    $('#AI-generate-summary').on('click', async function () {
        console.log('AI Summary: Button clicked');
        console.log('AI Summary: currentFile:', currentFile);

        const sourceText = currentFile?.parsedText || currentFile?.summary || $('#modal-summary').val();

        console.log('AI Summary: parsedText length:', currentFile?.parsedText?.length || 0);
        console.log('AI Summary: summary length:', currentFile?.summary?.length || 0);
        console.log('AI Summary: sourceText length:', sourceText?.length || 0);
        console.log('AI Summary: First 100 chars:', sourceText?.substring(0, 100));

        if (!sourceText || sourceText.length < 10) {
            alert('요약할 내용이 없습니다. 파일에서 텍스트를 추출할 수 없거나 이미지 기반 PDF일 수 있습니다.');
            return;
        }
        const $btn = $(this);
        const originalIcon = $btn.html();

        // 로딩 상태 표시
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            console.log('AI Summary: Sending request to AI...');
            const prompt = `다음 문서의 핵심 내용을 1000자 이내의 한글로 요약해주세요. 마크다운 형식으로 작성하되, 제목이나 추가 설명 없이 요약 내용만 작성해주세요.\n\n문서 내용:\n${sourceText}`;

            // 파일 내용만 프롬프트에 포함, RAG 데이터는 빈 문자열로
            const response = await addAiResponse(prompt, "");
            const data = await response.json();

            console.log('AI Summary: Response received:', data);

            if (data.answer) {
                $('#modal-summary').val(data.answer.trim());
                console.log('AI Summary: Summary updated successfully');
            } else {
                throw new Error('응답 데이터가 없습니다.');
            }
        } catch (error) {
            console.error('AI Summary Error:', error);
            alert('요약 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 태그 생성 이벤트 (상세 모달)
    $('#AI-generate-tags').on('click', async function () {
        const ragData = getRAGdata();
        const sourceText = currentFile?.parsedText || $('#modal-summary').val();
        if (!sourceText || sourceText.length < 10) {
            alert('태그를 추출할 내용이 없습니다.');
            return;
        }

        const totalText = ragData + sourceText;
        const $btn = $(this);
        const originalIcon = $btn.html();

        // 로딩 상태 표시
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서와 가장 연관된 핵심 키워드 5개를 뽑아서 쉼표(,)로 구분된 문자열로만 답변해줘. 예: 태그1, 태그2, 태그3";
            const response = await addAiResponse(prompt, totalText);
            const data = await response.json();

            if (data.answer) {
                const cleanTags = data.answer.replace(/태그:\s*/i, '').trim();
                $('#modal-tags').val(cleanTags);
            } else {
                throw new Error('응답 데이터가 없습니다.');
            }
        } catch (error) {
            console.error('AI Tags Error:', error);
            alert('태그 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 요약 생성 이벤트 (업로드 모달)
    $('#AI-upload-summary').on('click', async function () {
        const sourceText = $('#extract-file').val();
        if (!sourceText || sourceText.length < 10) {
            alert('요약할 파일 내용이 없습니다. 파일을 먼저 선택해주세요.');
            return;
        }

        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서를 바탕으로 핵심 내용을 1000자 이내의 한글 마크다운 형식으로 요약해줘. 다른 설명은 하지 마.";
            const response = await addAiResponse(prompt, sourceText);
            const data = await response.json();
            $('#upload-summary').val(data.answer.trim());
        } catch (error) {
            console.error('AI Upload Summary Error:', error);
            alert('요약 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // AI 태그 생성 이벤트 (업로드 모달)
    $('#AI-upload-tags').on('click', async function () {
        const sourceText = $('#extract-file').val();
        if (!sourceText || sourceText.length < 10) {
            alert('태그를 추출할 파일 내용이 없습니다. 파일을 먼저 선택해주세요.');
            return;
        }

        const $btn = $(this);
        const originalIcon = $btn.html();
        $btn.prop('disabled', true).html('<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span>');

        try {
            const prompt = "위 문서와 가장 연관된 핵심 키워드 5개를 뽑아서 쉼표(,)로 구분된 문자열로만 답변해줘. 예: 태그1, 태그2, 태그3";
            const response = await addAiResponse(prompt, sourceText);
            const data = await response.json();
            const cleanTags = data.answer.replace(/태그:\s*/i, '').trim();
            $('#upload-tags').val(cleanTags);
        } catch (error) {
            console.error('AI Upload Tags Error:', error);
            alert('태그 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html(originalIcon);
        }
    });

    // 저장 버튼 이벤트
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
            userId: userId
        };

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('저장 중...');

        APIcall(payload, SUPABASE_ENDPOINT, {
            'Content-Type': 'application/json'
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    alert('저장 중 오류가 발생했습니다: ' + result.error);
                } else {
                    alert('저장되었습니다.');
                    const modalEl = document.getElementById('file-modal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                    // 그리드 새로고침
                    gridApi.setGridOption('datasource', datasource);
                }
            })
            .catch(error => {
                console.error('Save Error:', error);
                alert('저장 요청에 실패했습니다.');
            })
            .finally(() => {
                $btn.prop('disabled', false).text(originalText);
            });
    });

    $('#upload-btn').on('click', function () {
        $('#upload-file-input').click();
    });

    // 파일 선택 시 이름 자동 입력 및 업로드 실행
    $('#upload-file-input').on('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        // 1. 파일 유효성 검사
        if (!filetypecheck(file)) {
            $(this).val('');
            return;
        }

        $('#upload-file-name').val(file.name);

        try {
            // 2. 통합 업로드 호출 (텍스트 추출 및 S3/DB 저장이 내부에서 자동으로 일어남)
            const fetchResponse = await fileUpload(file, userId, '');
            const result = await fetchResponse.json();

            // Proxy 응답 대응
            let finalData = result;
            if (result.body && typeof result.body === 'string') {
                finalData = JSON.parse(result.body);
            }

            if (fetchResponse.ok || finalData.statusCode == 200) {
                alert('업로드 및 정보 저장이 완료되었습니다.');
                gridApi.setGridOption('datasource', datasource); // 그리드 새로고침
                $(this).val('');
                $('#upload-file-name').val('');
            } else {
                throw new Error(finalData.message || '서버 응답 오류');
            }
        } catch (err) {
            console.error('Upload Process Error:', err);
            alert("처리에 실패했습니다: " + err.message);
        }
    });

    // 삭제 버튼 이벤트
    $('#delete-file-btn').on('click', async function () {
        if (!currentFile) return;

        const fileName = currentFile.file_name || '이 파일';
        if (!confirm(`정말로 "${fileName}"을(를) 삭제하시겠습니까?`)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('삭제 중...');

        try {
            const response = await fileDelete(currentFile.id, currentFile.file_name, userId);
            const result = await response.json();

            if (result.error) {
                alert('삭제 중 오류가 발생했습니다: ' + result.error);
            } else {
                alert('삭제되었습니다.');
                const modalEl = document.getElementById('file-modal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                // 그리드 새로고침
                gridApi.setGridOption('datasource', datasource);
            }
        } catch (error) {
            console.error('Delete Error:', error);
            alert('삭제 요청에 실패했습니다: ' + error.message);
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    });

});
