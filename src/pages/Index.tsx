import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryFilter } from "@/components/CategoryFilter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChefHat, LogOut, Search, Loader2, BookOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { RecipeCategory } from "@/i18n/translations";
import { PendingInviteBanner } from "@/components/PendingInviteBanner";

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
  visibility?: string;
  created_at: string;
  user_id: string;
  profiles?: {
    display_name?: string;
  };
  avgRating?: number;
  ratingCount?: number;
  userRating?: number;
}

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all"); // "all" | "mine" | "group"
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string>("newest"); // "newest" | "avgRating" | "myRating"

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const fetchRecipes = async () => {
    if (!user) return;

    setIsLoadingRecipes(true);
    try {
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
      const recipeIds = (recipesData || []).map(r => r.id);
      
      const [{ data: profilesData }, { data: ratingsData }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name").in("user_id", userIds),
        supabase.from("recipe_ratings").select("recipe_id, rating, user_id").in("recipe_id", recipeIds),
      ]);
      
      const profilesMap = new Map((profilesData || []).map(p => [p.user_id, p]));
      
      // Calculate avg and user ratings per recipe
      const ratingsByRecipe = new Map<string, { sum: number; count: number; userRating?: number }>();
      for (const r of (ratingsData || [])) {
        const entry = ratingsByRecipe.get(r.recipe_id) || { sum: 0, count: 0 };
        entry.sum += Number(r.rating);
        entry.count += 1;
        if (r.user_id === user.id) entry.userRating = Number(r.rating);
        ratingsByRecipe.set(r.recipe_id, entry);
      }
      
      const recipesWithProfiles = (recipesData || []).map(recipe => {
        const ratingInfo = ratingsByRecipe.get(recipe.id);
        return {
          ...recipe,
          profiles: profilesMap.get(recipe.user_id) as { display_name?: string } | undefined,
          avgRating: ratingInfo ? ratingInfo.sum / ratingInfo.count : 0,
          ratingCount: ratingInfo?.count || 0,
          userRating: ratingInfo?.userRating || 0,
        };
      });
      
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

  // Get unique creators for filter tags
  const creators = [...new Map(
    recipes
      .filter(r => r.profiles?.display_name)
      .map(r => [r.user_id, r.profiles!.display_name!])
  ).entries()].map(([userId, name]) => ({ userId, name }));

  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch = 
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === null || recipe.category === selectedCategory;
    const matchesCreator = selectedCreator === null || recipe.user_id === selectedCreator;
    
    let matchesSource = true;
    if (selectedSource === "mine") {
      matchesSource = recipe.user_id === user?.id;
    } else if (selectedSource === "group") {
      matchesSource = recipe.user_id !== user?.id;
    }
    
    return matchesSearch && matchesCategory && matchesCreator && matchesSource;
  }).sort((a, b) => {
    if (sortBy === "avgRating") return (b.avgRating || 0) - (a.avgRating || 0);
    if (sortBy === "myRating") return (b.userRating || 0) - (a.userRating || 0);
    return 0; // default: already sorted by newest from DB
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
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full gradient-primary flex items-center justify-center shrink-0">
                <ChefHat className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="sr-only sm:not-sr-only font-display text-base sm:text-xl font-bold text-foreground truncate">
                  {t("app.title")}
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">{t("app.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <LanguageToggle />
              <Button variant="ghost" size="icon" onClick={() => navigate("/groups")} title={t("groups.title")}>
                <Users className="h-4 w-4" />
              </Button>
              <AddRecipeDialog onRecipeAdded={fetchRecipes} />
              <Button variant="ghost" size="icon" onClick={signOut} title={t("auth.signOut")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Pending Invite Banner */}
      <div className="container mx-auto px-4 pt-4">
        <PendingInviteBanner />
      </div>

      {/* Hero Section */}
      <section className="gradient-hero py-6 sm:py-12 px-4">
        <div className="container mx-auto text-center">
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
            {t("hero.title")} <span className="text-gradient">{t("hero.titleHighlight")}</span>
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 sm:mb-8 text-sm sm:text-base">
            {t("hero.description")}
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto mb-4 sm:mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("hero.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-11 sm:h-12 bg-background/80 backdrop-blur-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="max-w-3xl mx-auto mb-3">
            <CategoryFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>

          {/* Source filter + Creator dropdown */}
          <div className="flex flex-wrap justify-center items-center gap-2 max-w-3xl mx-auto mb-3">
            <Badge
              variant={selectedSource === "all" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedSource("all")}
            >
              {t("recipe.allCreators")}
            </Badge>
            <Badge
              variant={selectedSource === "mine" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedSource("mine")}
            >
              {t("recipe.myRecipes")}
            </Badge>
            <Badge
              variant={selectedSource === "group" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedSource("group")}
            >
              {t("recipe.groupRecipes")}
            </Badge>

            {creators.length > 1 && (
              <Select
                value={selectedCreator || "all"}
                onValueChange={(v) => setSelectedCreator(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-[180px] h-8 bg-background">
                  <SelectValue placeholder={t("recipe.filterByCreator")} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">{t("recipe.allMembers")}</SelectItem>
                  {creators.map((c) => (
                    <SelectItem key={c.userId} value={c.userId}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="flex justify-center mt-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px] h-8 bg-background">
                <SelectValue placeholder={t("recipe.sortLabel")} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="newest">{t("recipe.sortByNewest")}</SelectItem>
                <SelectItem value="avgRating">{t("recipe.sortByAvgRating")}</SelectItem>
                <SelectItem value="myRating">{t("recipe.sortByMyRating")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>
      </section>

      {/* Recipes Grid */}
      <main className="container mx-auto px-4 py-6 sm:py-8">
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
              {searchQuery || selectedCategory || selectedCreator ? t("recipe.noRecipesFound") : t("recipe.noRecipes")}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || selectedCategory || selectedCreator
                ? t("recipe.tryDifferentSearch")
                : t("recipe.noRecipesDescription")}
            </p>
            {!searchQuery && !selectedCategory && !selectedCreator && <AddRecipeDialog onRecipeAdded={fetchRecipes} />}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
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
                  avgRating={recipe.avgRating}
                  ratingCount={recipe.ratingCount}
                  userRating={recipe.userRating}
                  creatorName={recipe.profiles?.display_name}
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
        onRecipeUpdated={fetchRecipes}
      />
    </div>
  );
}
