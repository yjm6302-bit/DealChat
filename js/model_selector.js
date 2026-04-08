/**
 * model_selector.js — AI 모델 선택기 공통 모듈
 *
 * dealbook_companies / dealbook_sellers / dealbook_buyers 에서 동일하게
 * 사용하던 모델 선택기 코드를 하나로 통합합니다.
 *
 * 사용법:
 *   import { initModelSelector } from './model_selector.js';
 *   const { markModelAsExceeded } = initModelSelector(addAiResponse);
 */

export const AVAILABLE_MODELS = [
    { id: 'gemini-2.0-flash',     name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro',       name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash',     name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b',  name: 'Gemini 1.5 Flash-8B' },
];

/**
 * 모델 선택기를 초기화하고 이벤트를 바인딩합니다.
 *
 * @param {Function} addAiResponseFn - AI_Functions.js의 addAiResponse
 * @returns {{ markModelAsExceeded: Function, getCurrentModelId: Function }}
 */
export function initModelSelector(addAiResponseFn) {
    const modelStatusMap = JSON.parse(localStorage.getItem('dealchat_model_status')) || {};
    AVAILABLE_MODELS.forEach(m => {
        if (!modelStatusMap[m.id]) modelStatusMap[m.id] = 'available';
    });

    let currentModelId = localStorage.getItem('dealchat_selected_model') || (window.config?.ai?.model);

    // [Fix] 선택된 모델이 현재 사용 가능한 리스트에 없으면 기본 모델로 초기화
    if (!AVAILABLE_MODELS.find(m => m.id === currentModelId)) {
        currentModelId = AVAILABLE_MODELS[0].id;
        localStorage.setItem('dealchat_selected_model', currentModelId);
    }

    if (window.config?.ai) {
        window.config.ai.model = currentModelId;
    }

    function renderModelDropdown() {
        const $dropdown = $('#model-dropdown');
        if (!$dropdown.length) return;
        $dropdown.empty();

        const $header = $(`
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 12px 8px; border-bottom: 1px solid #f1f5f9; margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 700; color: #94a3b8;">모델 리스트</span>
                <button id="btn-refresh-status" title="상태 새로고침" style="background: none; border: none; cursor: pointer; color: #6366f1; display: flex; align-items: center;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
                </button>
            </div>
        `);
        $dropdown.append($header);

        AVAILABLE_MODELS.forEach(model => {
            const status = modelStatusMap[model.id];
            const isActive = model.id === currentModelId;
            const statusClass = status === 'available' ? 'status-available' : 'status-exceeded';
            const statusText = status === 'available' ? '사용 가능' : '한도 초과';
            const statusTextClass = status === 'available' ? 'status-text-available' : 'status-text-exceeded';

            const $option = $(`
                <div class="model-option ${isActive ? 'active' : ''}" data-id="${model.id}">
                    <div class="model-info">
                        <span class="status-badge ${statusClass}"></span>
                        <span>${model.name}</span>
                    </div>
                    <span class="model-status-text ${statusTextClass}">${statusText}</span>
                </div>
            `);

            $option.on('click', function () {
                selectModel(model.id);
            });

            $dropdown.append($option);
        });

        const currentModel = AVAILABLE_MODELS.find(m => m.id === currentModelId) || AVAILABLE_MODELS[AVAILABLE_MODELS.length - 1];
        $('#current-model-name').text(currentModel.name);

        $('#btn-refresh-status').off('click').on('click', function (e) {
            e.stopPropagation();
            checkAllModelsStatus();
        });
    }

    async function checkAllModelsStatus() {
        if (!window.config?.supabase?.aiHandlerUrl) {
            console.warn('⚠️ AI Handler URL이 설정되지 않아 모델 상태 체크를 건너뜁니다.');
            return;
        }

        console.log('🔄 AI 모델 로드 상태 체크 중...');
        const $refreshBtn = $('#btn-refresh-status');
        if ($refreshBtn.length) $refreshBtn.find('span').addClass('spin-animation');

        const checkPromises = AVAILABLE_MODELS.map(async (model) => {
            try {
                const response = await addAiResponseFn('status_check', "This is a health check. Reply 'ok'.", model.id);
                if (response.ok) {
                    modelStatusMap[model.id] = 'available';
                } else if (response.status === 429) {
                    modelStatusMap[model.id] = 'exceeded';
                } else {
                    modelStatusMap[model.id] = 'error';
                }
            } catch (err) {
                console.error(`Error checking model ${model.id}:`, err);
                const errMsg = err.message || '';
                if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                    modelStatusMap[model.id] = 'exceeded';
                } else {
                    modelStatusMap[model.id] = 'error';
                }
            }
        });

        await Promise.allSettled(checkPromises);
        localStorage.setItem('dealchat_model_status', JSON.stringify(modelStatusMap));
        renderModelDropdown();
        if ($refreshBtn.length) $refreshBtn.find('span').removeClass('spin-animation');
        console.log('✅ AI 모델 상태 업데이트 완료');
    }

    function selectModel(modelId) {
        currentModelId = modelId;
        localStorage.setItem('dealchat_selected_model', modelId);
        if (window.config?.ai) window.config.ai.model = modelId;
        renderModelDropdown();
        $('#model-dropdown').removeClass('show');
        console.log(`🤖 AI 모델 변경됨: ${modelId}`);
    }

    function markModelAsExceeded(modelId) {
        modelStatusMap[modelId] = 'exceeded';
        localStorage.setItem('dealchat_model_status', JSON.stringify(modelStatusMap));
        renderModelDropdown();
    }

    function getCurrentModelId() {
        return currentModelId;
    }

    // 이벤트 바인딩
    $('#btn-model-selector').on('click', function (e) {
        e.stopPropagation();
        $('#model-dropdown').toggleClass('show');
    });

    $(document).on('click', function () {
        $('#model-dropdown').removeClass('show');
    });

    // 초기 렌더링
    renderModelDropdown();

    return { markModelAsExceeded, getCurrentModelId };
}
