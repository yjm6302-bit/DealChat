import { APIcall } from './APIcallFunction.js';

// window.config 안전 참조를 위한 헬퍼
const getConfig = () => window.config || {
    supabase: { uploadHandlerUrl: '', aiHandlerUrl: '' },
    ai: {
        model: 'gemini-2.5-flash',
        tokenLimits: {
            'gemini-2.5-flash': { maxContextTokens: 1000000, maxOutputTokens: 8192, safetyMargin: 10000 }
        }
    }
};

// countTokens 함수 (Gemini의 넓은 컨텍스트를 고려한 글자 수 기반 근사치)
export function countTokens(text) {
    if (typeof text !== 'string') return 0;
    // 한글/영문 혼합 시 보통 1토큰 당 2~4글자 정도이나, 보수적으로 1:1 대응 수준으로 계산하거나 0.8배 수준으로도 충분함
    // Gemini 1.5 Flash는 1M 토큰을 지원하므로 아주 정밀한 계산보다는 대략적인 가이드라인만 제공
    return Math.ceil(text.length / 2); 
}

export function addAiResponse(userInput, sourceTexts, overrideModel = null) {
    const config = getConfig();
    const AI_ENDPOINT = config.supabase.aiHandlerUrl;
    const modelName = overrideModel || config.ai.model || 'gemini-2.5-flash';
    let modelConfig = config.ai.tokenLimits[modelName] || config.ai.tokenLimits['gemini-2.5-flash'];

    const MAX_TOKEN = modelConfig.maxContextTokens;
    const SAFETY_MARGIN = modelConfig.safetyMargin;

    let truncatedSource = sourceTexts || "";
    // Gemini는 100만 토큰까지 수용 가능하므로, 50만자(약 20~30만 토큰 이상) 이하일 경우 자를 필요가 없음
    if (countTokens(truncatedSource) > (MAX_TOKEN - SAFETY_MARGIN)) {
        const charLimit = (MAX_TOKEN - SAFETY_MARGIN) * 2;
        truncatedSource = truncatedSource.substring(0, charLimit) + "\n\n... (Content truncated due to extreme size) ...";
    }

    let prompts = `
        [Role]
        You are a professional investment analyst.
        [Context Documents]
        ${truncatedSource}
        [User Question]
        ${userInput}
        [Instructions]
        Answer in Korean. Professional tone. Keep the answer concise and to the point.
    `.trim();

    const payload = { 
        model: modelName, // 선택된 모델명을 백엔드로 전달
        body: prompts,
        max_tokens: modelConfig.maxOutputTokens, // 명시적으로 최대 출력 토큰 전달
        temperature: 0.1 // 일관성을 위해 낮은 다양성 유지
    };

    return APIcall(payload, AI_ENDPOINT, { 'Content-Type': 'application/json' });
}

export async function searchVectorDB(query, companyId) {
    if (!query || !companyId) return "";
    const AI_HANDLER = getConfig().supabase.aiHandlerUrl;
    const payload = { action: 'search_vector', query, vectorNamespace: companyId, topK: 5 };

    try {
        const response = await APIcall(payload, AI_HANDLER, { 'Content-Type': 'application/json' });
        const data = await response.json();
        if (data.results && Array.isArray(data.results)) return data.results.join("\n\n");
        return "";
    } catch (error) {
        console.error("Vector Search Failed:", error);
        return "";
    }
}
