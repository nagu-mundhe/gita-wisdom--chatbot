import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./Chatbot.css";

// Decode HTML entities to display clean text
function decodeHTMLEntities(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

let currentUtterance = null;

// Clean text for speech clarity
const cleanTextForSpeech = (text) => {
  return text
    .replace(/\|\|/g, " ")
    .replace(/[\.,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Speech synthesis
const speakShloka = (text, setIsSpeaking) => {
  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText || typeof cleanedText !== "string") return;

  const speakAfterCancel = () => {
    return new Promise((resolve) => {
      const check = () => {
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  };

  const speak = async () => {
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      console.error("❌ No voices available.");
      return;
    }

    const preferredVoice =
      voices.find(v => v.lang === "mr-IN") ||
      voices.find(v => v.lang === "hi-IN") ||
      voices.find(v => v.lang === "en-IN") ||
      voices[0];

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang;
    utterance.rate = 0.9;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    currentUtterance = utterance;

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      await speakAfterCancel();
    }

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  };

  if (!window.speechSynthesis.getVoices().length) {
    window.speechSynthesis.onvoiceschanged = () => speak();
  } else {
    speak();
  }
};

const stopSpeech = (setIsSpeaking) => {
  window.speechSynthesis.cancel();
  currentUtterance = null;
  setIsSpeaking(false);
};

// Voice Recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "mr-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

const ChatBot = () => {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "🙏 हरे कृष्ण हरे कृष्ण, कृष्ण कृष्ण हरे हरे\n🙏 हरे राम हरे राम, राम राम हरे हरे",
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRecommendations, setPendingRecommendations] = useState(null);
  const [lastVoiceText, setLastVoiceText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setUserInput(transcript);
      setIsListening(false);

      // Auto-submit after recognition
      setTimeout(() => {
        isBotExpectingAnswer() ? handleMoreOptions(transcript) : sendMessage();
      }, 300);
    };

    recognition.onerror = (event) => {
      console.error("⚠️ Voice recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);
  }, []);

  const startListening = () => {
    if (!recognition) {
      alert("Browser does not support speech recognition.");
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error("Recognition start failed: ", error);
    }
  };

  const stopListening = () => {
    try {
      recognition.stop();
      setIsListening(false);
    } catch (error) {
      console.error("Recognition stop failed: ", error);
    }
  };

  const isBotExpectingAnswer = () => {
    const last = messages[messages.length - 1];
    return last?.isQuestion ?? false;
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;

    const updatedMessages = [...messages, { sender: "user", text: userInput }];
    setMessages(updatedMessages);
    setUserInput("");
    setLoading(true);

    try {
      const response = await axios.post("https://gita-backend.onrender.com/recommend", {
        problem: userInput,
      });

      const { Main_Recommendation, Other_Recommendations } = response.data;

      const mainRecommendation = {
        main: {
          header: "✅ MAIN RECOMMENDATION",
          sections: [
            { label: "🧠 Problem", value: Main_Recommendation.Problem },
            { label: "📜 Shloka", value: Main_Recommendation.Shloka },
            { label: "💡 Solution", value: Main_Recommendation.Solution },
            { label: "🔁 Similarity Score", value: Main_Recommendation.Similarity },
          ],
        },
      };

      setPendingRecommendations({
        others: {
          header: "🔍 OTHER RECOMMENDATIONS",
          options: Other_Recommendations.map((rec, i) => ({
            option: `🔹 Option ${i + 1}`,
            sections: [
              { label: "📜 Shloka", value: rec.Shloka },
              { label: "💡 Solution", value: rec.Solution },
              { label: "🔁 Similarity Score", value: rec.Similarity },
            ],
          })),
        },
      });

      setMessages([
        ...updatedMessages,
        { sender: "bot", data: mainRecommendation },
        {
          sender: "bot",
          text: "Would you like to see more recommendations? (Yes/No)",
          isQuestion: true,
        },
      ]);

      const voiceText = `श्लोक: ${Main_Recommendation.Shloka}. अर्थ: ${Main_Recommendation.Solution}`;
      setLastVoiceText(voiceText);
      speakShloka(voiceText, setIsSpeaking);
    } catch (error) {
      setMessages([
        ...updatedMessages,
        { sender: "bot", text: "⚠ काहीतरी चुकलं आहे. कृपया पुन्हा प्रयत्न करा." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleMoreOptions = (response) => {
    const updatedMessages = [...messages, { sender: "user", text: response }];

    if (response.toLowerCase() === "yes" && pendingRecommendations) {
      updatedMessages.push({ sender: "bot", data: pendingRecommendations });

      const combinedText = pendingRecommendations.others.options
        .map((opt, idx) => {
          const shloka = opt.sections.find(s => s.label === "📜 Shloka")?.value;
          const solution = opt.sections.find(s => s.label === "💡 Solution")?.value;
          return `पर्याय ${idx + 1}: श्लोक: ${shloka}. अर्थ: ${solution}`;
        }).join(". ");

      setLastVoiceText(combinedText);
      speakShloka(combinedText, setIsSpeaking);
    } else if (response.toLowerCase() === "no") {
      updatedMessages.push({
        sender: "bot",
        text: "ठीक आहे. अजून काही विचारायचं असेल तर नक्की सांगा! 🙏",
      });
    } else {
      updatedMessages.push({
        sender: "bot",
        text: "कृपया 'Yes' किंवा 'No' असं उत्तर द्या.",
        isQuestion: true,
      });
    }

    setMessages(updatedMessages);
    setPendingRecommendations(null);
    setUserInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      isBotExpectingAnswer() ? handleMoreOptions(userInput) : sendMessage();
    }
  };

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    window.speechSynthesis.getVoices();
  }, []);

  return (
    <div className="chat-container">
      <h1 className="chat-title">🕉️ Geeta Wisdom Bot</h1>

      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.text ? (
              decodeHTMLEntities(msg.text).split("\n").map((line, i) => (
                <div key={i} className="message-text">{line}</div>
              ))
            ) : (
              <div className="recommendation-card">
                {msg.data.main && (
                  <div className="recommendation-section">
                    <div className="message-header">{msg.data.main.header}</div>
                    {msg.data.main.sections.map((section, i) => (
                      <div key={i} className="recommendation-item">
                        <div className="recommendation-label">{section.label}</div>
                        <div className="recommendation-value">
                          {decodeHTMLEntities(section.value).split("\n").map((line, j) => (
                            <div key={j}>{line}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {msg.data.others && (
                  <div className="recommendation-section">
                    <div className="message-header">{msg.data.others.header}</div>
                    {msg.data.others.options.map((opt, i) => (
                      <div key={i} className="option">
                        <div className="message-subheader">{opt.option}</div>
                        {opt.sections.map((section, j) => (
                          <div key={j} className="recommendation-item">
                            <div className="recommendation-label">{section.label}</div>
                            <div className="recommendation-value">
                              {decodeHTMLEntities(section.value).split("\n").map((line, k) => (
                                <div key={k}>{line}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="loader-container">
            <div className="chakra-loader"></div>
            <div className="loading-text">Analyzing your query... Please wait 🙏</div>
          </div>
        )}
      </div>

      {isSpeaking && <div className="speaking-status">🗣 बोलत आहे...</div>}

      <div className="input-area">
        <input
          type="text"
          placeholder="तुमचा प्रश्न टाइप करा... (उदा. मला माझे मन स्थिर ठेवायचे आहे)"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={() => {
            isBotExpectingAnswer() ? handleMoreOptions(userInput) : sendMessage();
          }}
        >
          समस्या सांगा
        </button>

        <button
          onClick={() => !isSpeaking && lastVoiceText && speakShloka(lastVoiceText, setIsSpeaking)}
          disabled={isSpeaking}
        >
          🔁 Replay
        </button>

        <button
          onClick={() => stopSpeech(setIsSpeaking)}
          disabled={!isSpeaking}
        >
          ⏹️ Stop
        </button>

        <button
          onClick={() => {
            isListening ? stopListening() : startListening();
          }}
          className={`mic-button ${isListening ? "listening" : ""}`}
        >
          🎤 {isListening ? "ऐकत आहे..." : "बोला"}
        </button>
      </div>
    </div>
  );
};

export default ChatBot;
