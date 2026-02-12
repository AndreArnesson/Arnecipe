import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, Loader2, X, Mic, MicOff, Check, Edit3, Globe, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useVoiceRecipe } from "@/hooks/useVoiceRecipe";
import { useLanguage } from "@/i18n/LanguageContext";
import { RECIPE_CATEGORIES, RecipeCategory } from "@/i18n/translations";
import { VisibilitySelector } from "@/components/VisibilitySelector";

interface AddRecipeDialogProps {
  onRecipeAdded?: () => void;
}

export function AddRecipeDialog({ onRecipeAdded }: AddRecipeDialogProps) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { isListening, isRefining, transcript, interimTranscript, isSupported, language: voiceLang, setLanguage: setVoiceLang, startListening, stopListening, refineTranscription, clearTranscription } = useVoiceRecipe();
  const [editedTranscription, setEditedTranscription] = useState("");
  const [showTranscriptPreview, setShowTranscriptPreview] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState<string[]>([""]);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [category, setCategory] = useState<RecipeCategory | "">("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState("group");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [rating, setRating] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIngredients([""]);
    setInstructions([""]);
    setPrepTime("");
    setCookTime("");
    setServings("");
    setCategory("");
    setImageFile(null);
    setImagePreview(null);
    setEditedTranscription("");
    setShowTranscriptPreview(false);
    setVisibility("group");
    setSelectedGroupIds([]);
    setRating("");
    clearTranscription();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (userId: string): Promise<string | null> => {
    if (!imageFile) return null;
    
    setIsUploadingImage(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('recipe-images')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error("Image upload error:", uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('recipe-images')
        .getPublicUrl(fileName);

      return publicUrl;
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

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) {
        setEditedTranscription(transcript);
        setShowTranscriptPreview(true);
      }
    } else {
      startListening();
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
      const imageUrl = await uploadImage(user.id);
      
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
        image_url: imageUrl,
        visibility,
        rating: rating.trim() || null,
      }).select().single();

      if (error) {
        console.error("Save error:", error);
        toast.error(t("message.failedToSave"));
        return;
      }

      // If visibility is 'group', create group shares
      if (visibility === "group" && selectedGroupIds.length > 0 && recipeData) {
        const shares = selectedGroupIds.map((groupId) => ({
          recipe_id: recipeData.id,
          group_id: groupId,
        }));
        await supabase.from("recipe_group_shares").insert(shares);
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
          {showTranscriptPreview && !isListening && (
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

          {/* Voice Input Section */}
          {!showTranscriptPreview && (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-foreground">{t("addRecipe.voiceInput")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {isListening 
                      ? t("addRecipe.listening")
                      : t("addRecipe.dictateHint")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVoiceLang(voiceLang === "sv-SE" ? "en-US" : "sv-SE")}
                    disabled={isListening}
                    className="gap-1 text-xs"
                  >
                    <Globe className="h-3 w-3" />
                    {voiceLang === "sv-SE" ? "🇸🇪 SV" : "🇺🇸 EN"}
                  </Button>
                  <Button
                    type="button"
                    variant={isListening ? "destructive" : "outline"}
                    size="lg"
                    onClick={handleVoiceToggle}
                    disabled={!isSupported || isGenerating || isSaving}
                    className="gap-2"
                  >
                    {isListening ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                    {isListening ? t("addRecipe.stop") : t("addRecipe.record")}
                  </Button>
                </div>
              </div>
              
              {!isSupported && (
                <p className="text-xs text-destructive">
                  {t("addRecipe.speechNotSupported")}
                </p>
              )}
              
              {isListening && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                    </span>
                    <span className="text-sm text-destructive font-medium">Listening...</span>
                  </div>
                  <div className="p-3 rounded bg-background border text-sm min-h-[60px]">
                    {transcript && <span>{transcript} </span>}
                    {interimTranscript && <span className="text-muted-foreground">{interimTranscript}</span>}
                    {!transcript && !interimTranscript && (
                      <span className="text-muted-foreground italic">{t("addRecipe.startSpeaking")}</span>
                    )}
                  </div>
                </>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Recipe preview"
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2"
                >
                  {t("addRecipe.changeImage")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-dashed gap-2"
              >
                <ImagePlus className="h-5 w-5" />
                {t("addRecipe.uploadImage")}
              </Button>
            )}
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

          {/* Rating */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">{t("recipe.rating")}</Label>
            <Input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder={t("recipe.ratingPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
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
            {ingredients.map((ingredient, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`${t("addRecipe.ingredientPlaceholder")} ${index + 1}`}
                  value={ingredient}
                  onChange={(e) => updateIngredient(index, e.target.value)}
                />
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
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
              <Plus className="h-4 w-4 mr-1" />
              {t("addRecipe.addIngredient")}
            </Button>
          </div>

          <div className="space-y-3">
            <Label>{t("addRecipe.instructionsLabel")}</Label>
            {instructions.map((instruction, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex items-center justify-center w-8 h-10 rounded-lg bg-primary/10 text-primary font-medium shrink-0">
                  {index + 1}
                </div>
                <Textarea
                  placeholder={`${t("addRecipe.stepPlaceholder")} ${index + 1}`}
                  value={instruction}
                  onChange={(e) => updateInstruction(index, e.target.value)}
                  rows={2}
                  className="flex-1"
                />
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
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
              <Plus className="h-4 w-4 mr-1" />
              {t("addRecipe.addStep")}
            </Button>
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
