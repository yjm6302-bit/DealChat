import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT, PATCH",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        // 동적 모델 선택 지원: body.model이 있으면 사용, 없으면 기본값 설정
        const model = body.model || "gemini-1.5-flash";
        const prompts = body.body || body.prompts;
        const action = body.action;

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing Environment Variables (GEMINI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY)");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Vector Search Action (Gemini Embedding)
        if (action === 'search_vector') {
            const query = body.query;
            const vectorNamespace = body.vectorNamespace;
            const topK = body.topK || 5;

            if (!query) throw new Error("Missing query for vector search");

            // 1-1. Generate Gemini Embedding
            const embeddingResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${apiKey}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: {
                        parts: [{ text: query }]
                    }
                }),
            });
            
            const embeddingData = await embeddingResponse.json();

            if (!embeddingData.embedding || !embeddingData.embedding.values) {
                throw new Error("Failed to generate Gemini embedding: " + JSON.stringify(embeddingData));
            }
            const queryEmbedding = embeddingData.embedding.values;

            // 1-2. Search in Supabase (RPC call)
            const { data: documents, error } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.3,
                match_count: topK,
                filter: vectorNamespace ? { company_id: vectorNamespace } : {}
            });

            if (error) throw error;

            // 결과 텍스트만 추출해서 배열로 반환
            const results = documents ? documents.map((doc: any) => doc.content) : [];

            return new Response(JSON.stringify({ results }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2. Default: Chat Completion (Dynamic Model Loading)
        const userPrompt = prompts || body.query || "";

        // URL 파라미터에 선택된 모델명을 동적으로 반영
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userPrompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 4096, // Increased from 2048 to prevent truncation
                },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            }),
        });

        const data = await response.json();

        if (data.error) {
            return new Response(JSON.stringify({ error: data.error, model_used: model }), {
                status: response.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Gemini response parsing: candidates[0].content.parts[0].text
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

        return new Response(JSON.stringify({ answer }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
