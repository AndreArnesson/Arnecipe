import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechRecognitionResult {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
  language: string;
  setLanguage: (lang: string) => void;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("sv-SE"); // Swedish first
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Speech recognition started, language:", language);
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      
      switch (event.error) {
        case "no-speech":
          setError("No speech detected. Please try again.");
          break;
        case "audio-capture":
          setError("No microphone found. Please check your microphone.");
          break;
        case "not-allowed":
          setError("Microphone access denied. Please allow microphone access.");
          break;
        case "network":
          setError("Network error. Please check your connection.");
          break;
        default:
          setError(`Error: ${event.error}`);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + " " + finalTranscript);
      }
      setInterimTranscript(interim);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [isSupported, language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("Failed to stop recognition:", err);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    transcript: transcript.trim(),
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error,
    language,
    setLanguage,
  };
}
