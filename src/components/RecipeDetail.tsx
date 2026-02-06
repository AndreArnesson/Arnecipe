import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ChefHat } from "lucide-react";

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
  created_at: string;
  profiles?: {
    display_name?: string;
  };
}

interface RecipeDetailProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecipeDetail({ recipe, open, onOpenChange }: RecipeDetailProps) {
  if (!recipe) return null;

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl pr-8">
            {recipe.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {recipe.image_url && (
            <div className="aspect-video rounded-xl overflow-hidden">
              <img
                src={recipe.image_url}
                alt={recipe.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {recipe.description && (
            <p className="text-muted-foreground">{recipe.description}</p>
          )}

          <div className="flex flex-wrap gap-3">
            {totalTime > 0 && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Clock className="h-3.5 w-3.5" />
                {totalTime} minutes total
              </Badge>
            )}
            {recipe.servings && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Users className="h-3.5 w-3.5" />
                {recipe.servings} servings
              </Badge>
            )}
            {recipe.profiles?.display_name && (
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                <ChefHat className="h-3.5 w-3.5" />
                {recipe.profiles.display_name}
              </Badge>
            )}
          </div>

          {recipe.prep_time || recipe.cook_time ? (
            <div className="grid grid-cols-2 gap-4">
              {recipe.prep_time && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Prep Time</p>
                  <p className="font-display text-xl font-semibold">{recipe.prep_time} min</p>
                </div>
              )}
              {recipe.cook_time && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Cook Time</p>
                  <p className="font-display text-xl font-semibold">{recipe.cook_time} min</p>
                </div>
              )}
            </div>
          ) : null}

          {recipe.ingredients.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">Ingredients</h3>
              <ul className="space-y-2">
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <span>{ingredient}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.instructions.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">Instructions</h3>
              <ol className="space-y-4">
                {recipe.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                      {index + 1}
                    </span>
                    <p className="pt-1">{instruction}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
