export function APIcall(prompts, Furl, Fheaders, Fmethod = 'POST') {
    let body;
    if (prompts instanceof FormData) {
        body = prompts;
    } else {
        body = JSON.stringify(prompts);
    }

    // AI 호출인지 일반 CRUD 호출인지에 따라 엔드포인트를 결정합니다.
    // AI 호출인지 일반 CRUD 호출인지에 따라 엔드포인트를 결정합니다.
    let endpoint = Furl;

    // [라우팅 로직 개선]
    // 1. Vector Search 요청은 무조건 ai-handler로 전송
    if (prompts && prompts.action === 'search_vector') {
        endpoint = window.config.supabase.aiHandlerUrl;
    }
    // 2. AI 질문(body 포함) 요청도 ai-handler로 전송
    else if (prompts && prompts.body) {
        endpoint = window.config.supabase.aiHandlerUrl;
    }
    // 3. URL이 없거나 레거시 URL인 경우 기본 upload-handler 사용
    else if (!Furl || Furl.includes('lambda-url')) {
        endpoint = window.config.supabase.uploadHandlerUrl;
    }

    const headers = {
        ...Fheaders,
        'apikey': window.config.supabase.anonKey,
        'Authorization': `Bearer ${window.config.supabase.anonKey}`
    };

    // Remove Content-Type if body is FormData (browser will set it with boundary)
    if (body instanceof FormData && headers['Content-Type']) {
        delete headers['Content-Type'];
    }

    return fetch(endpoint, {
        method: Fmethod,
        headers: headers,
        body: body,
        mode: 'cors'
    }).then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`HTTP ${response.status}: ${text}`);
            });
        }
        return response;
    });
}