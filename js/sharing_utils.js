/**
 * Sharing Utilities for DealChat
 * Handles external sharing logs, random key generation, and template formatting.
 */

// Generate a random 6-digit alphanumeric key (uppercase)
export function generateRandomKey(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid visually similar chars like 0, O, 1, I
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Save external share log to Supabase
 */
export async function saveExternalShareLog(supabase, shareData) {
    const { item_id, item_type, recipient_name, recipient_org, share_reason, share_key } = shareData;
    
    // [Bug Fix] Get actual session user to ensure RLS compliance
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Supabase session not found. Please log in again.');
    
    // Set expiry to +48 hours from now
    const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('external_share_logs')
        .insert([{
            item_id,
            item_type,
            sender_id: user.id, // Use actual session user ID
            recipient_name,
            recipient_org,
            share_reason,
            share_key,
            expires_at
        }])
        .select()
        .single();

    if (error) {
        console.error('saveExternalShareLog DB Error:', error);
        throw error;
    }
    return data;
}

export async function logExternalAccess(supabase, shareId) {
    try {
        // [Integration] Get current data to update count and history
        const { data: current, error: getError } = await supabase
            .from('external_share_logs')
            .select('access_count, access_history')
            .eq('id', shareId)
            .single();

        if (getError) throw getError;

        const newHistory = Array.isArray(current.access_history) ? current.access_history : [];
        newHistory.push({
            accessed_at: new Date().toISOString(),
            user_agent: navigator.userAgent
        });

        const { error: updateError } = await supabase
            .from('external_share_logs')
            .update({
                access_count: (current.access_count || 0) + 1,
                last_accessed_at: new Date().toISOString(),
                access_history: newHistory
            })
            .eq('id', shareId);

        if (updateError) throw updateError;

    } catch (e) {
        console.warn('Failed to log access (integrated):', e);
    }
}

/**
 * Copy sharing template to clipboard
 */
export async function copySharingTemplate(sharerInfo, shareUrl, shareKey) {
    const { affiliation, team, name } = sharerInfo;
    
    const template = `안녕하세요, ${affiliation || '-'} ${team || ''} ${name || '-'}입니다.

아래 링크를 통해 리포트를 확인하실 수 있습니다.
공유 URL: ${shareUrl}
접근 키: ${shareKey} (48시간 동안 유효)
`;

    try {
        await navigator.clipboard.writeText(template);
        return true;
    } catch (err) {
        console.error('Failed to copy template:', err);
        return false;
    }
}

/**
 * Validate external share key
 */
export async function validateShareKey(supabase, itemId, inputKey) {
    const { data, error } = await supabase
        .from('external_share_logs')
        .select('*')
        .eq('item_id', itemId)
        .eq('share_key', inputKey.toUpperCase())
        .gt('expires_at', new Date().toISOString())
        .lt('access_count', 3) // [New] 최대 3회 제한
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    return data;
}

export function initExternalSharing(itemType, themeColor = '#0d9488') {
    // [RBAC] 매수자 등급은 공유 기능 사용 불가
    try {
        const userData = JSON.parse(localStorage.getItem('dealchat_users'));
        if (userData && userData.role === 'buyer') {
            const $btn = $('#btn-external-share-trigger');
            if ($btn.length) $btn.hide();
            return;
        }
    } catch (e) {}

    // 1. Open External Share Modal
    $('#btn-external-share-trigger').off('click').on('click', function() {
        // [Bug Fix] Blur the button to avoid focus being trapped in a hidden modal (aria-hidden)
        $(this).blur();
        
        // Hide the choice modal
        $('#share-options-modal').modal('hide');
        
        setTimeout(() => {
            // Reset modal state
            $('#ext-share-recipient').val('').prop('disabled', false).css('background', '#ffffff');
            $('#ext-share-org').val('').prop('disabled', false).css('background', '#ffffff');
            $('#ext-share-reason').val('').prop('disabled', false).css('background', '#ffffff');
            
            $('#btn-generate-ext-share').show().prop('disabled', false).text('키 생성').css('background', themeColor);
            
            // Initial state: Grayed out result area
            $('#ext-share-key-area').css({'background': '#f8fafc', 'border': '1.5px solid #e2e8f0'});
            $('#ext-share-key-label').css('color', '#94a3b8');
            $('#ext-share-key-display').text('------').css('color', '#94a3b8');
            
            $('#ext-share-guidance-box').css({'background': '#f8fafc', 'border': '1.5px solid #e2e8f0', 'color': '#94a3b8'})
                .html('<div class="text-muted">키 생성 후 안내 문구가 이곳에 표시됩니다.</div>');
            
            $('#btn-copy-ext-share').prop('disabled', true).css('background', '#94a3b8');
            $('#ext-share-expiry').text('생성 후 48시간 동안 유효합니다');
            
            const extModalEl = document.getElementById('external-share-modal');
            const extModal = bootstrap.Modal.getOrCreateInstance(extModalEl);
            extModal.show();
            
            // Auto-focus the first input after modal show
            setTimeout(() => { $('#ext-share-recipient').focus(); }, 300);
        }, 350);
    });

    // 2. Generate Link Logic (Key 생성)
    $('#btn-generate-ext-share').off('click').on('click', async function() {
        const recipientName = $('#ext-share-recipient').val().trim();
        const recipientOrg = $('#ext-share-org').val().trim();
        const shareReason = $('#ext-share-reason').val().trim();

        if (!recipientName) {
            alert('수신자 성함을 입력해주세요.');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.prop('disabled', true).text('...');

        let userData = null;
        try {
        let id = null;
        if (itemType === 'buyer') id = window.currentShareBuyerId;
        else if (itemType === 'seller') id = window.currentShareSellerId;
        else if (itemType === 'company') id = window.currentShareCompanyId;

        if (!id) throw new Error('대상을 찾을 수 없습니다. (ID 미지정)');

            // Get logged in user data from local storage
            try {
                userData = JSON.parse(localStorage.getItem('dealchat_users'));
            } catch (e) {}

            if (!userData) throw new Error('User not logged in (Local Storage)');

            const shareKey = generateRandomKey(6);
            
            // Save to DB
            const _supabase = window.supabaseClient; 
            if (!_supabase) throw new Error('Supabase client not found');

            const logData = {
                item_id: id,
                item_type: itemType,
                sender_id: userData.id,
                recipient_name: recipientName,
                recipient_org: recipientOrg,
                share_reason: shareReason,
                share_key: shareKey
            };

            const savedLog = await saveExternalShareLog(_supabase, logData);

            // Construct Link
            const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
            const shareUrl = baseUrl + `/dealbook_${itemType}s.html?id=${id}&from=shared`;

            // Prepare sharer info
            const sharerInfo = {
                affiliation: userData.company || userData.department || 'DealChat',
                team: '', 
                name: userData.name || ''
            };

            // Format Guidance Template
            const expiry = new Date(savedLog.expires_at);
            const mm = String(expiry.getMonth() + 1).padStart(2, '0');
            const dd = String(expiry.getDate()).padStart(2, '0');
            const hh = String(expiry.getHours()).padStart(2, '0');
            const min = String(expiry.getMinutes()).padStart(2, '0');
            const dateStr = `${expiry.getFullYear()}.${mm}.${dd} ${hh}:${min}`;
            
            const template = `안녕하세요, ${sharerInfo.affiliation} ${sharerInfo.name}입니다.\n\n아래 링크를 통해 리포트를 확인하실 수 있습니다.\n공유 URL: ${shareUrl}\n접근 키: ${shareKey}\n(최대 3회 접근 가능 / ${dateStr}까지 유효)`;

            // Update UI - Activate Result Area
            const lightThemeColor = themeColor === '#0d9488' ? '#f0fdfa' : '#f5f3ff';
            const borderThemeColor = themeColor === '#0d9488' ? '#ccfbf1' : '#ddd6fe';
            
            $('#ext-share-key-area').css({'background': lightThemeColor, 'border': `1px solid ${borderThemeColor}`});
            $('#ext-share-key-label').css('color', themeColor);
            $('#ext-share-key-display').text(shareKey).css('color', themeColor);
            
            $('#ext-share-guidance-box').css({'background': '#ffffff', 'border': '1.5px solid #e2e8f0', 'color': '#475569'})
                .text(template);
            
            $('#btn-copy-ext-share').prop('disabled', false).css('background', themeColor);
            
            $('#ext-share-expiry').text(`만료 시간: ${dateStr}`);

            // Disable inputs (and gray out background)
            $('#ext-share-recipient, #ext-share-org, #ext-share-reason').prop('disabled', true).css('background', '#f8fafc');
            
            // Disable generate button after success
            btn.prop('disabled', true).text('키 생성 완료').css('background', '#94a3b8');

            // Auto-copy first time
            await navigator.clipboard.writeText(template);
            alert('키가 생성되었으며 안내 문구가 클립보드에 복사되었습니다.');

        } catch (error) {
            // Debugging 403 / auth / schema issues
            const _supabase = window.supabaseClient;
            let authCheck = 'checking...';
            try {
                const { data: { user } } = await _supabase.auth.getUser();
                authCheck = user ? `Logged in as ${user.id}` : 'Not logged in (Supabase Session)';
            } catch (e) {
                authCheck = 'Error checking auth: ' + e.message;
            }

            console.error('External Sharing Failed:', {
                error: error,
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code || 'N/A',
                supabase_auth_status: authCheck
            });
            
            let errorMsg = error.message || '403 Forbidden';
            if (error.code === '42P01') errorMsg = '테이블을 찾을 수 없습니다. SQL을 실행하셨나요?';
            if (error.status === 403 || error.code === '42501') {
                errorMsg = '권한이 없습니다 (RLS 정책 위반). 로그아웃 후 다시 로그인하여 세션을 갱신해주세요.';
            }

            alert('키 생성에 실패했습니다: ' + errorMsg);
            btn.prop('disabled', false).html(originalText).css('background', themeColor);
        }
    });

    // 3. Copy Generated Template logic 
    $('#btn-copy-ext-share').off('click').on('click', async function() {
        if ($(this).prop('disabled')) return;
        const template = $('#ext-share-guidance-box').text();
        try {
            await navigator.clipboard.writeText(template);
            alert('안내 문구가 클립보드에 복사되었습니다.');
        } catch (err) {
            alert('복사에 실패했습니다.');
        }
    });
}


/**
 * Check if NDA is signed for the current user and item
 */
export async function checkNdaStatus(supabase, itemId, userId, itemType) {
    // 1. Check LocalStorage (External use/fallback)
    try {
        const localUserId = userId || 'anonymous';
        const signed = localStorage.getItem(`dealchat_signed_ndas_${itemType}s_${localUserId}`);
        const localSignedList = signed ? JSON.parse(signed) : [];
        if (localSignedList.includes(String(itemId))) return true;
    } catch (e) {
        console.warn('LocalStorage NDA check failed:', e);
    }

    // 2. Check Supabase nda_logs (Member use)
    if (userId) {
        const { data, error } = await supabase
            .from('nda_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('item_id', itemId)
            .eq('item_type', itemType)
            .maybeSingle();
        
        if (data && !error) return true;
    }

    return false;
}

/**
 * Initialize and show NDA Gate Modal
 */
export function initNdaGate(supabase, itemId, itemType, userData, options = {}) {
    const { 
        fromSource = '', 
        returnUrl = './index.html',
        onSuccess = () => location.reload()
    } = options;

    const currentUserName = userData?.name || userData?.email?.split('@')[0] || '사용자';
    const isExternal = fromSource === 'shared' && !userData?.isLoggedIn;
    let guestName = null;

    $('#logged-in-user-name').text(currentUserName);
    
    const ndaModalEl = document.getElementById('nda-modal');
    if (!ndaModalEl) {
        console.error('NDA Modal element not found in HTML');
        return;
    }

    const ndaModal = bootstrap.Modal.getOrCreateInstance(ndaModalEl, {
        backdrop: 'static',
        keyboard: false
    });

    // Reset UI
    $('#nda-signature-name').val('');
    $('#nda-confirmation-text').val('');
    $('#nda-access-key').val('');
    $('#btn-confirm-nda').prop('disabled', true).css('opacity', '0.5');

    const $accessKeySection = $('#nda-access-key-section');
    if (isExternal) {
        $accessKeySection.show();
        $('#nda-name-hint').text('* 전달받은 6자리 접근 키를 입력해주세요.');
    } else {
        $accessKeySection.hide();
        $('#nda-name-hint').html(`* <strong style="color: #6366f1;">${currentUserName}</strong> 님의 성함을 입력해주세요.`);
    }

    const validateInputs = () => {
        const signature = $('#nda-signature-name').val().trim();
        const confirmTxt = $('#nda-confirmation-text').val().trim();
        const REQUIRED_TXT = "위 사항을 위반하지 않을 것을 약속합니다";
        
        let isValid = false;
        if (isExternal) {
            const accessKey = $('#nda-access-key').val().trim();
            isValid = (signature === (guestName || '') && confirmTxt === REQUIRED_TXT && accessKey.length >= 6);
        } else {
            isValid = (signature === currentUserName && confirmTxt === REQUIRED_TXT);
        }

        const $confirmBtn = $('#btn-confirm-nda');
        $confirmBtn.prop('disabled', !isValid).css('opacity', isValid ? '1' : '0.5');
    };

    $('#nda-signature-name, #nda-confirmation-text').off('input').on('input', validateInputs);

    if (isExternal) {
        $('#nda-access-key').off('input').on('input', async function() {
            const key = $(this).val().trim();
            if (key.length >= 6) {
                const shareLog = await validateShareKey(supabase, itemId, key);
                if (shareLog) {
                    guestName = shareLog.recipient_name;
                    $('#logged-in-user-name').text(guestName).css('color', '#0d9488');
                    $('#nda-name-hint').html(`* <strong style="color: #0d9488;">${guestName}</strong> 님의 성함을 입력해주세요.`);
                    $(this).css('border-color', '#10b981');
                } else {
                    guestName = null;
                    $('#logged-in-user-name').text('사용자').css('color', '#8b5cf6');
                    $('#nda-name-hint').html(`* 유효하지 않은 키이거나 접근 횟수를 초과했습니다.`);
                    $(this).css('border-color', '#ef4444');
                }
            } else {
                guestName = null;
                $('#nda-name-hint').text('* 전달받은 6자리 접근 키를 입력해주세요.');
                $(this).css('border-color', '#f1f5f9');
            }
            validateInputs();
        });
    }

    $('#btn-confirm-nda').off('click').on('click', async () => {
        const signature = $('#nda-signature-name').val().trim();
        
        if (isExternal) {
            const accessKey = $('#nda-access-key').val().trim();
            const shareLog = await validateShareKey(supabase, itemId, accessKey);
            if (!shareLog) {
                alert('유효하지 않거나 만료된 접근 키입니다.');
                return;
            }
            await logExternalAccess(supabase, shareLog.id);
        }

        try {
            if (userData && userData.isLoggedIn) {
                await supabase.from('nda_logs').insert({
                    user_id: userData.id,
                    item_id: itemId,
                    item_type: itemType,
                    signature: signature
                });
            }
            
            // Save to LocalStorage
            const localUserId = userData?.id || 'anonymous';
            const signed = localStorage.getItem(`dealchat_signed_ndas_${itemType}s_${localUserId}`);
            const list = signed ? JSON.parse(signed) : [];
            if (!list.includes(String(itemId))) {
                list.push(String(itemId));
                localStorage.setItem(`dealchat_signed_ndas_${itemType}s_${localUserId}`, JSON.stringify(list));
            }

            ndaModal.hide();
            onSuccess();
        } catch (e) {
            console.error('NDA sign error:', e);
            alert('NDA 체결 중 오류가 발생했습니다.');
        }
    });

    $('#nda-modal-cancel-btn').off('click').on('click', () => {
        location.href = returnUrl;
    });

    ndaModal.show();
}
