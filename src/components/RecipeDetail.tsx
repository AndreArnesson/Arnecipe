import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users, ChefHat, Tag, Pencil, Trash2, Loader2, X, Plus, Lock, Globe, Star, ArrowRightLeft, Share2, Play, Square, Minimize2, Maximize2 } from "lucide-react";
import { StarRating } from "@/components/StarRating";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WakeLockButton } from "@/components/WakeLockButton";
import { SortableList } from "@/components/SortableList";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { RECIPE_CATEGORIES, RecipeCategory } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VisibilitySelector } from "@/components/VisibilitySelector";
import { LinkifyText } from "@/components/LinkifyText";
import { CommentSection } from "@/components/CommentSection";
import { RecipeImageGallery } from "@/components/RecipeImageGallery";
import { RecipeImageManager, ImageItem } from "@/components/RecipeImageManager";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

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
  // rating removed from recipe - now in recipe_ratings table
  created_at: string;
  user_id: string;
  profiles?: {
    display_name?: string;
  };
}

interface RecipeDetailProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecipeUpdated?: () => void;
}

export function RecipeDetail({ recipe, open, onOpenChange, onRecipeUpdated }: RecipeDetailProps) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ user_id: string; display_name: string }[]>([]);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIngredients, setEditIngredients] = useState<string[]>([]);
  const [editInstructions, setEditInstructions] = useState<string[]>([]);
  const [editPrepTime, setEditPrepTime] = useState("");
  const [editCookTime, setEditCookTime] = useState("");
  const [editServings, setEditServings] = useState("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editRating, setEditRating] = useState("");
  const [userRating, setUserRating] = useState<number>(0);
  const [avgRating, setAvgRating] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [editImages, setEditImages] = useState<ImageItem[]>([]);
  const [existingImages, setExistingImages] = useState<{ id: string; image_url: string; caption: string | null; sort_order: number }[]>([]);
  const [additionalImages, setAdditionalImages] = useState<{ id: string; image_url: string; caption: string | null; sort_order: number }[]>([]);
  const [editVisibility, setEditVisibility] = useState("group");
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);

  // Cooking mode state
  const [isCooking, setIsCooking] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [enrichedInstructions, setEnrichedInstructions] = useState<string[] | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedRecipeId, setEnrichedRecipeId] = useState<string | null>(null);

  // Reset all cooking state when recipe changes
  useEffect(() => {
    setIsCooking(false);
    setIsCompact(false);
    setIngredientsOpen(false);
    setCheckedIngredients(new Set());
    setCheckedSteps(new Set());
    setEnrichedInstructions(null);
    setIsEnriching(false);
    setEnrichedRecipeId(null);
  }, [recipe?.id]);

  const toggleIngredient = (index: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const toggleStep = (index: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const fetchEnrichedInstructions = useCallback(async (r: Recipe) => {
    if (enrichedRecipeId === r.id && enrichedInstructions) return;
    setIsEnriching(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-instructions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            ingredients: r.ingredients,
            instructions: r.instructions,
            language,
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to enrich");
      }
      const data = await response.json();
      if (data.enrichedInstructions?.length) {
        setEnrichedInstructions(data.enrichedInstructions);
        setEnrichedRecipeId(r.id);
      }
    } catch (err) {
      console.error("Enrich error:", err);
      toast.error(t("recipe.enrichFailed"));
    } finally {
      setIsEnriching(false);
    }
  }, [enrichedRecipeId, enrichedInstructions, language, t]);

  const startCooking = () => {
    setCheckedIngredients(new Set());
    setCheckedSteps(new Set());
    setIsCooking(true);
  };

  const stopCooking = () => {
    setIsCooking(false);
    setIsCompact(false);
  };

  const toggleCompact = useCallback(() => {
    if (!isCompact && recipe) {
      fetchEnrichedInstructions(recipe);
    }
    setIsCompact(prev => !prev);
  }, [isCompact, recipe, fetchEnrichedInstructions]);

  // Calculate cooking progress
  const ingredientCount = recipe ? recipe.ingredients.filter(i => !i.startsWith("## ")).length : 0;
  const instructionCount = recipe ? recipe.instructions.length : 0;
  const cookingTotalItems = isCompact && enrichedInstructions ? instructionCount : (ingredientCount + instructionCount);
  const cookingCheckedItems = isCompact && enrichedInstructions ? checkedSteps.size : (checkedIngredients.size + checkedSteps.size);
  const cookingProgress = cookingTotalItems > 0 ? Math.round((cookingCheckedItems / cookingTotalItems) * 100) : 0;

  // Fetch ratings for current recipe
  const fetchRatings = async (recipeId: string) => {
    if (!user) return;
    setIsLoadingRatings(true);
    try {
      const { data: allRatings } = await supabase
        .from("recipe_ratings")
        .select("rating, user_id")
        .eq("recipe_id", recipeId);
      
      if (allRatings && allRatings.length > 0) {
        const sum = allRatings.reduce((acc, r) => acc + Number(r.rating), 0);
        setAvgRating(sum / allRatings.length);
        setRatingCount(allRatings.length);
        const mine = allRatings.find(r => r.user_id === user.id);
        setUserRating(mine ? Number(mine.rating) : 0);
      } else {
        setAvgRating(0);
        setRatingCount(0);
        setUserRating(0);
      }
    } finally {
      setIsLoadingRatings(false);
    }
  };

  // Load ratings and additional images when recipe changes
  const fetchAdditionalImages = useCallback(async (recipeId: string) => {
    const { data } = await supabase
      .from("recipe_images")
      .select("id, image_url, caption, sort_order")
      .eq("recipe_id", recipeId)
      .order("sort_order");
    setAdditionalImages(data || []);
  }, []);

  useEffect(() => {
    if (recipe && open) {
      fetchRatings(recipe.id);
      fetchAdditionalImages(recipe.id);
    }
  }, [recipe?.id, open]);

  const handleUserRating = async (value: number) => {
    if (!user || !recipe) return;
    if (value === 0) {
      // Remove rating
      await supabase
        .from("recipe_ratings")
        .delete()
        .eq("recipe_id", recipe.id)
        .eq("user_id", user.id);
      toast.success(t("recipe.ratingRemoved"));
    } else {
      // Upsert rating
      const { error } = await supabase
        .from("recipe_ratings")
        .upsert(
          { recipe_id: recipe.id, user_id: user.id, rating: value },
          { onConflict: "recipe_id,user_id" }
        );
      if (error) {
        console.error("Rating error:", error);
        return;
      }
      toast.success(t("recipe.ratingSubmitted"));
    }
    setUserRating(value);
    fetchRatings(recipe.id);
    onRecipeUpdated?.();
  };

  const handleShareRecipe = async () => {
    if (!recipe || !user) return;
    try {
      // Check for existing share
      const { data: existing } = await supabase
        .from("recipe_shares")
        .select("share_token")
        .eq("recipe_id", recipe.id)
        .eq("created_by", user.id)
        .maybeSingle();

      let token = existing?.share_token;
      if (!token) {
        const { data: newShare, error } = await supabase
          .from("recipe_shares")
          .insert({ recipe_id: recipe.id, created_by: user.id })
          .select("share_token")
          .single();
        if (error) { toast.error(t("recipe.failedToShare")); return; }
        token = newShare.share_token;
        toast.success(t("recipe.shareCreated"));
      } else {
        toast.success(t("recipe.linkCopied"));
      }

      const url = `${window.location.origin}/shared/${token}`;
      await navigator.clipboard.writeText(url);
    } catch {
      toast.error(t("recipe.failedToShare"));
    }
  };

  if (!recipe) return null;

  // Fetch group members for ownership transfer
  const fetchGroupMembers = async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
    if (!memberships?.length) return;

    const groupIds = memberships.map(m => m.group_id);
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .in("group_id", groupIds)
      .neq("user_id", user.id);
    if (!members?.length) return;

    const uniqueUserIds = [...new Set(members.map(m => m.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", uniqueUserIds);

    setGroupMembers(
      (profiles || [])
        .filter(p => p.display_name)
        .map(p => ({ user_id: p.user_id, display_name: p.display_name! }))
    );
  };

  const handleTransfer = async () => {
    if (!transferTargetId) return;
    setIsTransferring(true);
    try {
      const { error } = await supabase
        .from("recipes")
        .update({ user_id: transferTargetId })
        .eq("id", recipe.id);
      if (error) {
        toast.error(t("recipe.transferFailed"));
        return;
      }
      toast.success(t("recipe.transferSuccess"));
      setShowTransferConfirm(false);
      setIsEditing(false);
      onOpenChange(false);
      onRecipeUpdated?.();
    } catch {
      toast.error(t("recipe.transferFailed"));
    } finally {
      setIsTransferring(false);
    }
  };

  const isOwner = user?.id === recipe.user_id;
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  const startEditing = () => {
    setEditTitle(recipe.title);
    setEditDescription(recipe.description || "");
    setEditIngredients(recipe.ingredients.length > 0 ? [...recipe.ingredients] : [""]);
    setEditInstructions(recipe.instructions.length > 0 ? [...recipe.instructions] : [""]);
    setEditPrepTime(recipe.prep_time?.toString() || "");
    setEditCookTime(recipe.cook_time?.toString() || "");
    setEditServings(recipe.servings?.toString() || "");
    setEditCategory(recipe.category || "");
    setEditRating("");
    // Load existing images for editing
    const existingEditImages: ImageItem[] = [];
    if (recipe.image_url) {
      existingEditImages.push({ preview: recipe.image_url, caption: "", image_url: recipe.image_url });
    }
    for (const img of additionalImages) {
      existingEditImages.push({ id: img.id, preview: img.image_url, caption: img.caption || "", image_url: img.image_url });
    }
    setEditImages(existingEditImages);
    setEditVisibility(recipe.visibility || "group");
    fetchExistingShares(recipe.id);
    fetchGroupMembers();
    setShowTransferConfirm(false);
    setTransferTargetId("");
    setIsEditing(true);
  };

  const fetchExistingShares = async (recipeId: string) => {
    const { data } = await supabase
      .from("recipe_group_shares")
      .select("group_id")
      .eq("recipe_id", recipeId);
    if (data) {
      setEditGroupIds(data.map((s) => s.group_id));
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setShowDeleteConfirm(false);
  };

  // handleImageSelect removed - using RecipeImageManager now

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      // Delete old additional images
      await supabase.from("recipe_images").delete().eq("recipe_id", recipe.id);

      // Upload new images
      let mainImageUrl: string | null = null;
      for (let i = 0; i < editImages.length; i++) {
        const img = editImages[i];
        let imageUrl = img.image_url;

        // Upload new file if present
        if (img.file && user) {
          const fileExt = img.file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('recipe-images').upload(fileName, img.file);
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('recipe-images').getPublicUrl(fileName);
            imageUrl = publicUrl;
          }
        }

        if (imageUrl) {
          if (i === 0) mainImageUrl = imageUrl;
          await supabase.from("recipe_images").insert({
            recipe_id: recipe.id,
            image_url: imageUrl,
            caption: img.caption || null,
            sort_order: i,
          });
        }
      }

      const { error } = await supabase.from("recipes").update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        ingredients: editIngredients.filter(i => i.trim()),
        instructions: editInstructions.filter(i => i.trim()),
        prep_time: editPrepTime ? parseInt(editPrepTime) : null,
        cook_time: editCookTime ? parseInt(editCookTime) : null,
        servings: editServings ? parseInt(editServings) : null,
        category: editCategory || null,
        image_url: mainImageUrl || (editImages.length === 0 ? null : recipe.image_url),
        visibility: editVisibility,
      }).eq("id", recipe.id);

      if (error) {
        toast.error(t("recipe.failedToUpdate"));
        return;
      }

      // Update group shares
      await supabase
        .from("recipe_group_shares")
        .delete()
        .eq("recipe_id", recipe.id);

      if (editVisibility === "group" && editGroupIds.length > 0) {
        const shares = editGroupIds.map((groupId) => ({
          recipe_id: recipe.id,
          group_id: groupId,
        }));
        await supabase.from("recipe_group_shares").insert(shares);
      }

      toast.success(t("recipe.recipeUpdated"));
      setIsEditing(false);
      onRecipeUpdated?.();
    } catch {
      toast.error(t("recipe.failedToUpdate"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("recipes").delete().eq("id", recipe.id);
      if (error) {
        toast.error(t("recipe.failedToDelete"));
        return;
      }
      toast.success(t("recipe.recipeDeleted"));
      onOpenChange(false);
      onRecipeUpdated?.();
    } catch {
      toast.error(t("recipe.failedToDelete"));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) cancelEditing(); onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="font-display text-xl sm:text-2xl">{t("recipe.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("addRecipe.imageLabel")}</Label>
              <RecipeImageManager images={editImages} onChange={setEditImages} />
            </div>

            <div className="space-y-2">
              <Label>{t("addRecipe.recipeTitle")}</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("addRecipe.description")}</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t("addRecipe.categoryLabel")}</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue placeholder={t("addRecipe.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {RECIPE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {language === "en" ? t(`category.${cat}` as any) : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rating removed from edit - users rate from view mode */}

            <VisibilitySelector
              visibility={editVisibility}
              onVisibilityChange={setEditVisibility}
              selectedGroupIds={editGroupIds}
              onGroupsChange={setEditGroupIds}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("addRecipe.prepTimeLabel")}</Label>
                <Input type="number" value={editPrepTime} onChange={(e) => setEditPrepTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("addRecipe.cookTimeLabel")}</Label>
                <Input type="number" value={editCookTime} onChange={(e) => setEditCookTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("addRecipe.servingsLabel")}</Label>
                <Input type="number" value={editServings} onChange={(e) => setEditServings(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <Label>{t("addRecipe.ingredientsLabel")}</Label>
              <SortableList
                items={editIngredients}
                onReorder={setEditIngredients}
                renderItem={(ing, i) => {
                  const isSection = ing.startsWith("## ");
                  return (
                    <div className="flex gap-2">
                      {isSection ? (
                        <Input
                          value={ing.slice(3)}
                          onChange={(e) => { const n = [...editIngredients]; n[i] = `## ${e.target.value}`; setEditIngredients(n); }}
                          className="font-semibold bg-secondary/50"
                          placeholder={t("addRecipe.sectionPlaceholder")}
                        />
                      ) : (
                        <Input value={ing} onChange={(e) => { const n = [...editIngredients]; n[i] = e.target.value; setEditIngredients(n); }} />
                      )}
                      {editIngredients.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setEditIngredients(editIngredients.filter((_, j) => j !== i))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditIngredients([...editIngredients, ""])}>
                  <Plus className="h-4 w-4 mr-1" />{t("addRecipe.addIngredient")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditIngredients([...editIngredients, "## "])}>
                  <Plus className="h-4 w-4 mr-1" />{t("addRecipe.addSection")}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>{t("addRecipe.instructionsLabel")}</Label>
              <SortableList
                items={editInstructions}
                onReorder={setEditInstructions}
                renderItem={(inst, i) => (
                  <div className="flex gap-2">
                    <div className="flex items-center justify-center w-8 h-10 rounded-lg bg-primary/10 text-primary font-medium shrink-0">{i + 1}</div>
                    <Textarea value={inst} onChange={(e) => { const n = [...editInstructions]; n[i] = e.target.value; setEditInstructions(n); }} rows={2} className="flex-1" />
                    {editInstructions.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditInstructions(editInstructions.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setEditInstructions([...editInstructions, ""])}>
                <Plus className="h-4 w-4 mr-1" />{t("addRecipe.addStep")}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row justify-between pt-4 border-t gap-3">
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}>
                  <Trash2 className="h-4 w-4 mr-2" />{t("recipe.delete")}
                </Button>
                {groupMembers.length > 0 && (
                  <Button variant="outline" onClick={() => setShowTransferConfirm(true)}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />{t("recipe.transferOwnership")}
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={cancelEditing}>{t("recipe.cancelEdit")}</Button>
                <Button onClick={handleSave} disabled={isSaving || !editTitle.trim()}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("recipe.save")}
                </Button>
              </div>
            </div>

            {showTransferConfirm && (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                <p className="text-sm font-medium">{t("recipe.transferTo")}</p>
                <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("recipe.filterByCreator")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupMembers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("recipe.transferConfirm")}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleTransfer} disabled={!transferTargetId || isTransferring}>
                    {isTransferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("recipe.transferOwnership")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowTransferConfirm(false)}>{t("recipe.cancelEdit")}</Button>
                </div>
              </div>
            )}

            {showDeleteConfirm && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm mb-3">{t("recipe.deleteConfirm")}</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("recipe.delete")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t("recipe.cancelEdit")}</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setIsCooking(false); setIsCompact(false); } onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
            <div className="flex flex-col gap-2 pr-8">
            <DialogTitle className="font-display text-xl sm:text-2xl break-words">
              {recipe.title}
            </DialogTitle>
            <div className="flex items-center gap-1 flex-wrap">
              <WakeLockButton />
              {isCooking ? (
                <>
                  <Button variant="outline" size="sm" onClick={stopCooking} className="gap-1.5 text-destructive border-destructive/30">
                    <Square className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("recipe.stopCooking")}</span>
                    <span className="sm:hidden">Stop</span>
                  </Button>
                  <Button
                    variant={isCompact ? "secondary" : "outline"}
                    size="sm"
                    onClick={toggleCompact}
                    className="gap-1.5"
                    title={isCompact ? t("recipe.fullMode") : t("recipe.compactMode")}
                    disabled={isEnriching}
                  >
                    {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isCompact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{isEnriching ? t("recipe.enriching") : isCompact ? t("recipe.fullMode") : t("recipe.compactMode")}</span>
                  </Button>
                </>
              ) : (
                <Button variant="default" size="sm" onClick={startCooking} className="gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("recipe.startCooking")}</span>
                  <span className="sm:hidden">▶</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShareRecipe} title={t("recipe.shareLink")}>
                <Share2 className="h-4 w-4" />
              </Button>
              {isOwner && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditing} title={t("recipe.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cooking progress bar */}
          {isCooking && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{t("recipe.cookingProgress")}</span>
                <span className="text-muted-foreground">{cookingProgress}%</span>
              </div>
              <Progress value={cookingProgress} className="h-2" />
              {cookingProgress === 100 && (
                <p className="text-center text-sm font-medium text-primary animate-in fade-in">{t("recipe.cookingDone")}</p>
              )}
            </div>
          )}

          {/* Non-compact: show full details */}
          {!(isCooking && isCompact) && (
            <>
              <RecipeImageGallery mainImage={recipe.image_url} additionalImages={additionalImages} />

              {recipe.description && (
                <p className="text-muted-foreground">
                  <LinkifyText text={recipe.description} />
                </p>
              )}

              {/* Rating section */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">{t("recipe.yourRating")}</p>
                    <StarRating value={userRating} onChange={handleUserRating} size="md" />
                  </div>
                  <div className="sm:text-right">
                    <p className="text-sm font-medium text-foreground mb-1">{t("recipe.averageRating")}</p>
                    {ratingCount > 0 ? (
                      <StarRating value={avgRating} readonly size="md" showValue count={ratingCount} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("recipe.noRatings")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-3">
                {totalTime > 0 && (
                  <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                    <Clock className="h-3.5 w-3.5" />
                    {totalTime} {t("recipe.totalTime")}
                  </Badge>
                )}
                {recipe.servings && (
                  <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                    <Users className="h-3.5 w-3.5" />
                    {recipe.servings} {t("recipe.servings")}
                  </Badge>
                )}
                {recipe.category && (
                  <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                    <Tag className="h-3.5 w-3.5" />
                    {language === "en" ? t(`category.${recipe.category}` as any) : recipe.category}
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
                      <p className="text-sm text-muted-foreground">{t("recipe.prepTime")}</p>
                      <p className="font-display text-xl font-semibold">{recipe.prep_time} {t("recipe.minutes")}</p>
                    </div>
                  )}
                  {recipe.cook_time && (
                    <div className="bg-secondary/50 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">{t("recipe.cookTime")}</p>
                      <p className="font-display text-xl font-semibold">{recipe.cook_time} {t("recipe.minutes")}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}

          {/* Compact mode: collapsible ingredient list always available for reference */}
          {isCooking && isCompact && recipe.ingredients.length > 0 && (
            <Collapsible open={ingredientsOpen} onOpenChange={setIngredientsOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/60 border border-border hover:bg-secondary/80 transition-colors">
                  <span className="font-display font-semibold text-sm">{t("recipe.ingredients")} ({recipe.ingredients.filter(i => !i.startsWith("## ")).length})</span>
                  <span className="text-xs text-muted-foreground">{ingredientsOpen ? "▲" : "▼"}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ul className="space-y-1.5 pl-1">
                  {recipe.ingredients.map((ingredient, index) => {
                    if (ingredient.startsWith("## ")) {
                      return (
                        <li key={index} className="pt-2 first:pt-0">
                          <h4 className="font-display font-semibold text-sm text-foreground">{ingredient.slice(3)}</h4>
                        </li>
                      );
                    }
                    return (
                      <li key={index} className="flex items-start gap-2 cursor-pointer text-sm" onClick={() => toggleIngredient(index)}>
                        <Checkbox checked={checkedIngredients.has(index)} onCheckedChange={() => toggleIngredient(index)} className="mt-0.5 h-4 w-4" />
                        <span className={checkedIngredients.has(index) ? 'line-through text-muted-foreground' : ''}>
                          {ingredient}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Full mode: normal ingredient list */}
          {!(isCooking && isCompact) && recipe.ingredients.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">{t("recipe.ingredients")}</h3>
              <ul className="space-y-2">
                {recipe.ingredients.map((ingredient, index) => {
                  if (ingredient.startsWith("## ")) {
                    return (
                      <li key={index} className="pt-3 first:pt-0">
                        <h4 className="font-display font-semibold text-base text-foreground">{ingredient.slice(3)}</h4>
                      </li>
                    );
                  }
                  return (
                    <li key={index} className={`flex items-start gap-3 ${isCooking ? 'cursor-pointer' : ''}`} onClick={isCooking ? () => toggleIngredient(index) : undefined}>
                      {isCooking ? (
                        <Checkbox checked={checkedIngredients.has(index)} onCheckedChange={() => toggleIngredient(index)} className="mt-1" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      )}
                      <span className={checkedIngredients.has(index) && isCooking ? 'line-through text-muted-foreground' : ''}>
                        <LinkifyText text={ingredient} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {recipe.instructions.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">{t("recipe.instructions")}</h3>
              <ol className="space-y-4">
                {(isCooking && isCompact && enrichedInstructions ? enrichedInstructions : recipe.instructions).map((instruction, index) => (
                  <li key={index} className={`flex gap-4 ${isCooking ? 'cursor-pointer' : ''}`} onClick={isCooking ? () => toggleStep(index) : undefined}>
                    {isCooking ? (
                      <div className="flex items-center justify-center w-8 h-8 shrink-0">
                        <Checkbox checked={checkedSteps.has(index)} onCheckedChange={() => toggleStep(index)} className="h-6 w-6" />
                      </div>
                    ) : (
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                        {index + 1}
                      </span>
                    )}
                    <p className={`pt-1 ${checkedSteps.has(index) && isCooking ? 'line-through text-muted-foreground' : ''}`}>
                      <LinkifyText text={instruction} />
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Comments */}
          <CommentSection recipeId={recipe.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
