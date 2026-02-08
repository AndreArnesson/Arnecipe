import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { CategoryFilter } from "@/components/CategoryFilter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChefHat, LogOut, Search, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { RecipeCategory } from "@/i18n/translations";

interface Recipe {
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
  created_at: string;
  user_id: string;
  profiles?: {
    display_name?: string;
  };
}

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const fetchRecipes = async () => {
    if (!user) return;

    setIsLoadingRecipes(true);
    try {
      // Fetch recipes first
      const { data: recipesData, error: recipesError } = await supabase
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false });

      if (recipesError) {
        console.error("Error fetching recipes:", recipesError);
        toast.error("Failed to load recipes");
        return;
      }

      // Fetch profiles for all recipe creators
      const userIds = [...new Set((recipesData || []).map(r => r.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      
      const profilesMap = new Map((profilesData || []).map(p => [p.user_id, p]));
      
      const recipesWithProfiles = (recipesData || []).map(recipe => ({
        ...recipe,
        profiles: profilesMap.get(recipe.user_id) as { display_name?: string } | undefined
      }));
      
      setRecipes(recipesWithProfiles);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      toast.error("Failed to load recipes");
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRecipes();
    }
  }, [user]);

  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch = 
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === null || recipe.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setDetailOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                <ChefHat className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground">
                  {t("app.title")}
                </h1>
                <p className="text-xs text-muted-foreground">{t("app.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LanguageToggle />
              <AddRecipeDialog onRecipeAdded={fetchRecipes} />
              <Button variant="ghost" size="icon" onClick={signOut} title={t("auth.signOut")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="gradient-hero py-12 px-4">
        <div className="container mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("hero.title")} <span className="text-gradient">{t("hero.titleHighlight")}</span>
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            {t("hero.description")}
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("hero.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 bg-background/80 backdrop-blur-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="max-w-3xl mx-auto">
            <CategoryFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>
        </div>
      </section>

      {/* Recipes Grid */}
      <main className="container mx-auto px-4 py-8">
        {isLoadingRecipes ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              {searchQuery || selectedCategory ? t("recipe.noRecipesFound") : t("recipe.noRecipes")}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || selectedCategory
                ? t("recipe.tryDifferentSearch")
                : t("recipe.noRecipesDescription")}
            </p>
            {!searchQuery && !selectedCategory && <AddRecipeDialog onRecipeAdded={fetchRecipes} />}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRecipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  description={recipe.description}
                  prepTime={recipe.prep_time}
                  cookTime={recipe.cook_time}
                  servings={recipe.servings}
                  imageUrl={recipe.image_url}
                  category={recipe.category}
                  onClick={() => handleRecipeClick(recipe)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Recipe Detail Dialog */}
      <RecipeDetail
        recipe={selectedRecipe}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
