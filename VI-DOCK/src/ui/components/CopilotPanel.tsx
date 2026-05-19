import { useState, useEffect, useRef } from 'react';
import { useDockingStore } from '../../store/dockingStore';
import { apiService } from '../../services/apiService';
import {
    Send,
    Sparkles,
    Cpu,
    Dna,
    Pill,
    Trash2,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    Loader2,
    HelpCircle
} from 'lucide-react';
import '../styles/CopilotPanel.css';

interface Message {
    sender: 'user' | 'assistant';
    text: string;
    trace?: string[];
    tools?: string[];
    mode?: string;
    timestamp: number;
}

export function CopilotPanel() {
    const { receptorFile, ligandFile } = useDockingStore();
    
    // UI Settings states
    const [useRawGemma, setUseRawGemma] = useState(false);
    const [targetProtein, setTargetProtein] = useState('');
    const [ligandSmiles, setLigandSmiles] = useState('');
    const [showSettings, setShowSettings] = useState(true);
    
    // Chat states
    const [messages, setMessages] = useState<Message[]>([
        {
            sender: 'assistant',
            text: 'Hello! I am your AI Therapeutic Copilot. Provide a biological target or ligand SMILES above, and ask me about pharmacology, safety concerns, side effects, or drug repurposing opportunities.',
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedTraceIndex, setExpandedTraceIndex] = useState<number | null>(null);
    
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-prepopulate target protein & ligand from store
    useEffect(() => {
        if (receptorFile?.name) {
            const cleanReceptorName = receptorFile.name.replace(/\.[^/.]+$/, "").toUpperCase();
            setTargetProtein(prev => prev || cleanReceptorName);
        }
        if (ligandFile?.name) {
            const cleanLigandName = ligandFile.name.replace(/\.[^/.]+$/, "");
            setLigandSmiles(prev => prev || cleanLigandName);
        }
    }, [receptorFile, ligandFile]);

    // Scroll to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async (textToSend: string) => {
        if (!textToSend.trim() || loading) return;
        
        setError(null);
        setLoading(true);
        const userMessage: Message = {
            sender: 'user',
            text: textToSend,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');

        try {
            const response = await apiService.queryCopilot(
                textToSend,
                targetProtein || undefined,
                ligandSmiles || undefined,
                useRawGemma
            );

            const assistantMessage: Message = {
                sender: 'assistant',
                text: response.recommendation,
                trace: response.reasoning_steps,
                tools: response.tools_used,
                mode: response.mode,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: any) {
            setError(err.message || 'Failed to get a response from the AI Copilot backend.');
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([
            {
                sender: 'assistant',
                text: 'Chat cleared. Ask me anything about therapeutic analysis.',
                timestamp: Date.now()
            }
        ]);
        setError(null);
        setExpandedTraceIndex(null);
    };

    const toggleTrace = (index: number) => {
        setExpandedTraceIndex(expandedTraceIndex === index ? null : index);
    };

    const suggestionPrompts = [
        "What are the major side effects associated with inhibiting this target?",
        "Are there any drug-drug interactions with approved ligands for this target?",
        "What clinical trials are ongoing for drug candidates targeting this protein?"
    ];

    return (
        <div className="copilot-panel">
            {/* Header */}
            <div className="copilot-header">
                <div>
                    <h2><Sparkles size={20} style={{ color: 'var(--accent-secondary)' }} /> AI Copilot</h2>
                    <p>Therapeutic & Pharmacological reasoning assistant</p>
                </div>
                <div className="mode-badge">
                    <Cpu size={12} />
                    {useRawGemma ? 'Gemma API' : 'TxAgent Active'}
                </div>
            </div>

            {/* Context Inputs Dashboard */}
            <div className="copilot-settings">
                <div className="settings-row">
                    <span className="settings-label" onClick={() => setShowSettings(!showSettings)} style={{ cursor: 'pointer' }}>
                        {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        Context Configuration
                    </span>
                    <div className="settings-toggle">
                        <button
                            className={`toggle-btn ${!useRawGemma ? 'active' : ''}`}
                            onClick={() => setUseRawGemma(false)}
                            title="Use evidence-grounded multi-step tool reasoning"
                        >
                            TxAgent
                        </button>
                        <button
                            className={`toggle-btn ${useRawGemma ? 'active' : ''}`}
                            onClick={() => setUseRawGemma(true)}
                            title="Direct lightweight Gemma chat model"
                        >
                            Gemma Direct
                        </button>
                    </div>
                </div>

                {showSettings && (
                    <div className="inputs-grid">
                        <div className="context-input-group">
                            <label><Dna size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Target Protein</label>
                            <input
                                type="text"
                                className="context-field"
                                placeholder="Auto-fills from receptor (e.g. DRD2)"
                                value={targetProtein}
                                onChange={(e) => setTargetProtein(e.target.value)}
                            />
                        </div>
                        <div className="context-input-group">
                            <label><Pill size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Ligand context</label>
                            <input
                                type="text"
                                className="context-field"
                                placeholder="Auto-fills from ligand (SMILES/Name)"
                                value={ligandSmiles}
                                onChange={(e) => setLigandSmiles(e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Chat History */}
            <div className="chat-container">
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-bubble ${msg.sender}`}>
                        <div className="bubble-meta">
                            <span>{msg.sender === 'user' ? 'You' : 'Copilot'}</span>
                            {msg.mode && <span style={{ opacity: 0.7 }}>• {msg.mode}</span>}
                        </div>
                        <div className="bubble-text">
                            {msg.text.split('\n').map((para, pIdx) => {
                                if (para.startsWith('- ') || para.startsWith('* ')) {
                                    return <li key={pIdx} style={{ marginLeft: '12px', marginBottom: '4px' }}>{para.substring(2)}</li>;
                                }
                                return <p key={pIdx}>{para}</p>;
                            })}
                        </div>

                        {/* Reasoning steps trace drawer (if TxAgent was used and steps are present) */}
                        {msg.trace && msg.trace.length > 0 && (
                            <div className="reasoning-trace-container">
                                <div className="trace-header" onClick={() => toggleTrace(index)}>
                                    <span>Reasoning Steps & Evidence Log</span>
                                    {expandedTraceIndex === index ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                                
                                {expandedTraceIndex === index && (
                                    <div className="trace-body">
                                        {msg.trace.map((step, sIdx) => (
                                            <div key={sIdx} className="trace-step">
                                                <span className="trace-step-num">[{sIdx + 1}]</span>
                                                <span>{step}</span>
                                            </div>
                                        ))}
                                        {msg.tools && msg.tools.length > 0 && (
                                            <div className="tools-used-list">
                                                {msg.tools.map((tool, tIdx) => (
                                                    <span key={tIdx} className="tool-tag">
                                                        <HelpCircle size={10} /> {tool}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                
                {loading && (
                    <div className="chat-bubble assistant">
                        <div className="bubble-meta">
                            <span>Copilot thinking...</span>
                        </div>
                        <div className="loading-bubble">
                            <Loader2 size={16} className="spin-icon" style={{ marginRight: '8px', color: 'var(--accent-secondary)' }} />
                            <div className="loading-dots">
                                <span className="dot"></span>
                                <span className="dot"></span>
                                <span className="dot"></span>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={chatEndRef} />
            </div>

            {/* Error Message */}
            {error && (
                <div className="copilot-error">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Suggestions */}
            {messages.length === 1 && !loading && (
                <div className="suggestions-container">
                    {suggestionPrompts.map((prompt, pIdx) => (
                        <button
                            key={pIdx}
                            className="suggestion-chip"
                            onClick={() => handleSend(prompt)}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Form */}
            <div className="input-container">
                <button className="send-btn" onClick={clearChat} title="Clear Chat History" style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-secondary)' }}>
                    <Trash2 size={16} />
                </button>
                <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask about therapeutic target safety, mechanisms, side effects..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                    disabled={loading}
                />
                <button
                    className="send-btn"
                    onClick={() => handleSend(input)}
                    disabled={loading || !input.trim()}
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
