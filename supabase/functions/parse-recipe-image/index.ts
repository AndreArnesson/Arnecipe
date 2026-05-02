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
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) return new Response(JSON.stringify({ error: "No image provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
    if (!GOOGLE_AI_KEY) return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = `Extract the recipe from this image. The image may contain text in English or Swedish â€” always respond in the SAME language as the text in the image.

Return a JSON object with:
- title: A clear recipe title
- description: A brief description (1-2 sentences)
- ingredients: Array of ingredient strings with quantities. If the recipe has distinct sections, prefix each section header with "## ".
- instructions: Array of step-by-step instructions
- prepTime: Estimated preparation time in minutes (number)
- cookTime: Estimated cooking time in minutes (number)
- servings: Estimated number of servings (number)
- category: One of: "FÃ¶rrÃ¤tt", "HuvudrÃ¤tt", "EfterrÃ¤tt", "Bakning", "Sallad", "Soppa", "Frukost", "MellanmÃ¥l", "Dryck", "Ã–vrigt"

Only return the JSON object, no markdown or other text.`;

    const response = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return new Response(JSON.stringify({ error: "Failed to parse recipe from image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let recipe;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      recipe = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse recipe from image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(recipe), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

