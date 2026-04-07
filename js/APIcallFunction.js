export function APIcall(prompts, Furl, Fheaders, Fmethod = 'POST') {
    const supabaseUrl = window.config.supabase.url;
    const anonKey = window.config.supabase.anonKey;
    const aiHandlerUrl = window.config.supabase.aiHandlerUrl;
    const uploadHandlerUrl = window.config.supabase.uploadHandlerUrl;

    let body;
    let method = Fmethod;
    let endpoint = Furl;

    // 1. 헤더 기본 설정
    let authHeader = `Bearer ${anonKey}`;
    try {
        const projectId = supabaseUrl.split('://')[1].split('.')[0];
        const sessionKey = `sb-${projectId}-auth-token`;
        const sessionData = JSON.parse(localStorage.getItem(sessionKey));
        if (sessionData && sessionData.access_token) {
            authHeader = `Bearer ${sessionData.access_token}`;
        }
    } catch (e) {
        console.warn('Auth token retrieval failed:', e);
    }

    let headers = {
        'apikey': anonKey,
        'Authorization': authHeader,
        ...Fheaders
    };

    // 2. 업로드 요청인 경우 무조건 uploadHandlerUrl 사용
    if (prompts && prompts.action === 'upload') {
        endpoint = uploadHandlerUrl;
        method = 'POST';
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(prompts);
    } 
    
    if (!endpoint) endpoint = uploadHandlerUrl;

    // 3. AI/Vector Search 관련 요청 라우팅 (upload가 아닐 때만)
    if (prompts && prompts.action !== 'upload' && (prompts.action === 'search_vector' || prompts.body)) {
        endpoint = aiHandlerUrl;
        body = JSON.stringify(prompts);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } 
    // 2. 일반 CRUD 요청 (업로드는 이미 위에서 처리했으므로 제외)
    else if (prompts && prompts.table && prompts.action && prompts.action !== 'upload') {
        endpoint = `${supabaseUrl}/rest/v1/${prompts.table}`;
        
        // 데이터 정제: DB 컬럼이 아닌 제어용 필드(table, action) 제거
        const dataOnly = { ...prompts };
        delete dataOnly.table;
        delete dataOnly.action;

        switch (prompts.action) {
            case 'create':
                method = 'POST';
                headers['Prefer'] = 'return=representation';
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(dataOnly);
                break;
            case 'read':
            case 'get':
                method = 'GET';
                let queryParams = new URLSearchParams();
                queryParams.append('select', '*');
                
                Object.keys(dataOnly).forEach(key => {
                    const val = dataOnly[key];
                    if (val !== undefined && val !== "") {
                        if (val === "is.null") {
                            queryParams.append(key, "is.null");
                        } else {
                            queryParams.append(key, `eq.${val}`);
                        }
                    }
                });
                endpoint += `?${queryParams.toString()}`;
                body = undefined;
                break;
            case 'update':
                method = 'PATCH';
                if (prompts.id) {
                    endpoint += `?id=eq.${prompts.id}`;
                }
                headers['Prefer'] = 'return=representation';
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(dataOnly);
                break;
            case 'delete':
                method = 'DELETE';
                const deleteId = prompts.id || prompts.fileId;
                if (deleteId) {
                    endpoint += `?id=eq.${deleteId}`;
                }
                body = undefined;
                break;
        }
    } else {
        // 일반 body 처리
        if (prompts instanceof FormData) {
            body = prompts;
            if (headers['Content-Type']) delete headers['Content-Type'];
        } else {
            body = JSON.stringify(prompts);
            if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        }
    }

    return fetch(endpoint, {
        method: method,
        headers: headers,
        body: body,
        mode: 'cors'
    }).then(async response => {
        if (!response.ok) {
            const text = await response.text();
            let errMsg = text;
            try { 
                const errJson = JSON.parse(text);
                const errorVal = errJson.message || errJson.error || text;
                errMsg = (typeof errorVal === 'object') ? JSON.stringify(errorVal) : errorVal;
            } catch(e) {}
            throw new Error(`[DB Error] ${errMsg}`);
        }
        return response;
    });
}