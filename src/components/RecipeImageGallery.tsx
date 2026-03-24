import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface GalleryImage {
  id: string;
  image_url: string;
  caption?: string | null;
  sort_order: number;
}

interface RecipeImageGalleryProps {
  mainImage?: string | null;
  additionalImages: GalleryImage[];
}

export function RecipeImageGallery({ mainImage, additionalImages }: RecipeImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allImages: { url: string; caption?: string | null }[] = [];
  if (mainImage) {
    allImages.push({ url: mainImage, caption: null });
  }
  additionalImages
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((img) => allImages.push({ url: img.image_url, caption: img.caption }));

  if (allImages.length === 0) return null;

  const showLightbox = lightboxIndex !== null;
  const currentImage = showLightbox ? allImages[lightboxIndex] : null;

  return (
    <>
      {/* Main display */}
      {allImages.length === 1 ? (
        <div
          className="aspect-video rounded-xl overflow-hidden cursor-pointer"
          onClick={() => setLightboxIndex(0)}
        >
          <img src={allImages[0].url} alt={allImages[0].caption || ""} className="w-full h-full object-cover" />
          {allImages[0].caption && (
            <p className="text-xs text-muted-foreground mt-1 italic">{allImages[0].caption}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="aspect-video rounded-xl overflow-hidden cursor-pointer"
            onClick={() => setLightboxIndex(0)}
          >
            <img src={allImages[0].url} alt={allImages[0].caption || ""} className="w-full h-full object-cover" />
          </div>
          {allImages[0].caption && (
            <p className="text-xs text-muted-foreground italic">{allImages[0].caption}</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {allImages.slice(1).map((img, i) => (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden cursor-pointer aspect-square group"
                onClick={() => setLightboxIndex(i + 1)}
              >
                <img src={img.url} alt={img.caption || ""} className="w-full h-full object-cover" />
                {img.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{img.caption}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && currentImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          {allImages.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((lightboxIndex - 1 + allImages.length) % allImages.length);
                }}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((lightboxIndex + 1) % allImages.length);
                }}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentImage.url}
              alt={currentImage.caption || ""}
              className="max-w-full max-h-[75vh] object-contain rounded-lg"
            />
            {currentImage.caption && (
              <p className="text-white text-sm mt-3 text-center">{currentImage.caption}</p>
            )}
            <p className="text-white/50 text-xs mt-1">
              {lightboxIndex + 1} / {allImages.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
