export function APIcall(prompts, Furl, Fheaders, Fmethod = 'POST') {
    // Truncate logging to prevent console lag with large payloads
    const logData = typeof prompts === 'string' ?
        (prompts.length > 500 ? prompts.substring(0, 500) + '...' : prompts) :
        prompts;

    console.log('APIcall Request URL:', Furl);
    console.log('APIcall Request Data:', logData);

    let body;
    if (prompts instanceof FormData) {
        body = prompts;
    } else {
        body = JSON.stringify({ body: prompts });
    }

    // Safety check for Lambda URL payload limit (6MB)
    if (body.length > 6 * 1024 * 1024) {
        console.error('Payload size exceeds 6MB limit:', body.length);
        return Promise.reject(new Error('Payload too large (exceeds 6MB)'));
    }

    return fetch(Furl, {
        method: Fmethod,
        headers: Fheaders || {},
        body: body,
        mode: 'cors',
        credentials: 'omit'
    }).then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
            });
        }
        return response;
    });
}
