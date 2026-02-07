import { useState, useCallback } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { toast } from "sonner";

interface UseVoiceRecipeResult {
  isRecording: boolean;
  isProcessing: boolean;
  startVoiceInput: () => Promise<void>;
  stopVoiceInput: () => Promise<RecipeData | null>;
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
}

export function useVoiceRecipe(): UseVoiceRecipeResult {
  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startVoiceInput = useCallback(async () => {
    setError(null);
    await startRecording();
  }, [startRecording]);

  const stopVoiceInput = useCallback(async (): Promise<RecipeData | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      const audioBlob = await stopRecording();
      if (!audioBlob) {
        throw new Error("No audio recorded");
      }

      toast.info("Transcribing your voice...");

      // Step 1: Transcribe audio
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const transcribeResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!transcribeResponse.ok) {
        const errorData = await transcribeResponse.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const { text: rawText } = await transcribeResponse.json();
      
      if (!rawText || rawText.trim().length === 0) {
        throw new Error("Could not understand the audio. Please try again.");
      }

      console.log("Raw transcription:", rawText);
      toast.info("Refining your recipe...");

      // Step 2: Refine with AI
      const refineResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refine-recipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ rawText }),
        }
      );

      if (!refineResponse.ok) {
        const errorData = await refineResponse.json();
        throw new Error(errorData.error || "Failed to refine recipe");
      }

      const recipe = await refineResponse.json();
      toast.success("Recipe created from your voice!");
      return recipe;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice input failed";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [stopRecording]);

  return {
    isRecording,
    isProcessing,
    startVoiceInput,
    stopVoiceInput,
    error: error || recorderError,
  };
}
