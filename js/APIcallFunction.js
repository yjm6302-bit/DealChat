export function APIcall(prompts, Furl, Fheaders, Fmethod = 'POST') {
    let body;
    if (prompts instanceof FormData) {
        body = prompts;
    } else {
        // 람다 함수에서 json.loads(event['body'])로 바로 읽을 수 있도록 수정
        body = JSON.stringify(prompts);
    }

    // 6MB 제한 체크
    if (body.length > 6 * 1024 * 1024) {
        console.error('Payload size exceeds 6MB limit');
        return Promise.reject(new Error('파일 용량이 너무 큽니다 (6MB 제한)'));
    }

    console.log('APIcall Request URL:', Furl);

    return fetch(Furl, {
        method: Fmethod,
        headers: Fheaders || {},
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