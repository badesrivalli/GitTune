import React, { useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [repoInput, setRepoInput] = useState("facebook/react");
  const [persona, setPersona] = useState("telugu_hybrid");
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [commitsData, setCommitsData] = useState([]);
  const [totalCommitsCount, setTotalCommitsCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(null);
  const [exportFormat, setExportFormat] = useState("markdown");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("gittune_history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const personaOptions = [
    { id: "telugu_hybrid", label: "⚡ Telugu Hybrid", desc: "Localized developer humor & mix" },
    { id: "hype", label: "🚀 Hype Tech", desc: "High energy product manager vibe" },
    { id: "sarcastic", label: "🤖 Sarcastic Coder", desc: "Witty & dry senior dev humor" }
  ];

  const saveToHistory = (repoName) => {
    const updated = [repoName, ...history.filter(r => r !== repoName)].slice(0, 5);
    setHistory(updated);
    localStorage.setItem("gittune_history", JSON.stringify(updated));
  };

  const fetchGitHubCommits = async (repoPath) => {
    const response = await fetch(`https://api.github.com/repos/${repoPath}/commits?per_page=10`);
    if (!response.ok) throw new Error("GitHub repository not found or rate limited!");
    const data = await response.json();
    
    setTotalCommitsCount(data.length);
    const formattedCommits = data.map(c => ({
      author: c.commit.author.name.split(" ")[0],
      message: c.commit.message,
      sha: c.sha.substring(0, 7),
      date: c.commit.author.date.split("T")[0]
    }));

    const authorCounts = {};
    formattedCommits.forEach(c => {
      authorCounts[c.author] = (authorCounts[c.author] || 0) + 1;
    });

    const chartArray = Object.keys(authorCounts).map(name => ({
      name,
      commits: authorCounts[name]
    }));

    setCommitsData(chartArray);
    return formattedCommits;
  };

  const handleGenerate = async (presetRepo) => {
    const targetRepo = presetRepo || repoInput.trim();
    if (presetRepo) setRepoInput(presetRepo);
    
    setLoading(true);
    setResult(null);
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentSpeakerIndex(null);
    setChatHistory([]);

    try {
      const commits = await fetchGitHubCommits(targetRepo);
      saveToHistory(targetRepo);

      const payload = {
        repo_name: targetRepo,
        persona: persona,
        language_mode: persona === "telugu_hybrid" ? "te_hybrid" : "en_tech",
        commits: commits
      };

      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: JSON.stringify(payload),
        config: {
          systemInstruction: `You are GitTune's analysis engine. Output valid JSON only with keys: clean_code_score (number), standup_summary (string), and podcast_script (array of objects with speaker: 'Alex' or 'Sam' and line: string). Do not wrap in markdown \`\`\`json.`,
        },
      });

      const jsonResult = JSON.parse(response.text);
      setResult(jsonResult);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error analyzing repository!");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = () => {
    if (!result?.podcast_script) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentSpeakerIndex(null);
      return;
    }

    setIsPlaying(true);
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const naturalEnglishVoices = voices.filter(v => v.lang.includes("en") || v.name.toLowerCase().includes("natural") || v.name.toLowerCase().includes("neural"));

    result.podcast_script.forEach((item, idx) => {
      const utterance = new SpeechSynthesisUtterance(item.line);
      utterance.onstart = () => setCurrentSpeakerIndex(idx);

      if (item.speaker === "Alex") {
        utterance.pitch = 0.92;
        utterance.rate = 0.98;
        if (naturalEnglishVoices.length > 0) utterance.voice = naturalEnglishVoices[0];
      } else {
        utterance.pitch = 1.32;
        utterance.rate = 1.05;
        if (naturalEnglishVoices.length > 1) utterance.voice = naturalEnglishVoices[1];
        else if (voices.length > 1) utterance.voice = voices[1];
      }
      
      if (idx === result.podcast_script.length - 1) {
        utterance.onend = () => {
          setIsPlaying(false);
          setCurrentSpeakerIndex(null);
        };
      }
      synth.speak(utterance);
    });
  };

  const handleExport = () => {
    if (!result) return;
    let text = "";
    if (exportFormat === "markdown") {
      text = `# GitTune Enterprise Report: ${repoInput}\n**Code Score:** ${result.clean_code_score}/100\n\n## Daily Standup Summary\n${result.standup_summary}\n\n## Podcast Script\n` + 
        result.podcast_script.map(p => `**${p.speaker}:** ${p.line}`).join('\n');
    } else if (exportFormat === "json") {
      text = JSON.stringify(result, null, 2);
    } else {
      text = `GITTUNE REPORT: ${repoInput}\nScore: ${result.clean_code_score}/100\n\nSTANDUP:\n${result.standup_summary}\n\nPODCAST:\n` +
        result.podcast_script.map(p => `${p.speaker}: ${p.line}`).join('\n');
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const htmlContent = `<html><head><title>GitTune Report - ${repoInput}</title></head><body style="font-family:Inter,sans-serif; padding:40px; background:#030712; color:#f8fafc;"><h1>GitTune Enterprise Intelligence Report</h1><h3>Repository: ${repoInput}</h3><p><b>Code Health Score:</b> ${result.clean_code_score}/100</p><h2>Standup Summary</h2><p>${result.standup_summary}</p><h2>Podcast Script</h2>${result.podcast_script.map(p => `<p><b>${p.speaker}:</b> ${p.line}</p>`).join('')}</body></html>`;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GitTune-Report-${repoInput.replace("/", "-")}.html`;
    a.click();
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatQuery.trim() || !result) return;

    const userMsg = chatQuery;
    setChatQuery("");
    setChatHistory(prev => [...prev, { sender: "user", text: userMsg }]);
    setChatLoading(true);

    try {
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `Based on the repository ${repoInput} with summary: "${result.standup_summary}", answer this developer query concisely: ${userMsg}`
      });
      setChatHistory(prev => [...prev, { sender: "ai", text: response.text }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { sender: "ai", text: "Error answering query. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const theme = {
    bg: isDarkMode ? "#030712" : "#f8fafc",
    sidebarBg: isDarkMode ? "#060911" : "#ffffff",
    cardBg: isDarkMode ? "rgba(13, 19, 33, 0.95)" : "rgba(255, 255, 255, 0.98)",
    cardBorder: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    textMain: isDarkMode ? "#f8fafc" : "#0f172a",
    textMuted: isDarkMode ? "#8a9ab0" : "#64748b",
    inputBg: isDarkMode ? "#02040a" : "#f1f5f9",
    inputBorder: isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)",
    panelBg: isDarkMode ? "#0b101d" : "#ffffff"
  };

  const selectedPersonaObj = personaOptions.find(p => p.id === persona);

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: theme.bg, color: theme.textMain, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${theme.bg}; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

        @keyframes contentAnimate {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes dropdownSlideDown {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes shimmerPulse {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        @keyframes nodePulse {
          0%, 100% { box-shadow: 0 0 15px rgba(14, 165, 233, 0.3); transform: scale(1); }
          50% { box-shadow: 0 0 30px rgba(14, 165, 233, 0.6); transform: scale(1.03); }
        }

        @keyframes waveBarAnim {
          0%, 100% { height: 4px; }
          50% { height: 24px; }
        }

        .tab-anim { animation: contentAnimate 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        .skeleton-box {
          background: ${isDarkMode ? "linear-gradient(90deg, #0d1321 25%, #1e293b 50%, #0d1321 75%)" : "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)"};
          background-size: 200% 100%;
          animation: shimmerPulse 1.4s infinite;
          border-radius: 10px;
        }

        .wave-line { width: 3px; background-color: #0ea5e9; border-radius: 3px; animation: waveBarAnim 0.75s infinite ease-in-out; }

        .card-hover {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease;
        }
        .card-hover:hover {
          transform: translateY(-2px);
          border-color: rgba(14, 165, 233, 0.4) !important;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
        }

        .btn-action {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
        }
        .btn-action:hover {
          transform: translateY(-1px);
          filter: brightness(1.12);
          box-shadow: 0 4px 15px rgba(14, 165, 233, 0.35);
        }
        .btn-action:active { transform: translateY(0); }

        .persona-item { transition: all 0.2s ease; cursor: pointer; }
        .persona-item:hover { background: rgba(14, 165, 233, 0.12) !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{ width: "272px", backgroundColor: theme.sidebarBg, borderRight: `1px solid ${theme.cardBorder}`, padding: "28px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "36px", paddingLeft: "4px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "linear-gradient(135deg, #0ea5e9, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", animation: "nodePulse 3.5s infinite" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            </div>
            <div>
              <h1 style={{ color: theme.textMain, margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "-0.4px" }}>GitTune</h1>
              <span style={{ fontSize: "10px", color: "#0ea5e9", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1.3px" }}>Enterprise Studio</span>
            </div>
          </div>

          <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", paddingLeft: "8px" }}>Workspace</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              { id: "overview", label: "Overview & Insights", icon: "📊" },
              { id: "analytics", label: "Commit Analytics", icon: "📈" },
              { id: "podcast", label: "AI Podcast Studio", icon: "🎙️" }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)} 
                className="card-hover"
                style={{ 
                  textAlign: "left", padding: "11px 14px", borderRadius: "10px", border: "none", 
                  backgroundColor: activeTab === tab.id ? "rgba(14, 165, 233, 0.14)" : "transparent", 
                  color: activeTab === tab.id ? "#0ea5e9" : theme.textMuted, 
                  cursor: "pointer", fontWeight: activeTab === tab.id ? "600" : "500", fontSize: "13.5px",
                  display: "flex", alignItems: "center", gap: "10px",
                  borderLeft: activeTab === tab.id ? "3px solid #0ea5e9" : "3px solid transparent",
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ backgroundColor: theme.panelBg, padding: "16px", borderRadius: "12px", border: `1px solid ${theme.cardBorder}` }}>
          <p style={{ fontSize: "10px", color: theme.textMuted, margin: "0 0 10px 0", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Recent Audits</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {history.length === 0 && <span style={{ fontSize: "11px", color: theme.textMuted }}>No recent repositories</span>}
            {history.map(item => (
              <button
                key={item}
                onClick={() => handleGenerate(item)}
                style={{ background: "transparent", border: "none", color: theme.textMain, textAlign: "left", fontSize: "12px", cursor: "pointer", padding: "4px 0", fontWeight: "500", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}
              >
                🕒 {item}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto", background: isDarkMode ? "radial-gradient(circle at top right, #0b1329 0%, #030712 70%)" : "radial-gradient(circle at top right, #ffffff 0%, #f8fafc 70%)" }}>
        
        {/* Header Toolbar with High Z-Index & Clear Grouping */}
        <header style={{ position: "relative", zIndex: 50, backgroundColor: theme.cardBg, backdropFilter: "blur(20px)", padding: "22px 24px", borderRadius: "16px", border: `1px solid ${theme.cardBorder}`, marginBottom: "32px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "20px", alignItems: "flex-end", boxShadow: "0 15px 35px rgba(0,0,0,0.25)" }}>
          
          {/* Primary Action Controls */}
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap", flex: "1 1 540px" }}>
            <div style={{ flex: "1 1 220px", minWidth: "190px" }}>
              <label style={{ fontSize: "11px", color: theme.textMuted, display: "block", marginBottom: "8px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Repository Target</label>
              <input 
                type="text" 
                value={repoInput} 
                onChange={(e) => setRepoInput(e.target.value)} 
                placeholder="e.g. facebook/react"
                style={{ width: "100%", padding: "11px 16px", borderRadius: "10px", backgroundColor: theme.inputBg, color: theme.textMain, border: `1px solid ${theme.inputBorder}`, fontSize: "13.5px", outline: "none", fontWeight: "500" }}
              />
            </div>

            {/* Custom Persona Engine Dropdown with Safe Absolute Placement */}
            <div style={{ position: "relative", minWidth: "200px", flex: "1 1 200px" }}>
              <label style={{ fontSize: "11px", color: theme.textMuted, display: "block", marginBottom: "8px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Persona Engine</label>
              <div 
                onClick={() => setIsPersonaOpen(!isPersonaOpen)}
                style={{ padding: "11px 16px", borderRadius: "10px", backgroundColor: theme.inputBg, color: "#0ea5e9", border: `1px solid ${theme.inputBorder}`, fontSize: "13.5px", cursor: "pointer", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span>{selectedPersonaObj?.label}</span>
                <span style={{ fontSize: "10px", transform: isPersonaOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>▼</span>
              </div>

              {isPersonaOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "100%", minWidth: "240px", backgroundColor: theme.panelBg, border: `1px solid ${theme.cardBorder}`, borderRadius: "12px", zIndex: 999, boxShadow: "0 12px 30px rgba(0,0,0,0.5)", overflow: "hidden", animation: "dropdownSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}>
                  {personaOptions.map(opt => (
                    <div 
                      key={opt.id}
                      className="persona-item"
                      onClick={() => { setPersona(opt.id); setIsPersonaOpen(false); }}
                      style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, backgroundColor: persona === opt.id ? "rgba(14, 165, 233, 0.12)" : "transparent" }}
                    >
                      <div style={{ color: theme.textMain, fontSize: "13.5px", fontWeight: "600" }}>{opt.label}</div>
                      <div style={{ color: theme.textMuted, fontSize: "11.5px", marginTop: "3px" }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={() => handleGenerate()} 
              disabled={loading}
              className="btn-action"
              style={{ padding: "11px 26px", background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "600", fontSize: "13.5px", height: "43px" }}
            >
              {loading ? "Processing..." : "⚡ Run GitTune"}
            </button>
          </div>

          {/* Secondary Utility Controls Bar */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="card-hover"
              style={{ padding: "11px 16px", backgroundColor: theme.panelBg, color: theme.textMain, border: `1px solid ${theme.cardBorder}`, borderRadius: "10px", cursor: "pointer", fontSize: "13.5px", height: "43px", fontWeight: "500" }}
              title="Toggle Dark/Light Mode"
            >
              {isDarkMode ? "☀️ Light" : "🌙 Dark"}
            </button>

            {result && (
              <>
                <select 
                  value={exportFormat} 
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{ padding: "11px 14px", borderRadius: "10px", backgroundColor: theme.inputBg, color: "#0ea5e9", border: `1px solid ${theme.inputBorder}`, fontSize: "13px", height: "43px", fontWeight: "500" }}
                >
                  <option value="markdown">Markdown (.md)</option>
                  <option value="json">JSON API</option>
                  <option value="text">Plain Text</option>
                </select>

                <button 
                  onClick={handleExport}
                  className="card-hover"
                  style={{ padding: "11px 16px", backgroundColor: theme.panelBg, color: "#0ea5e9", border: "1px solid rgba(14, 165, 233, 0.3)", borderRadius: "10px", cursor: "pointer", fontWeight: "600", fontSize: "13px", height: "43px" }}
                >
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>

                <button 
                  onClick={handleDownloadReport}
                  className="btn-action"
                  style={{ padding: "11px 16px", backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "600", fontSize: "13px", height: "43px" }}
                >
                  📥 Download HTML
                </button>
              </>
            )}
          </div>
        </header>

{/* Initial Welcome Screen */}
        {!result && !loading && (
          <div className="tab-anim" style={{ textAlign: "center", padding: "80px 20px", color: theme.textMuted }}>
            <div style={{ 
              fontSize: "36px", 
              marginBottom: "16px", 
              display: "inline-flex", 
              alignItems: "center", 
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(14, 165, 233, 0.1)",
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: "0 0 20px rgba(14, 165, 233, 0.25)"
            }}>
              ⚡
            </div>
            <h2 style={{ color: theme.textMain, fontSize: "24px", fontWeight: "700", marginBottom: "8px", letterSpacing: "-0.5px" }}>
              GitTune Enterprise Platform
            </h2>
            <p style={{ fontSize: "14px", maxWidth: "440px", margin: "0 auto", lineHeight: "1.65" }}>
              Enter any public GitHub path above to initialize automated code health checks, AI audio podcasts, and repo assistant.
            </p>
          </div>
        )}
        {/* Shimmer Skeleton Loader */}
        {loading && (
          <div className="tab-anim" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
              <div className="skeleton-box" style={{ height: "90px" }}></div>
              <div className="skeleton-box" style={{ height: "90px" }}></div>
              <div className="skeleton-box" style={{ height: "90px" }}></div>
            </div>
            <div className="skeleton-box" style={{ height: "220px" }}></div>
            <div className="skeleton-box" style={{ height: "180px" }}></div>
          </div>
        )}

        {/* Overview Tab */}
        {result && activeTab === "overview" && (
          <div className="tab-anim">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px", marginBottom: "24px" }}>
              <div className="card-hover" style={{ backgroundColor: theme.cardBg, padding: "20px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
                <span style={{ fontSize: "11px", color: theme.textMuted, textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.8px" }}>Target Repository</span>
                <div style={{ fontSize: "15px", color: theme.textMain, fontWeight: "600", marginTop: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repoInput}</div>
              </div>

              {/* Business-Friendly Code Health Card */}
              <div className="card-hover" style={{ backgroundColor: theme.cardBg, padding: "16px 20px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: "11px", color: theme.textMuted, textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.8px" }}>Code Health & Business Grade</span>
                  <div style={{ fontSize: "15px", color: result.clean_code_score > 70 ? "#10b981" : "#f43f5e", fontWeight: "700", marginTop: "4px" }}>
                    {result.clean_code_score > 70 ? "🟢 Grade A+ (Very Healthy)" : "🔴 Attention Required"}
                  </div>
                </div>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", border: `4px solid ${result.clean_code_score > 70 ? "#10b981" : "#f43f5e"}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px", color: theme.textMain, boxShadow: `0 0 15px ${result.clean_code_score > 70 ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}` }}>
                  {result.clean_code_score}
                </div>
              </div>

              <div className="card-hover" style={{ backgroundColor: theme.cardBg, padding: "20px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
                <span style={{ fontSize: "11px", color: theme.textMuted, textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.8px" }}>Commits Analyzed</span>
                <div style={{ fontSize: "20px", color: "#10b981", fontWeight: "700", marginTop: "4px" }}>{totalCommitsCount} Commits</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "24px", gridTemplateColumns: "1.3fr 1fr" }}>
              <div className="card-hover" style={{ backgroundColor: theme.cardBg, backdropFilter: "blur(16px)", padding: "26px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
                <h3 style={{ color: theme.textMain, marginTop: 0, marginBottom: "16px", fontSize: "16px", fontWeight: "600" }}>📋 Executive Standup Summary (Non-Technical View)</h3>
                <div style={{ backgroundColor: theme.inputBg, padding: "18px", borderRadius: "10px", lineHeight: "1.65", color: theme.textMain, border: `1px solid ${theme.cardBorder}`, fontSize: "13.5px" }}>
                  {result.standup_summary}
                </div>
              </div>

              <div className="card-hover" style={{ backgroundColor: theme.cardBg, backdropFilter: "blur(16px)", padding: "26px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
                <h3 style={{ color: theme.textMain, marginTop: 0, marginBottom: "20px", fontSize: "16px", fontWeight: "600" }}>📊 Contributor Activity</h3>
                <div style={{ width: "100%", height: "200px" }}>
                  <ResponsiveContainer>
                    <BarChart data={commitsData}>
                      <XAxis dataKey="name" stroke={theme.textMuted} fontSize={11} />
                      <YAxis stroke={theme.textMuted} allowDecimals={false} fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: theme.inputBg, borderColor: theme.cardBorder, borderRadius: "8px", color: theme.textMain, fontSize: "12px" }} />
                      <Bar dataKey="commits" radius={[4, 4, 0, 0]}>
                        {commitsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#0ea5e9" : "#6366f1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AI Assistant Chat Section */}
            <div className="card-hover" style={{ marginTop: "24px", backgroundColor: theme.cardBg, backdropFilter: "blur(16px)", padding: "24px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
              <h3 style={{ color: theme.textMain, marginTop: 0, marginBottom: "8px", fontSize: "16px", fontWeight: "600" }}>💬 Ask the Repo Assistant (Gemini AI)</h3>
              <p style={{ color: theme.textMuted, fontSize: "13px", marginBottom: "16px" }}>Have questions about architecture, state management, or fixes? Ask below:</p>
              
              <div style={{ maxHeight: "160px", overflowY: "auto", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {chatHistory.map((chat, idx) => (
                  <div key={idx} style={{ padding: "10px 14px", borderRadius: "8px", backgroundColor: chat.sender === "user" ? "rgba(14, 165, 233, 0.15)" : theme.inputBg, border: `1px solid ${theme.cardBorder}`, fontSize: "13px", color: theme.textMain, animation: "contentAnimate 0.3s ease forwards" }}>
                    <strong>{chat.sender === "user" ? "You: " : "Assistant: "}</strong> {chat.text}
                  </div>
                ))}
                {chatLoading && <div style={{ fontSize: "12px", color: "#0ea5e9", fontStyle: "italic" }}>Assistant is analyzing repository context...</div>}
              </div>

              <form onSubmit={handleSendChat} style={{ display: "flex", gap: "10px" }}>
                <input 
                  type="text" 
                  value={chatQuery} 
                  onChange={(e) => setChatQuery(e.target.value)}
                  placeholder="e.g. Where is state management handled in this repo?"
                  style={{ flex: 1, padding: "11px 14px", borderRadius: "8px", backgroundColor: theme.inputBg, color: theme.textMain, border: `1px solid ${theme.inputBorder}`, fontSize: "13px", outline: "none" }}
                />
                <button type="submit" disabled={chatLoading} className="btn-action" style={{ padding: "11px 20px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}>
                  Ask AI
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {result && activeTab === "analytics" && (
          <div className="tab-anim card-hover" style={{ backgroundColor: theme.cardBg, backdropFilter: "blur(16px)", padding: "30px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
            <h2 style={{ color: theme.textMain, marginTop: 0, fontSize: "17px", fontWeight: "600" }}>📈 Deep Commit Analytics Hub</h2>
            <p style={{ color: theme.textMuted, marginBottom: "24px", fontSize: "13.5px" }}>Granular author contributions extracted from active repository logs.</p>
            <div style={{ width: "100%", height: "350px" }}>
              <ResponsiveContainer>
                <BarChart data={commitsData}>
                  <XAxis dataKey="name" stroke={theme.textMuted} fontSize={12} />
                  <YAxis stroke={theme.textMuted} allowDecimals={false} fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: theme.inputBg, borderColor: theme.cardBorder, borderRadius: "8px", color: theme.textMain }} />
                  <Bar dataKey="commits" radius={[4, 4, 0, 0]}>
                    {commitsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#0ea5e9" : "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Podcast Studio Tab */}
        {result && activeTab === "podcast" && (
          <div className="tab-anim card-hover" style={{ backgroundColor: theme.cardBg, backdropFilter: "blur(16px)", padding: "30px", borderRadius: "14px", border: `1px solid ${theme.cardBorder}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
              <div>
                <h2 style={{ color: theme.textMain, margin: 0, fontSize: "17px", fontWeight: "600" }}>🎙️ AI Audio Podcast Studio</h2>
                <p style={{ color: theme.textMuted, margin: "4px 0 0 0", fontSize: "13.5px" }}>Alex & Sam live audio breakdown session with natural distinct voice profiles.</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {isPlaying && (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center", height: "26px" }}>
                    <div className="wave-line" style={{ animationDelay: "0s" }}></div>
                    <div className="wave-line" style={{ animationDelay: "0.2s" }}></div>
                    <div className="wave-line" style={{ animationDelay: "0.4s" }}></div>
                    <div className="wave-line" style={{ animationDelay: "0.1s" }}></div>
                    <div className="wave-line" style={{ animationDelay: "0.3s" }}></div>
                  </div>
                )}
                <button 
                  onClick={handlePlayAudio}
                  className="btn-action"
                  style={{ background: isPlaying ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "13.5px" }}
                >
                  {isPlaying ? "⏸️ Pause Audio" : "▶️ Play Voice Stream"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "420px", overflowY: "auto", paddingRight: "6px" }}>
              {result.podcast_script?.map((item, index) => {
                const isActive = currentSpeakerIndex === index;
                return (
                  <div 
                    key={index} 
                    style={{ 
                      backgroundColor: isActive ? "rgba(14, 165, 233, 0.15)" : theme.inputBg, 
                      padding: "16px 18px", 
                      borderRadius: "12px", 
                      border: isActive ? "1px solid #0ea5e9" : `1px solid ${theme.cardBorder}`,
                      transform: isActive ? "scale(1.01)" : "scale(1)",
                      boxShadow: isActive ? "0 0 20px rgba(14, 165, 233, 0.25)" : "none",
                      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                  >
                    <strong style={{ color: item.speaker === "Alex" ? "#0ea5e9" : "#f43f5e", fontSize: "13.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.speaker}: </strong>
                    <span style={{ color: theme.textMain, fontSize: "14px", display: "inline-block", marginTop: "4px", lineHeight: "1.6" }}>{item.line}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;