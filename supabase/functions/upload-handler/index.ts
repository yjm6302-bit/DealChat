import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// 간단한 메모리 기반 Rate Limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // 분당 최대 요청 수
const RATE_WINDOW = 60 * 1000; // 1분 (밀리초)

function checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(identifier);
    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_WINDOW });
        return true;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT) {
        return false;
    }
    return true;
}

const ALLOWED_ORIGINS = [
    "https://afitwguexwihnepyutqw.supabase.co",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
];

const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get("origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
}

// --- Helpers ---

function createResponse(body: any, status: number = 200, req?: Request) {
    const cors = req ? getCorsHeaders(req) : getCorsHeaders(new Request("https://dummy"));
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
    });
}

function errorResponse(message: string, status: number = 400, req?: Request) {
    return createResponse({ error: message }, status, req);
}

// Reusable logic for RAG/Embeddings
async function generateAndStoreEmbeddings(
    parsedText: string,
    vectorNamespace: string,
    fileId: string,
    fileName: string,
    userId: string,
    supabase: any
) {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is missing. Skipping vector indexing.");
        return;
    }

    const chunkSize = 1000;
    const overlap = 200;
    const textLength = parsedText.length;

    console.log(`Starting indexing for file ${fileId}. Namespace: ${vectorNamespace}`);

    for (let i = 0; i < textLength; i += (chunkSize - overlap)) {
        const chunk = parsedText.substring(i, i + chunkSize);
        if (chunk.length < 50) continue;

        const embeddingResp = await fetch(`https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: { parts: [{ text: chunk }] }
            }),
        });

        if (!embeddingResp.ok) {
            const errText = await embeddingResp.text();
            throw new Error(`Embedding API error: ${embeddingResp.status} ${errText}`);
        }

        const embeddingData = await embeddingResp.json();

        if (embeddingData.embedding && embeddingData.embedding.values) {
            const embedding = embeddingData.embedding.values;

            const { error: insErr } = await supabase.from('document_sections').insert({
                content: chunk,
                embedding: embedding,
                company_id: vectorNamespace,
                metadata: {
                    file_id: fileId,
                    file_name: fileName || "Unknown",
                    user_id: userId,
                    company_id: vectorNamespace
                }
            });
            if (insErr) throw insErr;
        }
    }
    console.log(`Vector indexing completed for file ${fileId}`);
}

// --- Main Handler ---

Deno.serve(async (req) => {
    // Rate Limiting
    const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(clientIP)) {
        return new Response(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "60" },
        });
    }
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: getCorsHeaders(req) });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const contentType = req.headers.get("content-type") || "";

        // 1. Multipart Form Data Handling
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File;
            const userId = (formData.get("user_id") || formData.get("userId") || "anonymous") as string;
            const action = formData.get("action") as string || "upload";
            const table = formData.get("table") as string || "files";

            if (action === "upload" && file) {
                // 서버측 파일 타입 검증
                if (!ALLOWED_TYPES.includes(file.type)) {
                    return errorResponse(`허용되지 않는 파일 형식입니다: ${file.type}`, 400, req);
                }
                const rawFileName = file.name;
                const safeName = `${Date.now()}_${rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const storagePath = `${userId}/${safeName}`;

                // Upload to Storage
                const { error: uploadError } = await supabase.storage
                    .from("uploads")
                    .upload(storagePath, file, {
                        contentType: file.type,
                        upsert: true,
                    });

                if (uploadError) throw uploadError;

                // Update Database (Unified schema strategy)
                const fileMetadata: Record<string, any> = {
                    file_name: rawFileName,
                    location: storagePath,      // Legacy
                    storage_path: storagePath,  // v2
                    userId: userId,             // Legacy
                    user_id: userId,            // v2
                    summary: formData.get("summary") as string || "",
                };

                const { data, error: dbError } = await supabase
                    .from(table)
                    .insert(fileMetadata)
                    .select();

                if (dbError) {
                    console.error("Database insert error details:", dbError);
                    throw dbError;
                }

                return createResponse({ message: "Upload success", data }, 200, req);
            }
        }

        // 2. JSON Handling
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return errorResponse("Invalid JSON", 400, req);
        }

        const { action, table } = body;

        if (!action || !table) {
            return errorResponse("Missing action or table", 400, req);
        }

        const query = supabase.from(table);

        if (action === "get" || action === "read") {
            // Updated Logic: shareType and remove scanMode
            const { id, userId, keyword, shareType, ...filters } = body;

            if (id) {
                const { data, error } = await query.select("*").eq("id", id).single();
                if (error) throw error;
                return createResponse(data, 200, req);
            } else {
                let select = query.select("*");

                // Direct equality filters
                for (const [key, value] of Object.entries(filters)) {
                    if (key !== "action" && key !== "table" && value !== undefined && value !== null && value !== "") {
                        select = select.eq(key, value);
                    }
                }

                // Explicit share_type filter
                if (shareType) {
                    select = select.eq('share_type', shareType);
                }

                // User filter logic (My Data OR Public Data)
                if (userId) {
                    if (['sellers', 'buyers'].includes(table)) {
                        select = select.or(`userId.eq.${userId},share_type.eq.public`);
                    } else {
                        select = select.eq("userId", userId);
                    }
                }

                // Search keyword
                if (keyword && typeof keyword === 'string' && keyword.trim() !== "") {
                    const cleanKw = keyword.trim().replace(/[,()."\\\\]/g, '');
                    if (cleanKw.length === 0) return createResponse([], 200, req);
                    const nfcKw = cleanKw.normalize('NFC');
                    const nfdKw = cleanKw.normalize('NFD');

                    if (table === 'files') {
                        select = select.or(`file_name.ilike.%${nfcKw}%,file_name.ilike.%${nfdKw}%`);
                    } else if (['companies', 'sellers', 'buyers'].includes(table)) {
                        select = select.or(`companyName.ilike.%${nfcKw}%,companyName.ilike.%${nfdKw}%`);
                    } else if (table === 'users') {
                        select = select.ilike('email', `%${cleanKw}%`);
                    }
                }

                const { data, error } = await select;
                if (error) throw error;
                return createResponse(data, 200, req);
            }

        } else if (action === "upload" || action === "create") {
            const { action: _, table: __, ...rawData } = body;

            // Handle Base64 Upload (often from File_Functions.js)
            if (rawData.is_base64 && rawData.content) {
                // 서버측 파일 타입 검증
                if (rawData.content_type && !ALLOWED_TYPES.includes(rawData.content_type)) {
                    return errorResponse(`허용되지 않는 파일 형식입니다: ${rawData.content_type}`, 400, req);
                }
                const { content, file_name, content_type, is_base64: _is_base64, ...metadata } = rawData;
                
                // Flexible userId extraction
                const userId = rawData.user_id || rawData.userId || 'anonymous';

                // [RAG] Parsing Parameters
                const parsedText = metadata.parsedText;
                const vectorNamespace = metadata.vectorNamespace || metadata.companyId;

                const timestamp = Date.now();
                // 파일명 소독: 경로 탐색 문자 및 위험 문자 제거
                const rawExt = file_name.substring(file_name.lastIndexOf('.'));
                const ext = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
                const safeFileName = `${timestamp}${ext}`;
                const storagePath = `${userId}/${safeFileName}`;

                // 파일 크기 검증 (50MB 제한)
                const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
                const estimatedSize = Math.ceil(content.length * 3 / 4);
                if (estimatedSize > MAX_FILE_SIZE) {
                    return errorResponse(`파일 크기가 제한(50MB)을 초과합니다.`, 400, req);
                }

                // Decode base64
                const binaryStr = atob(content);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }

                // 1. Upload to Storage
                const { error: uploadError } = await supabase.storage
                    .from("uploads")
                    .upload(storagePath, bytes, {
                        contentType: content_type || 'application/octet-stream',
                        upsert: true,
                    });
                if (uploadError) throw uploadError;

                // 2. Insert into Database (Unified schema strategy)
                const now = new Date().toISOString();
                const dbRow: Record<string, any> = {
                    file_name: file_name,
                    location: storagePath,      // Legacy
                    storage_path: storagePath,  // v2
                    userId: userId,             // Legacy
                    user_id: userId,            // v2
                    created_at: now,            // Exists in both schemas
                };

                const excludedFields = ['vectorNamespace', 'companyId', 'is_base64', 'content', 'content_type', 'action', 'table', 'created_at', 'updated_at', 'storage_path', 'user_id'];

                for (const [key, value] of Object.entries(metadata)) {
                    if (!excludedFields.includes(key) && value !== undefined && value !== null && value !== "") {
                        dbRow[key] = value;
                    }
                }

                const { data: result, error: dbError } = await query.insert(dbRow).select();
                if (dbError) throw dbError;

                // [RAG] 3. Generate Embeddings & Save to Vector DB
                if (parsedText && vectorNamespace) {
                    try {
                        const fileId = result[0].id;
                        await generateAndStoreEmbeddings(parsedText, vectorNamespace, fileId, file_name, userId, supabase);
                    } catch (vecErr: any) {
                        console.error("Vector generation failed:", vecErr);
                    }
                }

                return createResponse(result, 200, req);
            }

            // Normal JSON create/upload (not base64)
            const now = new Date().toISOString();
            const data: Record<string, any> = {
                created_at: now,
            };
            const globalExcluded = ['scanMode', 'companyId', 'created_at', 'updated_at'];

            for (const [key, value] of Object.entries(rawData)) {
                if (!globalExcluded.includes(key) && value !== undefined && value !== null && value !== "") {
                    data[key] = value;
                }
            }

            const { data: result, error } = await query.insert(data).select();
            if (error) throw error;
            return createResponse(result, 200, req);

        } else if (action === "update") {
            const { id, action: _upd, table: __upd, ...updRawData } = body;

            const data: Record<string, any> = {};
            const globalExcluded = ['scanMode', 'companyId', 'created_at', 'updated_at'];

            for (const [key, value] of Object.entries(updRawData)) {
                if (!globalExcluded.includes(key) && value !== undefined && value !== null && value !== "") {
                    data[key] = value;
                }
            }

            const { data: result, error } = await query.update(data).eq("id", id).select();
            if (error) throw error;
            return createResponse(result, 200, req);

        } else if (action === "delete") {
            const targetId = body.id || body.fileId;
            const { data: result, error } = await query.delete().eq("id", targetId).select();
            if (error) throw error;
            return createResponse(result, 200, req);

        } else if (action === "index_existing") {
            const { parsedText, vectorNamespace, fileId, file_name, userId } = body;

            if (!parsedText || !vectorNamespace || !fileId) {
                return errorResponse("Missing parsedText, vectorNamespace, or fileId", 400, req);
            }

            try {
                await generateAndStoreEmbeddings(parsedText, vectorNamespace, fileId, file_name, userId, supabase);
                return createResponse({ message: "Indexing success" }, 200, req);
            } catch (vecErr: any) {
                console.error("Vector generation failed:", vecErr);
                return createResponse({ error: vecErr.message }, 500, req);
            }

        } else if (action === "delete_vector") {
            // [RAG] Vector Deletion Action
            const { fileId, vectorNamespace } = body;

            if (!fileId || !vectorNamespace) {
                return errorResponse("Missing fileId or vectorNamespace", 400, req);
            }

            // Delete from document_sections using metadata filter
            const { error } = await supabase
                .from('document_sections')
                .delete()
                .eq('company_id', vectorNamespace)
                .filter('metadata->>file_id', 'eq', fileId);

            if (error) throw error;

            return createResponse({ message: "Vectors deleted" }, 200, req);
        }

        return errorResponse(`Unknown action: ${action}`, 400, req);

    } catch (error: any) {
        console.error("[upload-handler error]", error);
        const message = error.message || String(error);
        // 내부 에러 상세를 클라이언트에 노출하지 않음
        const safeMessage = message.includes("env") || message.includes("key") 
            ? "서버 내부 오류가 발생했습니다." 
            : message;
        return createResponse({ error: safeMessage }, 500, req);
    }
});
