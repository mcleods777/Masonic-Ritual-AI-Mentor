"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  createWebSpeechEngine,
  createWhisperEngine,
  isWebSpeechAvailable,
  isMediaRecorderAvailable,
  type STTEngine,
  type STTProvider,
} from "@/lib/speech-to-text";
import { speak, stopSpeaking, isTTSAvailable } from "@/lib/text-to-speech";
import TTSEngineSelector from "@/components/TTSEngineSelector";

const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Fast & capable (default)" },
  { id: "claude-3-5-haiku-latest", label: "Haiku 3.5", description: "Fastest" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fast" },
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5", description: "Balanced" },
  { id: "claude-opus-4-6", label: "Opus 4.6", description: "Most capable" },
] as const;

interface ChatInterfaceProps {
  ritualContext: string;
}

export default function ChatInterface({ ritualContext }: ChatInterfaceProps) {
  const ritualContextRef = useRef(ritualContext);
  ritualContextRef.current = ritualContext;

  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0].id);
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: () => ({
          ritualContext: ritualContextRef.current,
          model: selectedModelRef.current,
        }),
      }),
    []
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [sttProvider, setSTTProvider] = useState<STTProvider>("browser");
  const engineRef = useRef<STTEngine | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-speak assistant responses
  useEffect(() => {
    if (!autoSpeak || !isTTSAvailable()) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && !isLoading) {
      const parts = lastMessage.parts?.filter((p) => p.type === "text") || [];
      const text = parts.map((p) => p.text).join("");
      if (text) speak(text, { rate: 0.9 });
    }
  }, [messages, isLoading, autoSpeak]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage({ text: inputValue });
    setInputValue("");
  };

  const getMessageText = (message: typeof messages[0]): string => {
    if (message.parts) {
      return message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    return "";
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      if (sttProvider === "whisper") {
        // Whisper: recording stopped, wait for async transcription
        setIsRecording(false);
        setIsTranscribing(true);
      } else {
        engineRef.current = null;
        setIsRecording(false);
      }
    } else {
      const canUse = sttProvider === "whisper"
        ? isMediaRecorderAvailable()
        : isWebSpeechAvailable();
      if (!canUse) return;

      const engine = sttProvider === "whisper"
        ? createWhisperEngine()
        : createWebSpeechEngine();
      engineRef.current = engine;

      engine.onResult = (result) => {
        setInputValue(result.transcript);

        if (result.isFinal && result.transcript.trim()) {
          setIsTranscribing(false);
          setTimeout(() => {
            sendMessage({ text: result.transcript.trim() });
            setInputValue("");
            setIsRecording(false);
            engine.stop();
            engineRef.current = null;
          }, 500);
        }
      };

      engine.onError = () => {
        setIsRecording(false);
        setIsTranscribing(false);
      };

      engine.onEnd = () => {
        setIsRecording(false);
      };

      engine.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Chat header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">Ritual Coach</h2>
          <p className="text-xs text-zinc-500">
            Ask questions about the ritual or get help with memorization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-xs focus:outline-none focus:border-amber-500"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.description}
              </option>
            ))}
          </select>
          <TTSEngineSelector />
          {isTTSAvailable() && (
            <button
              onClick={() => {
                setAutoSpeak(!autoSpeak);
                if (autoSpeak) stopSpeaking();
              }}
              className={`p-2 rounded-lg transition-colors ${
                autoSpeak
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={
                autoSpeak ? "Disable voice responses" : "Enable voice responses"
              }
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <p className="text-zinc-400 font-medium">
              Your ritual coach is ready
            </p>
            <p className="text-zinc-600 text-sm mt-2 max-w-md mx-auto">
              Ask about any section of the ritual, request hints for specific
              passages, or have the coach quiz you on the catechism.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {[
                "What does the Senior Warden say during opening?",
                "Quiz me on the Entered Apprentice obligation",
                "Give me a hint for the Fellow Craft lecture",
                "Explain the significance of the working tools",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInputValue(suggestion)}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs transition-colors border border-zinc-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">
                {getMessageText(message)}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800">
        {/* STT provider toggle */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-zinc-600">Voice:</span>
          <div className="flex rounded border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setSTTProvider("browser")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                sttProvider === "browser"
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Browser
            </button>
            <button
              type="button"
              onClick={() => setSTTProvider("whisper")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                sttProvider === "whisper"
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Whisper
            </button>
          </div>
          {isTranscribing && (
            <span className="text-xs text-purple-400 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Transcribing...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(isWebSpeechAvailable() || isMediaRecorderAvailable()) && (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`p-3 rounded-lg transition-colors ${
                isRecording
                  ? "bg-red-600 text-white animate-pulse"
                  : isTranscribing
                    ? "bg-purple-900/50 text-purple-400"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing..." : "Speak your question"}
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask the coach anything about the ritual..."
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
