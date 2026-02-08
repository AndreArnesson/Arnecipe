import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageContext";
import { RECIPE_CATEGORIES, RecipeCategory } from "@/i18n/translations";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface CategoryFilterProps {
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  const { t, language } = useLanguage();

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 pb-2">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => onCategoryChange(null)}
          className="shrink-0"
        >
          {t("recipe.allCategories")}
        </Button>
        {RECIPE_CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => onCategoryChange(cat)}
            className="shrink-0"
          >
            {language === "en" ? t(`category.${cat}` as any) : cat}
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
