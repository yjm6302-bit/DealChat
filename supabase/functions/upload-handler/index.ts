import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT, PATCH",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Helpers ---

function createResponse(body: any, status: number = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function errorResponse(message: string, status: number = 400) {
    return createResponse({ error: message }, status);
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
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
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
                const fileName = file.name;
                const storagePath = `${userId}/${fileName}`;

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
                    file_name: fileName,
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

                return createResponse({ message: "Upload success", data });
            }
        }

        // 2. JSON Handling
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return errorResponse("Invalid JSON");
        }

        const { action, table } = body;

        if (!action || !table) {
            return errorResponse("Missing action or table");
        }

        const query = supabase.from(table);

        if (action === "get" || action === "read") {
            // Updated Logic: shareType and remove scanMode
            const { id, userId, keyword, shareType, ...filters } = body;

            if (id) {
                const { data, error } = await query.select("*").eq("id", id).single();
                if (error) throw error;
                return createResponse(data);
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
                    const cleanKw = keyword.trim();
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
                return createResponse(data);
            }

        } else if (action === "upload" || action === "create") {
            const { action: _, table: __, ...rawData } = body;

            // Handle Base64 Upload (often from File_Functions.js)
            if (rawData.is_base64 && rawData.content) {
                const { content, file_name, content_type, is_base64: _is_base64, ...metadata } = rawData;
                
                // Flexible userId extraction
                const userId = rawData.user_id || rawData.userId || 'anonymous';

                // [RAG] Parsing Parameters
                const parsedText = metadata.parsedText;
                const vectorNamespace = metadata.vectorNamespace || metadata.companyId;

                const timestamp = Date.now();
                const ext = file_name.substring(file_name.lastIndexOf('.'));
                const safeFileName = `${timestamp}${ext}`;
                const storagePath = `${userId}/${safeFileName}`;

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

                return createResponse(result);
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
            return createResponse(result);

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
            return createResponse(result);

        } else if (action === "delete") {
            const targetId = body.id || body.fileId;
            const { data: result, error } = await query.delete().eq("id", targetId).select();
            if (error) throw error;
            return createResponse(result);

        } else if (action === "index_existing") {
            const { parsedText, vectorNamespace, fileId, file_name, userId } = body;

            if (!parsedText || !vectorNamespace || !fileId) {
                return errorResponse("Missing parsedText, vectorNamespace, or fileId");
            }

            try {
                await generateAndStoreEmbeddings(parsedText, vectorNamespace, fileId, file_name, userId, supabase);
                return createResponse({ message: "Indexing success" });
            } catch (vecErr: any) {
                console.error("Vector generation failed:", vecErr);
                return createResponse({ error: vecErr.message }, 500);
            }

        } else if (action === "delete_vector") {
            // [RAG] Vector Deletion Action
            const { fileId, vectorNamespace } = body;

            if (!fileId || !vectorNamespace) {
                return errorResponse("Missing fileId or vectorNamespace");
            }

            // Delete from document_sections using metadata filter
            const { error } = await supabase
                .from('document_sections')
                .delete()
                .eq('company_id', vectorNamespace)
                .filter('metadata->>file_id', 'eq', fileId);

            if (error) throw error;

            return createResponse({ message: "Vectors deleted" });
        }

        return errorResponse(`Unknown action: ${action}`);

    } catch (error: any) {
        console.error(error);
        return createResponse({ error: error.message || String(error) }, 500);
    }
});
