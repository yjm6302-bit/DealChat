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
        // 하위 호환성 유지: body.body가 있으면 prompts로 간주, 아니면 action 기반 처리
        const prompts = body.body || body.prompts;
        const action = body.action;

        const apiKey = Deno.env.get("OPENAI_API_KEY");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing Environment Variables");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Vector Search Action
        if (action === 'search_vector') {
            const query = body.query;
            const vectorNamespace = body.vectorNamespace;
            const topK = body.topK || 5;

            if (!query) throw new Error("Missing query for vector search");

            // 1-1. Generate Embedding
            const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "text-embedding-3-small",
                    input: query,
                }),
            });
            const embeddingData = await embeddingResponse.json();

            if (!embeddingData.data || !embeddingData.data[0]) {
                throw new Error("Failed to generate embedding: " + JSON.stringify(embeddingData));
            }
            const queryEmbedding = embeddingData.data[0].embedding;

            // 1-2. Search in Supabase (RPC call)
            // match_documents 함수는 Supabase SQL Editor에서 미리 정의되어 있어야 함
            const { data: documents, error } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.3, // 유사도 임계값 완화 (0.5 -> 0.3)
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

        // 2. Default: Chat Completion (Existing Logic)
        const userPrompt = prompts || body.query || ""; // Fallback

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-5-nano",
                messages: [
                    { role: "system", content: "You are a professional assistant." },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || "No response generated.";

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
