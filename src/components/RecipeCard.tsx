import { Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/i18n/LanguageContext";
import { RecipeCategory } from "@/i18n/translations";

interface RecipeCardProps {
  id: string;
  title: string;
  description?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  imageUrl?: string;
  category?: string | null;
  creatorName?: string;
  onClick?: () => void;
}

export function RecipeCard({
  title,
  description,
  prepTime,
  cookTime,
  servings,
  imageUrl,
  category,
  creatorName,
  onClick,
}: RecipeCardProps) {
  const { t, language } = useLanguage();
  const totalTime = (prepTime || 0) + (cookTime || 0);

  return (
    <Card
      className="recipe-card cursor-pointer group"
      onClick={onClick}
    >
      <div className="aspect-[4/3] relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-sage-light to-secondary flex items-center justify-center">
            <span className="font-display text-4xl text-secondary-foreground/30">
              {title.charAt(0)}
            </span>
          </div>
        )}
        {category && (
          <Badge className="absolute top-2 right-2 bg-background/90 text-foreground backdrop-blur-sm">
            {language === "en" ? t(`category.${category}` as any) : category}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-display text-lg font-semibold text-foreground mb-2 line-clamp-1">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalTime > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{totalTime} {t("recipe.minutes")}</span>
            </div>
          )}
          {servings && (
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{servings} {t("recipe.servings")}</span>
            </div>
          )}
        </div>
        {creatorName && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {t("recipe.createdBy")} {creatorName}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
