import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ha-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const providedSecret = req.headers.get("x-ha-secret");
  const expectedSecret = Deno.env.get("HA_SHARED_SECRET");

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { action: string; search?: string; recipe_id?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  if (body.action === "list") {
    let query = supabase
      .from("recipes")
      .select("id, title, category")
      .order("title", { ascending: true });

    if (body.search) {
      query = query.ilike("title", `%${body.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.action === "get") {
    const { recipe_id, title } = body;

    if (!recipe_id && !title) {
      return new Response(JSON.stringify({ error: "Provide recipe_id or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .from("recipes")
      .select("id, title, ingredients")
      .limit(1);

    if (recipe_id) {
      query = query.eq("id", recipe_id);
    } else {
      query = query.ilike("title", `%${title}%`).order("title", { ascending: true });
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "Recipe not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ingredients: string[] = (data.ingredients ?? []).filter(
      (item: string) => !item.startsWith("## ")
    );

    return new Response(
      JSON.stringify({ id: data.id, title: data.title, ingredients }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
