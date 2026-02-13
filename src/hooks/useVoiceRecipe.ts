import { useState, useCallback } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { toast } from "sonner";

interface UseVoiceRecipeResult {
  isRecording: boolean;
  isTranscribing: boolean;
  isRefining: boolean;
  transcript: string;
  startRecording: () => void;
  stopRecording: () => Promise<string | null>;
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
  const { isRecording, startRecording: startRec, stopRecording: stopRec, error: recorderError } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(() => {
    setError(null);
    setTranscript("");
    startRec();
  }, [startRec]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const audioBlob = await stopRec();
    if (!audioBlob) return null;

    setIsTranscribing(true);
    setError(null);

    try {
      toast.info("Transcribing audio...");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const data = await response.json();
      const text = data.text?.trim() || "";
      setTranscript(text);
      toast.success("Transcription complete!");
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [stopRec]);

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
      setTranscript("");
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
    setTranscript("");
    setError(null);
  }, []);

  return {
    isRecording,
    isTranscribing,
    isRefining,
    transcript,
    startRecording,
    stopRecording,
    refineTranscription,
    clearTranscription,
    error: error || recorderError,
  };
}
