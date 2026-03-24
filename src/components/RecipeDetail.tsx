import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users, ChefHat, Tag, Pencil, Trash2, Loader2, X, Plus, ImagePlus, Lock, Globe, Star, ArrowRightLeft, Share2 } from "lucide-react";
import { StarRating } from "@/components/StarRating";
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

  // Load ratings when recipe changes
  useEffect(() => {
    if (recipe && open) {
      fetchRatings(recipe.id);
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
    setImagePreview(recipe.image_url || null);
    setImageFile(null);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      let imageUrl = recipe.image_url;
      if (imageFile && user) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('recipe-images').upload(fileName, imageFile);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('recipe-images').getPublicUrl(fileName);
          imageUrl = publicUrl;
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
        // rating no longer on recipe table
        image_url: imageUrl,
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{t("recipe.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="" className="w-full h-48 object-cover rounded-lg border" />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2">
                  {t("addRecipe.changeImage")}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-dashed gap-2">
                <ImagePlus className="h-5 w-5" />
                {t("addRecipe.uploadImage")}
              </Button>
            )}

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
            <div className="grid grid-cols-3 gap-4">
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between pr-8">
            <DialogTitle className="font-display text-2xl">
              {recipe.title}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <WakeLockButton />
              <Button variant="ghost" size="icon" onClick={handleShareRecipe} title={t("recipe.shareLink")}>
                <Share2 className="h-4 w-4" />
              </Button>
              {isOwner && (
                <Button variant="ghost" size="icon" onClick={startEditing} title={t("recipe.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {recipe.image_url && (
            <div className="aspect-video rounded-xl overflow-hidden">
              <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
            </div>
          )}

          {recipe.description && (
            <p className="text-muted-foreground">
              <LinkifyText text={recipe.description} />
            </p>
          )}

          {/* Rating section */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">{t("recipe.yourRating")}</p>
                <StarRating value={userRating} onChange={handleUserRating} size="md" />
              </div>
              <div className="text-right">
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

          {recipe.ingredients.length > 0 && (
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
                    <li key={index} className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      <LinkifyText text={ingredient} />
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
                {recipe.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                      {index + 1}
                    </span>
                    <p className="pt-1">
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
