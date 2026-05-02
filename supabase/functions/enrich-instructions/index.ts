import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ingredients, instructions, language } = await req.json();
    if (!ingredients?.length || !instructions?.length) return new Response(JSON.stringify({ error: "Both ingredients and instructions are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
    if (!GOOGLE_AI_KEY) return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const lang = language === "en" ? "English" : "Swedish";

    const prompt = `You are a cooking assistant. Enrich these recipe instructions by weaving in the relevant ingredient quantities inline. Keep the same number of steps. Respond in ${lang}. Return valid JSON only.

Ingredients:
${ingredients.map((i: string) => `- ${i}`).join("\n")}

Instructions:
${instructions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}

Return a JSON object with:
- enrichedInstructions: Array of strings, same number of steps, with quantities woven in naturally.

Only return the JSON object, no markdown or other text.`;

    const response = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return new Response(JSON.stringify({ error: "Failed to enrich instructions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse enriched instructions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

