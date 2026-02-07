import { useState, useCallback } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { toast } from "sonner";

interface UseVoiceRecipeResult {
  isRecording: boolean;
  isTranscribing: boolean;
  isRefining: boolean;
  rawTranscription: string | null;
  startVoiceInput: () => Promise<void>;
  stopVoiceInput: () => Promise<string | null>;
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
}

export function useVoiceRecipe(): UseVoiceRecipeResult {
  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [rawTranscription, setRawTranscription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startVoiceInput = useCallback(async () => {
    setError(null);
    setRawTranscription(null);
    await startRecording();
  }, [startRecording]);

  const stopVoiceInput = useCallback(async (): Promise<string | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      const audioBlob = await stopRecording();
      if (!audioBlob) {
        throw new Error("No audio recorded");
      }

      toast.info("Transcribing your voice...");

      // Transcribe audio
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
      setRawTranscription(rawText);
      toast.success("Transcription complete! Review and edit if needed.");
      return rawText;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice input failed";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [stopRecording]);

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
      setRawTranscription(null);
      return recipe;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refinement failed";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsRefining(false);
    }
  }, []);

  const clearTranscription = useCallback(() => {
    setRawTranscription(null);
    setError(null);
  }, []);

  return {
    isRecording,
    isTranscribing,
    isRefining,
    rawTranscription,
    startVoiceInput,
    stopVoiceInput,
    refineTranscription,
    clearTranscription,
    error: error || recorderError,
  };
}
