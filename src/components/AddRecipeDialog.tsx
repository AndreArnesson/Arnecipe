import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Sparkles, Loader2, X, Mic, MicOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useVoiceRecipe } from "@/hooks/useVoiceRecipe";

interface AddRecipeDialogProps {
  onRecipeAdded?: () => void;
}

export function AddRecipeDialog({ onRecipeAdded }: AddRecipeDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { isRecording, isProcessing, startVoiceInput, stopVoiceInput } = useVoiceRecipe();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState<string[]>([""]);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIngredients([""]);
    setInstructions([""]);
    setPrepTime("");
    setCookTime("");
    setServings("");
  };

  const handleGenerateWithAI = async () => {
    if (!title.trim()) {
      toast.error("Please enter a recipe title first");
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
          toast.error("AI is busy, please try again in a moment");
        } else if (error.message?.includes("402")) {
          toast.error("AI credits exhausted, please add funds");
        } else {
          toast.error("Failed to generate recipe");
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
        toast.success("Recipe generated!");
      }
    } catch (error) {
      console.error("AI generation error:", error);
      toast.error("Failed to generate recipe");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      const recipe = await stopVoiceInput();
      if (recipe) {
        if (recipe.title) setTitle(recipe.title);
        if (recipe.description) setDescription(recipe.description);
        if (recipe.ingredients?.length) setIngredients(recipe.ingredients);
        if (recipe.instructions?.length) setInstructions(recipe.instructions);
        if (recipe.prepTime) setPrepTime(recipe.prepTime.toString());
        if (recipe.cookTime) setCookTime(recipe.cookTime.toString());
        if (recipe.servings) setServings(recipe.servings.toString());
      }
    } else {
      await startVoiceInput();
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a recipe title");
      return;
    }

    if (!user) {
      toast.error("You must be signed in to save recipes");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from("recipes").insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        ingredients: ingredients.filter(i => i.trim()),
        instructions: instructions.filter(i => i.trim()),
        prep_time: prepTime ? parseInt(prepTime) : null,
        cook_time: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
      });

      if (error) {
        console.error("Save error:", error);
        toast.error("Failed to save recipe");
        return;
      }

      toast.success("Recipe saved!");
      resetForm();
      setOpen(false);
      onRecipeAdded?.();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save recipe");
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
          Add Recipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add New Recipe</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Voice Input Section */}
          <div className="p-4 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Voice Input</h3>
                <p className="text-xs text-muted-foreground">
                  {isRecording 
                    ? "Speak your recipe... Click to stop" 
                    : isProcessing 
                      ? "Processing your voice..." 
                      : "Dictate ingredients and steps naturally"}
                </p>
              </div>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="lg"
                onClick={handleVoiceToggle}
                disabled={isProcessing || isGenerating || isSaving}
                className="gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
                {isRecording ? "Stop" : isProcessing ? "Processing..." : "Record"}
              </Button>
            </div>
            {isRecording && (
              <div className="mt-3 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                </span>
                <span className="text-sm text-destructive font-medium">Recording...</span>
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or enter manually</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Recipe Title</Label>
            <div className="flex gap-2">
              <Input
                id="title"
                placeholder="e.g., Grandma's Meatballs"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleGenerateWithAI}
                disabled={isGenerating || !title.trim() || isRecording || isProcessing}
                className="shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">AI Generate</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a title and click AI Generate to auto-fill the recipe
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="A brief description of the dish..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prepTime">Prep Time (min)</Label>
              <Input
                id="prepTime"
                type="number"
                placeholder="15"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookTime">Cook Time (min)</Label>
              <Input
                id="cookTime"
                type="number"
                placeholder="30"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servings">Servings</Label>
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
            <Label>Ingredients</Label>
            {ingredients.map((ingredient, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Ingredient ${index + 1}`}
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
              Add Ingredient
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Instructions</Label>
            {instructions.map((instruction, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex items-center justify-center w-8 h-10 rounded-lg bg-primary/10 text-primary font-medium shrink-0">
                  {index + 1}
                </div>
                <Textarea
                  placeholder={`Step ${index + 1}`}
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
              Add Step
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Recipe
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
