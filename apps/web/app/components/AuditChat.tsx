'use client';

import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type AuditChatProps = {
  runId: string;
  findings: Array<{
    issue: string;
    why: string;
    fix: string;
    impact: string;
    effort: string;
    kind: string;
  }>;
  summary?: {
    plan?: {
      quickWins: string[];
      next: string[];
      experiments: Array<{
        hypothesis: string;
        variant: string;
        metric: string;
      }>;
    };
  } | null;
  stats: {
    findingsCount: number;
    highImpactFindings: number;
    artifactsCount: number;
  };
  target: string;
  status?: 'queued' | 'running' | 'partial' | 'completed' | 'failed';
};

export type AuditChatRef = {
  sendMessage: (message: string) => void;
  openLeadForm: () => void;
};

const QUICK_ACTIONS = [
  'Which findings should I prioritize?',
  'How do I fix the high impact findings?',
  'Explain the quick wins in detail',
  'What are the most critical issues?',
];

export const AuditChat = forwardRef<AuditChatRef, AuditChatProps>(
  ({ runId, findings, summary, stats, target, status }, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadFormData, setLeadFormData] = useState({
    email: '',
    name: '',
  });
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [salesFormSubmitted, setSalesFormSubmitted] = useState(false);
  const [salesFormData, setSalesFormData] = useState({
    email: '',
    name: '',
    phone: '',
  });
  const [isSubmittingSales, setIsSubmittingSales] = useState(false);
  const [hasShownIntro, setHasShownIntro] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const messageIdCounter = useRef(0);
  
  // Get unique categories from findings
  const availableCategories = Array.from(new Set(findings.map(f => f.kind))).filter(Boolean);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ensure we're on the client before rendering
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Auto-scroll to bottom when new messages arrive or error appears
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, error]);

  // Auto-scroll when lead form or sales form opens
  useEffect(() => {
    if (showLeadForm || showSalesForm) {
      // Use setTimeout to ensure the DOM has updated
      setTimeout(() => {
        messagesContainerRef.current?.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [showLeadForm, showSalesForm]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Show intro message when audit is completed (only on client)
  useEffect(() => {
    if (!isMounted) return; // Only run on client
    
    const isCompleted = status === 'completed' || status === 'partial' || status === 'failed';
    const hasFindings = findings.length > 0;
    
    if (isCompleted && hasFindings && !hasShownIntro && messages.length === 0 && !showLeadForm && !showSalesForm) {
      messageIdCounter.current += 1;
      const introMessage: Message = {
        id: `intro-${messageIdCounter.current}`,
        role: 'assistant',
        content: `Your audit for ${target} is complete — we found ${stats.findingsCount} issues, ${stats.highImpactFindings} of which are high-impact and costing you visibility right now.

The good news: most of these can be fixed fast. Our Infrastructure Sprint typically resolves the critical technical debt in the first month using our Velocity Engine.

Want me to walk you through the key liabilities, or would you prefer to get straight on a call with our SEO team to discuss the fix?`,
        timestamp: new Date(), // Safe to use in useEffect (client-only)
      };
      
      // Small delay to make it feel natural
      setTimeout(() => {
        setMessages([introMessage]);
        setHasShownIntro(true);
      }, 500);
    }
  }, [isMounted, status, findings.length, stats, target, hasShownIntro, messages.length, showLeadForm, showSalesForm]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    messageIdCounter.current += 1;
    const userMessage: Message = {
      id: `user-${messageIdCounter.current}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/audits/${runId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content.trim(),
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get response' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      messageIdCounter.current += 1;
      const assistantMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadFormData.email.trim()) return;

    setIsSubmittingLead(true);
    try {
      const response = await fetch(`/api/audits/${runId}/lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...leadFormData,
          selectedCategories: availableCategories,
          categoryOrder: availableCategories,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit lead');
      }

      setLeadSubmitted(true);
      setShowLeadForm(false);
    } catch (err) {
      console.error('Error submitting lead:', err);
      // Don't show error to user, just log it
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesFormData.name.trim() || !salesFormData.email.trim()) return;

    setIsSubmittingSales(true);
    try {
      const response = await fetch(`/api/audits/${runId}/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(salesFormData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit sales contact');
      }

      setSalesFormSubmitted(true);
      setShowSalesForm(false);
    } catch (err) {
      console.error('Error submitting sales contact:', err);
      // Don't show error to user, just log it
    } finally {
      setIsSubmittingSales(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Expose sendMessage and openLeadForm functions via ref
  useImperativeHandle(ref, () => ({
    sendMessage: (message: string) => {
      sendMessage(message);
    },
    openLeadForm: () => {
      setShowSalesForm(true);
      setTimeout(() => {
        messagesContainerRef.current?.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    },
  }));

  // Don't render until mounted to avoid hydration issues
  if (!isMounted) {
    return (
      <div className="flex flex-col h-full relative" style={{ backgroundColor: '#0F0F0F' }}>
        <div className="px-6 py-4 border-b border-[#212121] flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src="/ai-magic.svg" alt="AI magic" className="h-5 w-5" />
            <h3 className="text-lg font-normal" style={{ color: '#E0E0E0' }}>AI Audit Assistant</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
          <div className="text-center py-8 text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: '#0F0F0F' }}>
      {/* Title */}
      <div className="px-6 py-4 border-b border-[#212121] flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/ai-magic.svg" alt="AI magic" className="h-5 w-5" />
          <h3 className="text-lg font-normal" style={{ color: '#E0E0E0' }}>AI Audit Assistant</h3>
        </div>
      </div>
      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
        {messages.length === 0 && !showLeadForm ? (
          <div className="text-center py-8">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium mb-2" style={{ color: '#E0E0E0' }}>Start a conversation</p>
            <p className="text-xs text-gray-500 mb-4">
              Ask questions about your findings, get implementation guidance, or prioritize your fixes.
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[85%] rounded-xl px-4 py-2"
                    style={{ color: '#E0E0E0' }}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Lead Capture Form - Show at bottom after all messages */}
            {showLeadForm && !leadSubmitted && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl p-4" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                  <div className="mb-3">
                    <img src="/Logo2_Vector.svg" alt="Logo" className="mb-3 h-6" />
                    <h4 className="text-lg font-normal mb-1" style={{ color: '#E0E0E0', lineHeight: '23px' }}>Download your audit report</h4>
                    <p className="mb-2" style={{ color: '#E0E0E0', fontSize: '14px' }}>
                      Share your email and we'll send you the full audit report.
                    </p>
                  </div>
                  <form onSubmit={handleLeadSubmit} className="space-y-2">
                    <input
                      type="text"
                      value={leadFormData.name}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 text-sm bg-transparent border-0 border-b rounded-none focus:outline-none placeholder:text-[#666666]"
                      style={{ color: '#E0E0E0', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5', borderBottomColor: '#212121' }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#212121'}
                      onBlur={(e) => e.target.style.borderBottomColor = '#212121'}
                      placeholder="Name (optional)"
                      disabled={isSubmittingLead}
                    />
                    <input
                      type="email"
                      required
                      value={leadFormData.email}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 text-sm bg-transparent border-0 border-b rounded-none focus:outline-none placeholder:text-[#666666]"
                      style={{ color: '#E0E0E0', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5', borderBottomColor: '#212121' }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#212121'}
                      onBlur={(e) => e.target.style.borderBottomColor = '#212121'}
                      placeholder="your@email.com"
                      disabled={isSubmittingLead}
                    />
                    <div className="flex gap-2 items-center pt-1 justify-between">
                      <button
                        type="submit"
                        disabled={!leadFormData.email.trim() || isSubmittingLead}
                        className="px-4 py-3 text-sm font-normal rounded-full disabled:cursor-not-allowed transition-all hover:opacity-90"
                        style={{ backgroundColor: (!leadFormData.email.trim() || isSubmittingLead) ? '#2A2A2A' : '#FB3B24', color: (!leadFormData.email.trim() || isSubmittingLead) ? '#666666' : '#ffffff', height: '42px', boxSizing: 'border-box' }}
                      >
                        {isSubmittingLead ? 'Submitting...' : 'Get report'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLeadForm(false);
                        }}
                        className="text-sm hover:text-white transition-colors"
                        style={{ color: '#888888' }}
                        disabled={isSubmittingLead}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {leadSubmitted && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl bg-green-50 border border-green-200 px-4 py-2">
                  <p className="text-xs text-green-700">Thanks! We'll be in touch soon. ✨</p>
                </div>
              </div>
            )}

            {/* Sales Contact Form - Show at bottom after all messages */}
            {showSalesForm && !salesFormSubmitted && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl p-4" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                  <div className="mb-3">
                    <img src="/Logo2_Vector.svg" alt="Logo" className="mb-3 h-6" />
                    <h4 className="text-lg font-normal mb-1" style={{ color: '#E0E0E0', lineHeight: '23px' }}>Connect with our sales team</h4>
                    <p className="mb-2" style={{ color: '#E0E0E0', fontSize: '14px' }}>
                      Share your details and we'll reach out to discuss how we can help.
                    </p>
                  </div>
                  <form onSubmit={handleSalesSubmit} className="space-y-2">
                    <input
                      type="text"
                      required
                      value={salesFormData.name}
                      onChange={(e) => setSalesFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 text-sm bg-transparent border-0 border-b rounded-none focus:outline-none placeholder:text-[#666666]"
                      style={{ color: '#E0E0E0', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5', borderBottomColor: '#212121' }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#212121'}
                      onBlur={(e) => e.target.style.borderBottomColor = '#212121'}
                      placeholder="Name"
                      disabled={isSubmittingSales}
                    />
                    <input
                      type="email"
                      required
                      value={salesFormData.email}
                      onChange={(e) => setSalesFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 text-sm bg-transparent border-0 border-b rounded-none focus:outline-none placeholder:text-[#666666]"
                      style={{ color: '#E0E0E0', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5', borderBottomColor: '#212121' }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#212121'}
                      onBlur={(e) => e.target.style.borderBottomColor = '#212121'}
                      placeholder="Email"
                      disabled={isSubmittingSales}
                    />
                    <input
                      type="tel"
                      value={salesFormData.phone}
                      onChange={(e) => setSalesFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 text-sm bg-transparent border-0 border-b rounded-none focus:outline-none placeholder:text-[#666666]"
                      style={{ color: '#E0E0E0', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5', borderBottomColor: '#212121' }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#212121'}
                      onBlur={(e) => e.target.style.borderBottomColor = '#212121'}
                      placeholder="Phone (optional)"
                      disabled={isSubmittingSales}
                    />
                    <div className="flex gap-2 items-center pt-1 justify-between">
                      <button
                        type="submit"
                        disabled={!salesFormData.name.trim() || !salesFormData.email.trim() || isSubmittingSales}
                        className="px-4 py-3 text-sm font-normal rounded-full disabled:cursor-not-allowed transition-all hover:opacity-90"
                        style={{ backgroundColor: (!salesFormData.name.trim() || !salesFormData.email.trim() || isSubmittingSales) ? '#2A2A2A' : '#FB3B24', color: (!salesFormData.name.trim() || !salesFormData.email.trim() || isSubmittingSales) ? '#666666' : '#ffffff', height: '42px', boxSizing: 'border-box' }}
                      >
                        {isSubmittingSales ? 'Submitting...' : 'Get in touch'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSalesForm(false);
                        }}
                        className="text-sm hover:text-white transition-colors"
                        style={{ color: '#888888' }}
                        disabled={isSubmittingSales}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {salesFormSubmitted && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl bg-green-50 border border-green-200 px-4 py-2">
                  <p className="text-xs text-green-700">Thanks! Our sales team will reach out soon. ✨</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
        {/* Error message - show in messages area */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 flex-shrink-0" style={{ backgroundColor: '#0F0F0F' }}>
        {/* CTA Button */}
        <div className="mb-4 flex flex-col items-end">
          <button
            onClick={() => {
              setShowSalesForm(true);
              setTimeout(() => {
                messagesContainerRef.current?.scrollTo({
                  top: messagesContainerRef.current.scrollHeight,
                  behavior: 'smooth'
                });
              }, 100);
            }}
            className="py-3 px-4 text-sm font-medium rounded-full transition-all hover:opacity-90"
            style={{ backgroundColor: '#FB3B24', color: '#ffffff' }}
          >
            Talk to an SEO Strategist 🚀
          </button>
          <p className="text-xs mt-2" style={{ color: '#666666' }}>
            Get a custom fix plan from our senior team
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null); // Clear error when user types
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your audit..."
            className="w-full px-3 py-2 text-sm border border-[#212121] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FB3B24] focus:border-transparent resize-none bg-transparent placeholder:text-[#666666]"
            style={{ color: '#E0E0E0' }}
            rows={3}
            disabled={isLoading}
          />
          <div className="flex justify-between items-center gap-2">
            <p className="text-xs hidden xl:block" style={{ color: '#666666' }}>Press Enter to send</p>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 text-sm font-medium rounded-full disabled:cursor-not-allowed transition-all hover:opacity-90 flex-shrink-0"
              style={{ backgroundColor: (!input.trim() || isLoading) ? '#2A2A2A' : '#FB3B24', color: (!input.trim() || isLoading) ? '#666666' : '#ffffff' }}
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

AuditChat.displayName = 'AuditChat';

