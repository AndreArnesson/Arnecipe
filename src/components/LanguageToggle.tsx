import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLanguage(language === "sv" ? "en" : "sv")}
      className="gap-1.5"
    >
      <Globe className="h-4 w-4" />
      {language === "sv" ? "🇸🇪" : "🇺🇸"}
    </Button>
  );
}
