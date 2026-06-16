import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, Loader2, X, Mic, MicOff, Check, Edit3, ImagePlus, MessageSquareText, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useVoiceRecipe } from "@/hooks/useVoiceRecipe";
import { useLanguage } from "@/i18n/LanguageContext";
import { RECIPE_CATEGORIES, RecipeCategory } from "@/i18n/translations";
import { VisibilitySelector } from "@/components/VisibilitySelector";
import { SortableList } from "@/components/SortableList";
import { RecipeImageManager, ImageItem } from "@/components/RecipeImageManager";

interface AddRecipeDialogProps {
  onRecipeAdded?: () => void;
}

export function AddRecipeDialog({ onRecipeAdded }: AddRecipeDialogProps) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { isRecording, isTranscribing, isRefining, transcript, startRecording, stopRecording, refineTranscription, clearTranscription, error: voiceError } = useVoiceRecipe();
  const [editedTranscription, setEditedTranscription] = useState("");
  const [showTranscriptPreview, setShowTranscriptPreview] = useState(false);
  const [aiInputMode, setAiInputMode] = useState<"voice" | "text" | "photo">("voice");
  const [aiPromptText, setAiPromptText] = useState("");
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState<string[]>([""]);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [category, setCategory] = useState<RecipeCategory | "">("");
  const [recipeImages, setRecipeImages] = useState<ImageItem[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [visibility, setVisibility] = useState("group");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  // rating removed - now handled via recipe_ratings table

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIngredients([""]);
    setInstructions([""]);
    setPrepTime("");
    setCookTime("");
    setServings("");
    setCategory("");
    setRecipeImages([]);
    setEditedTranscription("");
    setShowTranscriptPreview(false);
    setAiPromptText("");
    setAiInputMode("voice");
    setPhotoPreview(null);
    setVisibility("group");
    setSelectedGroupIds([]);
    // rating reset removed
    clearTranscription();
  };

  const uploadImages = async (userId: string, recipeId: string): Promise<string | null> => {
    if (recipeImages.length === 0) return null;
    
    setIsUploadingImage(true);
    let mainImageUrl: string | null = null;
    
    try {
      for (let i = 0; i < recipeImages.length; i++) {
        const img = recipeImages[i];
        if (!img.file) continue;
        
        const fileExt = img.file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}_${i}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('recipe-images')
          .upload(fileName, img.file);

        if (uploadError) {
          console.error("Image upload error:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('recipe-images')
          .getPublicUrl(fileName);

        if (i === 0) {
          mainImageUrl = publicUrl;
        }

        // Save to recipe_images table
        await supabase.from("recipe_images").insert({
          recipe_id: recipeId,
          image_url: publicUrl,
          caption: img.caption || null,
          sort_order: i,
        });
      }
      
      return mainImageUrl;
    } catch (error) {
      console.error("Image upload error:", error);
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!title.trim()) {
      toast.error(t("message.enterTitle"));
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-recipe", {
        body: { title, ingredients: ingredients.filter(i => i.trim()) },
      });

      if (error) {
        console.error("AI generation error:", error);
        if (error.message?.includes("429")) {
          toast.error(t("message.aiBusy"));
        } else if (error.message?.includes("402")) {
          toast.error(t("message.aiCreditsExhausted"));
        } else {
          toast.error(t("message.failedToGenerate"));
        }
        return;
      }

      if (data) {
        if (data.description) setDescription(data.description);
        if (data.ingredients?.length) setIngredients(data.ingredients);
        if (data.instructions?.length) setInstructions(data.instructions);
        if (data.prepTime) setPrepTime(data.prepTime.toString());
        if (data.cookTime) setCookTime(data.cookTime.toString());
        if (data.servings) setServings(data.servings.toString());
        if (data.category) {
          setCategory(data.category as RecipeCategory);
        }
        toast.success(t("message.recipeGenerated"));
      }
    } catch (error) {
      console.error("AI generation error:", error);
      toast.error(t("message.failedToGenerate"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text?.trim()) {
        setEditedTranscription(text);
        setShowTranscriptPreview(true);
      }
    } else {
      startRecording();
      setShowTranscriptPreview(false);
    }
  };

  const handleRefineTranscription = async () => {
    if (!editedTranscription.trim()) return;
    
    const recipe = await refineTranscription(editedTranscription);
    if (recipe) {
      if (recipe.title) setTitle(recipe.title);
      if (recipe.description) setDescription(recipe.description);
      if (recipe.ingredients?.length) setIngredients(recipe.ingredients);
      if (recipe.instructions?.length) setInstructions(recipe.instructions);
      if (recipe.prepTime) setPrepTime(recipe.prepTime.toString());
      if (recipe.cookTime) setCookTime(recipe.cookTime.toString());
      if (recipe.servings) setServings(recipe.servings.toString());
      if (recipe.category) {
        setCategory(recipe.category as RecipeCategory);
      }
      setEditedTranscription("");
      setShowTranscriptPreview(false);
    }
  };

  const handleCancelTranscription = () => {
    setEditedTranscription("");
    setShowTranscriptPreview(false);
    clearTranscription();
  };

  const handleAiPromptParse = async () => {
    if (!aiPromptText.trim()) return;
    const recipe = await refineTranscription(aiPromptText);
    if (recipe) {
      if (recipe.title) setTitle(recipe.title);
      if (recipe.description) setDescription(recipe.description);
      if (recipe.ingredients?.length) setIngredients(recipe.ingredients);
      if (recipe.instructions?.length) setInstructions(recipe.instructions);
      if (recipe.prepTime) setPrepTime(recipe.prepTime.toString());
      if (recipe.cookTime) setCookTime(recipe.cookTime.toString());
      if (recipe.servings) setServings(recipe.servings.toString());
      if (recipe.category) {
        setCategory(recipe.category as RecipeCategory);
      }
      setAiPromptText("");
    }
  };

  const handlePhotoParse = async (file: File) => {
    setIsParsingImage(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("parse-recipe-image", {
        body: { imageBase64: base64, mimeType: file.type || "image/jpeg" },
      });

      if (error) {
        console.error("Image parse error:", error);
        if (error.message?.includes("429")) {
          toast.error(t("message.aiBusy"));
        } else if (error.message?.includes("402")) {
          toast.error(t("message.aiCreditsExhausted"));
        } else {
          toast.error(t("addRecipe.imageParseError"));
        }
        return;
      }

      if (data) {
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        if (data.ingredients?.length) setIngredients(data.ingredients);
        if (data.instructions?.length) setInstructions(data.instructions);
        if (data.prepTime) setPrepTime(data.prepTime.toString());
        if (data.cookTime) setCookTime(data.cookTime.toString());
        if (data.servings) setServings(data.servings.toString());
        if (data.category) setCategory(data.category as RecipeCategory);
        toast.success(t("addRecipe.imageParsed"));
      }
    } catch (error) {
      console.error("Image parse error:", error);
      toast.error(t("addRecipe.imageParseError"));
    } finally {
      setIsParsingImage(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t("message.enterTitle"));
      return;
    }

    if (!user) {
      toast.error(t("message.mustBeSignedIn"));
      return;
    }

    setIsSaving(true);
    try {
      // First create recipe without image
      const { data: recipeData, error } = await supabase.from("recipes").insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        ingredients: ingredients.filter(i => i.trim()),
        instructions: instructions.filter(i => i.trim()),
        prep_time: prepTime ? parseInt(prepTime) : null,
        cook_time: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
        category: category || null,
        image_url: null,
        visibility,
      }).select().single();

      if (error) {
        console.error("Save error:", error);
        toast.error(t("message.failedToSave"));
        return;
      }

      // Upload images and set main image
      if (recipeData && recipeImages.length > 0) {
        const mainImageUrl = await uploadImages(user.id, recipeData.id);
        if (mainImageUrl) {
          await supabase.from("recipes").update({ image_url: mainImageUrl }).eq("id", recipeData.id);
        }
      }

      // If visibility is 'group', create group shares and notify members
      if (visibility === "group" && selectedGroupIds.length > 0 && recipeData) {
        const shares = selectedGroupIds.map((groupId) => ({
          recipe_id: recipeData.id,
          group_id: groupId,
        }));
        await supabase.from("recipe_group_shares").insert(shares);

        // Notify all group members except the creator
        const { data: members } = await supabase
          .from("group_members")
          .select("user_id")
          .in("group_id", selectedGroupIds)
          .neq("user_id", user.id);

        if (members && members.length > 0) {
          const uniqueMembers = [...new Set(members.map(m => m.user_id))];
          await supabase.from("notifications").insert(
            uniqueMembers.map(memberId => ({
              user_id: memberId,
              actor_id: user.id,
              type: "new_recipe",
              recipe_id: recipeData.id,
            }))
          );
        }
      }

      toast.success(t("message.recipeSaved"));
      resetForm();
      setOpen(false);
      onRecipeAdded?.();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(t("message.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  const addIngredient = () => setIngredients([...ingredients, ""]);
  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };
  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const addInstruction = () => setInstructions([...instructions, ""]);
  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
    }
  };
  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t("recipe.addRecipe")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{t("addRecipe.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transcription Preview */}
          {showTranscriptPreview && !isRecording && !isTranscribing && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-foreground">{t("addRecipe.reviewTranscription")}</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {t("addRecipe.editHint")}
              </p>
              <Textarea
                value={editedTranscription}
                onChange={(e) => setEditedTranscription(e.target.value)}
                placeholder="Your transcribed recipe..."
                rows={4}
                className="mb-3"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleRefineTranscription}
                  disabled={isRefining || !editedTranscription.trim()}
                  className="gap-2"
                >
                  {isRefining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {t("addRecipe.createRecipe")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelTranscription}
                  disabled={isRefining}
                >
                  {t("addRecipe.cancel")}
                </Button>
              </div>
            </div>
          )}

          {/* AI Input Mode Tabs */}
          {!showTranscriptPreview && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={aiInputMode === "voice" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAiInputMode("voice")}
                  className="gap-1 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <Mic className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("addRecipe.voiceInput")}</span>
                </Button>
                <Button
                  type="button"
                  variant={aiInputMode === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAiInputMode("text")}
                  className="gap-1 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <MessageSquareText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("addRecipe.aiPrompt")}</span>
                </Button>
                <Button
                  type="button"
                  variant={aiInputMode === "photo" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAiInputMode("photo")}
                  className="gap-1 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("addRecipe.photoInput")}</span>
                </Button>
              </div>

              {aiInputMode === "voice" ? (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-foreground">{t("addRecipe.voiceInput")}</h3>
                      <p className="text-xs text-muted-foreground">
                        {isRecording 
                          ? t("addRecipe.listening")
                          : isTranscribing
                          ? t("addRecipe.transcribing") || "Transcribing..."
                          : t("addRecipe.dictateHint")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={isRecording ? "destructive" : "outline"}
                        size="lg"
                        onClick={handleVoiceToggle}
                        disabled={isTranscribing || isGenerating || isSaving}
                        className="gap-2"
                      >
                        {isTranscribing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isRecording ? (
                          <MicOff className="h-5 w-5" />
                        ) : (
                          <Mic className="h-5 w-5" />
                        )}
                        {isTranscribing ? (t("addRecipe.transcribing") || "Transcribing...") : isRecording ? t("addRecipe.stop") : t("addRecipe.record")}
                      </Button>
                    </div>
                  </div>
                  
                  {isRecording && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                        </span>
                        <span className="text-sm text-destructive font-medium">{t("addRecipe.listening")}</span>
                      </div>
                      <div className="p-3 rounded bg-background border text-sm min-h-[60px]">
                        <span className="text-muted-foreground italic">{t("addRecipe.startSpeaking")}</span>
                      </div>
                    </>
                  )}

                  {voiceError && (
                    <p className="text-xs text-destructive mt-2">{voiceError}</p>
                  )}
                </div>
              ) : aiInputMode === "text" ? (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="mb-3">
                    <h3 className="font-medium text-foreground">{t("addRecipe.aiPrompt")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("addRecipe.aiPromptHint")}
                    </p>
                  </div>
                  <Textarea
                    value={aiPromptText}
                    onChange={(e) => setAiPromptText(e.target.value)}
                    placeholder={t("addRecipe.aiPromptPlaceholder")}
                    rows={5}
                    className="mb-3"
                  />
                  <Button
                    type="button"
                    onClick={handleAiPromptParse}
                    disabled={isRefining || !aiPromptText.trim()}
                    className="gap-2"
                  >
                    {isRefining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {t("addRecipe.parseRecipe")}
                  </Button>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="mb-3">
                    <h3 className="font-medium text-foreground">{t("addRecipe.photoInput")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("addRecipe.photoHint")}
                    </p>
                  </div>

                  {photoPreview && (
                    <div className="relative mb-3 rounded-lg overflow-hidden">
                      <img src={photoPreview} alt="Recipe" className="w-full max-h-48 object-cover rounded-lg" />
                      {isParsingImage && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                          <div className="flex items-center gap-2 text-white">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm font-medium">{t("addRecipe.parsingImage")}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isParsingImage && (
                    <div className={`flex gap-2 ${!photoPreview ? "flex-col" : ""}`}>
                      <Button
                        type="button"
                        variant="outline"
                        className={`flex-1 border-dashed gap-2 ${!photoPreview ? "h-16" : "h-10"}`}
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.setAttribute("capture", "environment");
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handlePhotoParse(file);
                          };
                          input.click();
                        }}
                      >
                        <Camera className="h-5 w-5" />
                        {t("addRecipe.takePhoto")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`flex-1 border-dashed gap-2 ${!photoPreview ? "h-16" : "h-10"}`}
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handlePhotoParse(file);
                          };
                          input.click();
                        }}
                      >
                        <ImagePlus className="h-5 w-5" />
                        {t("addRecipe.chooseFromLibrary")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t("addRecipe.orEnterManually")}</span>
            </div>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label>{t("addRecipe.imageLabel")}</Label>
            <RecipeImageManager images={recipeImages} onChange={setRecipeImages} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t("addRecipe.recipeTitle")}</Label>
            <Input
              id="title"
              placeholder={t("addRecipe.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("addRecipe.description")}</Label>
            <Textarea
              id="description"
              placeholder={t("addRecipe.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t("addRecipe.categoryLabel")}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as RecipeCategory)}>
              <SelectTrigger>
                <SelectValue placeholder={t("addRecipe.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {RECIPE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {language === "en" ? t(`category.${cat}` as any) : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Visibility */}
          <VisibilitySelector
            visibility={visibility}
            onVisibilityChange={setVisibility}
            selectedGroupIds={selectedGroupIds}
            onGroupsChange={setSelectedGroupIds}
          />

          {/* Rating is now set after saving via the recipe detail view */}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prepTime">{t("addRecipe.prepTimeLabel")}</Label>
              <Input
                id="prepTime"
                type="number"
                placeholder="15"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookTime">{t("addRecipe.cookTimeLabel")}</Label>
              <Input
                id="cookTime"
                type="number"
                placeholder="30"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servings">{t("addRecipe.servingsLabel")}</Label>
              <Input
                id="servings"
                type="number"
                placeholder="4"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t("addRecipe.ingredientsLabel")}</Label>
            <SortableList
              items={ingredients}
              onReorder={setIngredients}
              renderItem={(ingredient, index) => {
                const isSection = ingredient.startsWith("## ");
                return (
                  <div className="flex gap-2">
                    {isSection ? (
                      <Input
                        placeholder={t("addRecipe.sectionPlaceholder")}
                        value={ingredient.slice(3)}
                        onChange={(e) => updateIngredient(index, `## ${e.target.value}`)}
                        className="font-semibold bg-secondary/50"
                      />
                    ) : (
                      <Input
                        placeholder={`${t("addRecipe.ingredientPlaceholder")} ${index + 1}`}
                        value={ingredient}
                        onChange={(e) => updateIngredient(index, e.target.value)}
                      />
                    )}
                    {ingredients.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeIngredient(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addRecipe.addIngredient")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setIngredients([...ingredients, "## "])}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addRecipe.addSection")}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t("addRecipe.instructionsLabel")}</Label>
            <SortableList
              items={instructions}
              onReorder={setInstructions}
              renderItem={(instruction, index) => {
                const isSection = instruction.startsWith("## ");
                const stepNum = instructions.slice(0, index).filter(i => !i.startsWith("## ")).length + 1;
                return (
                  <div className="flex gap-2">
                    {isSection ? (
                      <Input
                        placeholder={t("addRecipe.sectionPlaceholder")}
                        value={instruction.slice(3)}
                        onChange={(e) => updateInstruction(index, `## ${e.target.value}`)}
                        className="font-semibold bg-secondary/50"
                      />
                    ) : (
                      <>
                        <div className="flex items-center justify-center w-8 h-10 rounded-lg bg-primary/10 text-primary font-medium shrink-0">
                          {stepNum}
                        </div>
                        <Textarea
                          placeholder={`${t("addRecipe.stepPlaceholder")} ${stepNum}`}
                          value={instruction}
                          onChange={(e) => updateInstruction(index, e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                      </>
                    )}
                    {instructions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInstruction(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addRecipe.addStep")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInstructions([...instructions, "## "])}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addRecipe.addSection")}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("addRecipe.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isUploadingImage || !title.trim()}>
              {(isSaving || isUploadingImage) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("addRecipe.saveRecipe")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
