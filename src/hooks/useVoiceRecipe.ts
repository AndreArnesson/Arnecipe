import { useState, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { toast } from "sonner";

interface UseVoiceRecipeResult {
  isListening: boolean;
  isRefining: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  language: string;
  setLanguage: (lang: string) => void;
  startListening: () => void;
  stopListening: () => void;
  refineTranscription: (text: string) => Promise<RecipeData | null>;
  clearTranscription: () => void;
  error: string | null;
}

interface RecipeData {
  title?: string;
  description?: string;
  ingredients?: string[];
  instructions?: string[];
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  category?: string;
}

export function useVoiceRecipe(): UseVoiceRecipeResult {
  const {
    isListening,
    transcript,
    interimTranscript,
    startListening: startRecognition,
    stopListening: stopRecognition,
    resetTranscript,
    isSupported,
    error: recognitionError,
    language,
    setLanguage,
  } = useSpeechRecognition();

  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startListening = useCallback(() => {
    setError(null);
    startRecognition();
  }, [startRecognition]);

  const stopListening = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  const refineTranscription = useCallback(async (text: string): Promise<RecipeData | null> => {
    setIsRefining(true);
    setError(null);

    try {
      toast.info("Refining your recipe...");

      const refineResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refine-recipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ rawText: text }),
        }
      );

      if (!refineResponse.ok) {
        const errorData = await refineResponse.json();
        throw new Error(errorData.error || "Failed to refine recipe");
      }

      const recipe = await refineResponse.json();
      toast.success("Recipe created!");
      resetTranscript();
      return recipe;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refinement failed";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsRefining(false);
    }
  }, [resetTranscript]);

  const clearTranscription = useCallback(() => {
    resetTranscript();
    setError(null);
  }, [resetTranscript]);

  return {
    isListening,
    isRefining,
    transcript,
    interimTranscript,
    isSupported,
    language,
    setLanguage,
    startListening,
    stopListening,
    refineTranscription,
    clearTranscription,
    error: error || recognitionError,
  };
}
