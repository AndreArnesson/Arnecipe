import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ChefHat, Tag, Loader2 } from "lucide-react";
import { LinkifyText } from "@/components/LinkifyText";
import { StarRating } from "@/components/StarRating";
import { useLanguage } from "@/i18n/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface SharedRecipeData {
  id: string;
  title: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  image_url?: string;
  category?: string | null;
  creator_name?: string;
  avg_rating?: number;
  rating_count?: number;
}

export default function SharedRecipe() {
  const { token } = useParams<{ token: string }>();
  const { t, language } = useLanguage();
  const [recipe, setRecipe] = useState<SharedRecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchSharedRecipe = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }

      // Look up the share token
      const { data: share } = await supabase
        .from("recipe_shares")
        .select("recipe_id")
        .eq("share_token", token)
        .maybeSingle();

      if (!share) { setNotFound(true); setLoading(false); return; }

      // Fetch recipe
      const { data: recipeData } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", share.recipe_id)
        .maybeSingle();

      if (!recipeData) { setNotFound(true); setLoading(false); return; }

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", recipeData.user_id)
        .maybeSingle();

      // Fetch ratings
      const { data: ratings } = await supabase
        .from("recipe_ratings")
        .select("rating")
        .eq("recipe_id", recipeData.id);

      const ratingSum = (ratings || []).reduce((s, r) => s + Number(r.rating), 0);
      const ratingCount = (ratings || []).length;

      setRecipe({
        ...recipeData,
        creator_name: profile?.display_name || undefined,
        avg_rating: ratingCount > 0 ? ratingSum / ratingCount : 0,
        rating_count: ratingCount,
      });
      setLoading(false);
    };

    fetchSharedRecipe();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !recipe) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">{t("share.notFound")}</h1>
          <p className="text-muted-foreground">{t("share.notFoundDescription")}</p>
        </div>
      </div>
    );
  }

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <span className="font-display font-bold">{t("app.title")}</span>
          </div>
          <LanguageToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-6">
          {recipe.image_url && (
            <div className="aspect-video rounded-xl overflow-hidden">
              <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
            </div>
          )}

          <h1 className="font-display text-3xl font-bold">{recipe.title}</h1>

          {recipe.description && (
            <p className="text-muted-foreground"><LinkifyText text={recipe.description} /></p>
          )}

          {(recipe.avg_rating || 0) > 0 && (
            <div className="flex items-center gap-2">
              <StarRating value={recipe.avg_rating || 0} readonly size="md" showValue count={recipe.rating_count} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {totalTime > 0 && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Clock className="h-3.5 w-3.5" />
                {totalTime} {t("recipe.totalTime")}
              </Badge>
            )}
            {recipe.servings && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Users className="h-3.5 w-3.5" />
                {recipe.servings} {t("recipe.servings")}
              </Badge>
            )}
            {recipe.category && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Tag className="h-3.5 w-3.5" />
                {language === "en" ? t(`category.${recipe.category}` as any) : recipe.category}
              </Badge>
            )}
            {recipe.creator_name && (
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                <ChefHat className="h-3.5 w-3.5" />
                {recipe.creator_name}
              </Badge>
            )}
          </div>

          {recipe.prep_time || recipe.cook_time ? (
            <div className="grid grid-cols-2 gap-4">
              {recipe.prep_time && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">{t("recipe.prepTime")}</p>
                  <p className="font-display text-xl font-semibold">{recipe.prep_time} {t("recipe.minutes")}</p>
                </div>
              )}
              {recipe.cook_time && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">{t("recipe.cookTime")}</p>
                  <p className="font-display text-xl font-semibold">{recipe.cook_time} {t("recipe.minutes")}</p>
                </div>
              )}
            </div>
          ) : null}

          {recipe.ingredients.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">{t("recipe.ingredients")}</h3>
              <ul className="space-y-2">
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <LinkifyText text={ingredient} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.instructions.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">{t("recipe.instructions")}</h3>
              <ol className="space-y-4">
                {recipe.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                      {index + 1}
                    </span>
                    <p className="pt-1"><LinkifyText text={instruction} /></p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
