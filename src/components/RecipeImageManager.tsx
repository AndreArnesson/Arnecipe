import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, X, GripVertical } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export interface ImageItem {
  id?: string;
  file?: File;
  preview: string;
  caption: string;
  image_url?: string;
}

interface RecipeImageManagerProps {
  images: ImageItem[];
  onChange: (images: ImageItem[]) => void;
}

export function RecipeImageManager({ images, onChange }: RecipeImageManagerProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages: ImageItem[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      caption: "",
    }));
    onChange([...images, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
  };

  const updateCaption = (index: number, caption: string) => {
    const updated = images.map((img, i) => (i === index ? { ...img, caption } : img));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesSelect}
        className="hidden"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((img, index) => (
            <div key={index} className="relative group rounded-lg border overflow-hidden bg-secondary/30">
              <img
                src={img.preview}
                alt={img.caption || `Image ${index + 1}`}
                className="w-full h-32 object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(index)}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="p-2">
                <Input
                  placeholder={t("addRecipe.imageCaptionPlaceholder")}
                  value={img.caption}
                  onChange={(e) => updateCaption(index, e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        className={`w-full border-dashed gap-2 ${images.length === 0 ? "h-32" : "h-10"}`}
      >
        <ImagePlus className="h-5 w-5" />
        {images.length === 0 ? t("addRecipe.uploadImage") : t("addRecipe.addMoreImages")}
      </Button>
    </div>
  );
}
