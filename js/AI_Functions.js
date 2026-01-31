import { APIcall } from './APIcallFunction.js';
import { countTokens } from './File_Functions.js';

const UPLOAD_HANDLER = window.config.supabase.uploadHandlerUrl;
const AI_HANDLER = window.config.supabase.aiHandlerUrl;

export function addAiResponse(userInput, sourceTexts) {
    const AI_ENDPOINT = AI_HANDLER;

    // 토큰 제한 설정 (Lambda 타임아웃 및 페이로드 제한을 고려하여 30k 정도로 제한)
    const MAX_TOKEN = 120000;
    const SAFETY_MARGIN = 5000; // 프롬프트 템플릿과 사용자 입력을 위한 여유 공간

    let truncatedSource = sourceTexts || "";

    // 1. 소스 텍스트가 너무 길면 우선적으로 자름
    if (countTokens(truncatedSource) > (MAX_TOKEN - SAFETY_MARGIN)) {
        console.warn(`Source text too long, truncating to stay under ${MAX_TOKEN} tokens...`);
        // 한글 기준 1자당 약 1.1토큰 가정
        const charLimit = Math.floor((MAX_TOKEN - SAFETY_MARGIN) / 1.1);
        truncatedSource = truncatedSource.substring(0, charLimit) + "\n\n... (내용이 너무 길어 일부 생략되었습니다) ...";
    }

    // 2. 프롬프트 개선: 역할 부여, 문맥 구분, 출력 가이드라인 추가
    let prompts = `
        [Role]
        You are a professional investment analyst and corporate analysis expert. 
        Your goal is to assist the user by answering questions based on the provided [Context Documents].
        However, you should also be helpful and polite in general conversation.

        [Context Documents]
        ${truncatedSource}

        [User Question]
        ${userInput}

        [Instructions]
        1. **Context Priority**: First, check if the [Context Documents] contain the answer. If they do, use them as your primary source.
        2. **General Conversation**: If the user's input is a greeting (e.g., "Hi", "Hello"), a compliment, or a general question unrelated to the documents, answer naturally and politely in Korean. Do not say "I cannot find info in documents" for greetings.
        3. **Missing Info**: If the question asks for specific details about the company/deal that represent facts NOT present in the [Context Documents], clearly state: "제공된 문서에서 해당 내용을 찾을 수 없습니다." (do not HALLUCINATE facts).
        4. **Style**: Answer in Korean. Maintain a professional, objective, and trustworthy tone suitable for investment banking.
        5. **Formatting**: Use Markdown (bullet points, bold text) for readability.
    `.trim();

    // 3. 최종 토큰 수 확인
    const tokenCount = countTokens(prompts);
    console.log('Total token count:', tokenCount);

    if (tokenCount > MAX_TOKEN) {
        alert(`토큰 수가 너무 많습니다. (${tokenCount} / ${MAX_TOKEN})\n문서 내용이나 질문을 줄여주세요.`);
        return Promise.reject(new Error('Token limit exceeded'));
    }

    // API 호출 (Promise를 반환하므로 호출부에서 처리가 필요할 수 있습니다)
    return APIcall({ body: prompts }, AI_ENDPOINT, { 'Content-Type': 'application/json' });
}

export async function searchVectorDB(query, companyId) {
    if (!query || !companyId) return "";

    const payload = {
        action: 'search_vector',
        query: query,
        vectorNamespace: companyId,
        topK: 5 // 상위 5개 문서 추출
    };

    try {
        const response = await APIcall(payload, AI_HANDLER, { 'Content-Type': 'application/json' });
        const data = await response.json();

        // Lambda 응답 구조에 따라 처리 (문자열 배열 가정)
        // data.results가 배열이라고 가정하고 연결
        if (data.results && Array.isArray(data.results)) {
            return data.results.join("\n\n");
        } else if (typeof data.results === 'string') {
            return data.results;
        } else if (data.body) {
            // Lambda Proxy Integration의 경우 body 파싱
            try {
                const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
                if (Array.isArray(body.results)) return body.results.join("\n\n");
                if (typeof body.results === 'string') return body.results;
                return "";
            } catch (e) {
                return "";
            }
        }

        return "";
    } catch (error) {
        console.error("Vector Search Failed:", error);
        return ""; // 검색 실패 시 빈 컨텍스트 반환 (일반 LLM 응답으로 fallback)
    }
}

export function getRAGdata() {
    return 'No special data';
}
