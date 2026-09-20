import React, { useState } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Sparkles,
  Bot,
  BotOff,
  UserCheck,
  Instagram,
  Trash2,
  CheckSquare,
  Square,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from '../Common/UserAvatar';

export const InboxPage: React.FC = () => {
  const {
    inboxMessages,
    instagramAccount,
    contacts,
    sendManualReply,
    isAiPausedForUser,
    toggleAiForUser,
    deleteInboxThread,
    deleteInboxThreadsBulk,
  } = useApp();
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedThreadUsernames, setSelectedThreadUsernames] = useState<string[]>([]);
  
  const myUsername = (instagramAccount?.username || '').toLowerCase();

  const isTestOrMockHandle = (uname: string): boolean => {
    if (!uname) return true;
    const lower = uname.toLowerCase().trim();
    if (
      lower.includes('940977') ||
      lower.startsWith('user_940977') ||
      lower === 'webhook_test_user' ||
      lower.startsWith('user_') ||
      lower.includes('test_user')
    ) {
      return true;
    }
    return false;
  };

  // Group messages by target contact username (and include all contacts)
  const groupedUsers = Array.from(
    new Set<string>([
      ...(inboxMessages || [])
        .filter((m) => !m?.is_test && !isTestOrMockHandle(m?.from_username || m?.from_ig_id || ''))
        .map((m) => m?.from_username || m?.from_ig_id || '')
        .filter(
          (uname): uname is string =>
            typeof uname === 'string' &&
            Boolean(uname.trim()) &&
            (!myUsername || uname.toLowerCase() !== myUsername)
        ),
      ...(contacts || [])
        .filter((c) => !c?.is_test && !isTestOrMockHandle(c?.ig_username || c?.ig_user_id || ''))
        .map((c) => c?.ig_username || c?.ig_user_id || '')
        .filter(
          (uname): uname is string =>
            typeof uname === 'string' &&
            Boolean(uname.trim()) &&
            (!myUsername || uname.toLowerCase() !== myUsername)
        ),
    ])
  ).filter((uname: string) => uname.toLowerCase().includes((search || '').toLowerCase()));

  const [activeUsername, setActiveUsername] = useState<string>('');

  const selectedUser = (activeUsername && groupedUsers.includes(activeUsername))
    ? activeUsername
    : (groupedUsers.length > 0 ? groupedUsers[0] : '');

  // Active conversation thread sorted chronologically
  const currentThread = selectedUser
    ? (inboxMessages || [])
        .filter((m) => !m?.is_test)
        .filter(
          (m) =>
            (m?.from_username && m.from_username.toLowerCase() === selectedUser.toLowerCase()) ||
            (m?.from_ig_id && m.from_ig_id.toLowerCase() === selectedUser.toLowerCase())
        )
        .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
    : [];

  const isCurrentAiPaused = selectedUser ? isAiPausedForUser(selectedUser) : false;

  const getContactAvatar = (uname: string): string | null => {
    if (!uname) return null;
    const clean = uname.trim().replace(/^@/, '').toLowerCase();
    const contact = (contacts || []).find(
      (c) =>
        (c?.ig_username && c.ig_username.trim().replace(/^@/, '').toLowerCase() === clean) ||
        (c?.ig_user_id && c.ig_user_id.toLowerCase() === clean)
    );
    if (contact?.avatar_url && !contact.avatar_url.includes('api.dicebear.com')) {
      return contact.avatar_url;
    }
    const msgWithAvatar = (inboxMessages || []).find(
      (m) =>
        (((m?.from_username && m.from_username.trim().replace(/^@/, '').toLowerCase() === clean) ||
          (m?.from_ig_id && m.from_ig_id.toLowerCase() === clean))) &&
        m.from_avatar &&
        !m.from_avatar.includes('api.dicebear.com')
    );
    return msgWithAvatar?.from_avatar || null;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && selectedUser) {
      sendManualReply(selectedUser, inputText.trim());
      setInputText('');
    }
  };

  const handleRemoveThread = async (usernameToRemove: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (
      window.confirm(
        `Are you sure you want to permanently delete the chat thread for @${usernameToRemove} from the database?`
      )
    ) {
      await deleteInboxThread(usernameToRemove);
      setSelectedThreadUsernames((prev) => prev.filter((u) => u.toLowerCase() !== usernameToRemove.toLowerCase()));
      if (activeUsername.toLowerCase() === usernameToRemove.toLowerCase()) {
        const remaining = groupedUsers.filter((u) => u.toLowerCase() !== usernameToRemove.toLowerCase());
        setActiveUsername(remaining.length > 0 ? remaining[0] : '');
      }
    }
  };

  const handleBulkDeleteThreads = async () => {
    if (selectedThreadUsernames.length === 0) return;
    if (
      window.confirm(
        `Are you sure you want to permanently delete ${selectedThreadUsernames.length} conversation thread(s) from the database?`
      )
    ) {
      await deleteInboxThreadsBulk(selectedThreadUsernames);
      setSelectedThreadUsernames([]);
      const remaining = groupedUsers.filter((u) => !selectedThreadUsernames.map((s) => s.toLowerCase()).includes(u.toLowerCase()));
      setActiveUsername(remaining.length > 0 ? remaining[0] : '');
    }
  };

  const isAllThreadsSelected =
    groupedUsers.length > 0 &&
    groupedUsers.every((u) => selectedThreadUsernames.includes(u));

  const toggleSelectAllThreads = () => {
    if (isAllThreadsSelected) {
      setSelectedThreadUsernames([]);
    } else {
      setSelectedThreadUsernames([...groupedUsers]);
    }
  };

  const toggleSelectOneThread = (u: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedThreadUsernames((prev) =>
      prev.includes(u) ? prev.filter((item) => item !== u) : [...prev, u]
    );
  };

  return (
    <div className="p-8 bg-[#F7FAFF] min-h-screen">
      {/* Top Banner / Header Actions */}
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Instagram className="w-5 h-5 text-pink-600" />
            <span>Instagram Direct Messages & Inbox</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Instagram conversations and AI auto-reply management
          </p>
        </div>

      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[78vh] flex flex-col md:flex-row">
        {/* Left Conversation List */}
        <div className="w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-950 text-sm">Conversations ({groupedUsers.length})</h3>
              {selectedThreadUsernames.length > 0 && (
                <button
                  onClick={handleBulkDeleteThreads}
                  className="bg-red-600 hover:bg-red-700 text-white font-black text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete ({selectedThreadUsernames.length})</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 stroke-[2.2]" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden"
                />
              </div>
              {groupedUsers.length > 0 && (
                <button
                  onClick={toggleSelectAllThreads}
                  title={isAllThreadsSelected ? "Deselect All" : "Select All"}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  {isAllThreadsSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#3B5BFF]" />
                  ) : (
                    <Square className="w-4 h-4 stroke-[2.2]" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {groupedUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 font-medium">
                <p>No active conversations yet.</p>
              </div>
            ) : (
              groupedUsers.map((username) => {
                const userMsgs = inboxMessages.filter((m) => m.from_username?.toLowerCase() === username.toLowerCase());
                const lastMsg = userMsgs[0] || userMsgs[userMsgs.length - 1];
                const isActive = selectedUser.toLowerCase() === username.toLowerCase();
                const isUserAiPaused = isAiPausedForUser(username);
                const avatar = getContactAvatar(username);
                const isSelected = selectedThreadUsernames.includes(username);

                return (
                  <div
                    key={username}
                    onClick={() => setActiveUsername(username)}
                    className={`group w-full p-3.5 text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isActive ? 'bg-white border-l-4 border-l-[#3B5BFF] shadow-2xs' : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Select Checkbox */}
                      <button
                        onClick={(e) => toggleSelectOneThread(username, e)}
                        className="text-slate-300 hover:text-slate-600 cursor-pointer shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#3B5BFF]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <UserAvatar
                        src={avatar}
                        username={username}
                        size="md"
                        isAiPaused={isUserAiPaused}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900 truncate">@{username}</span>
                          {isUserAiPaused ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black shrink-0">
                              Human
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black shrink-0">
                              AI ON
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {lastMsg ? lastMsg.message_text : 'Instagram Direct Message'}
                        </div>
                      </div>
                    </div>

                    {/* Single Remove Button on Hover */}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveThread(username, e)}
                      title={`Remove chat with @${username} permanently from database`}
                      className="opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-600 p-1.5 rounded-lg transition-all shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Active Message Thread */}
        <div className="flex-1 flex flex-col bg-white">
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/40">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-[#3B5BFF] flex items-center justify-center mb-4 border border-indigo-100 shadow-sm">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-slate-900 mb-1">Instagram Live Message Inbox</h3>
              <p className="text-xs text-slate-600 max-w-md mb-6 leading-relaxed">
                Incoming Instagram DMs, story replies, and comments will show up here in real time. You can send manual replies or test the auto-reply engine below.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={getContactAvatar(selectedUser)}
                    username={selectedUser}
                    size="md"
                    isAiPaused={isCurrentAiPaused}
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <span>@{selectedUser}</span>
                      {isCurrentAiPaused ? (
                        <span className="text-[10px] font-extrabold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-amber-700" />
                          <span>Human Takeover (AI Paused)</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>AI Auto-Reply Active</span>
                        </span>
                      )}
                    </h4>
                    <p className="text-[10px] text-slate-500">Instagram DM Thread • Synced from Instagram</p>
                  </div>
                </div>

                {/* AI Toggle Switch & Delete Thread Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAiForUser(selectedUser)}
                    title={isCurrentAiPaused ? 'Click to Enable AI Auto-Reply' : 'Click to Disable AI (Human Takeover)'}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer ${
                      isCurrentAiPaused
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isCurrentAiPaused ? (
                        <>
                          <BotOff className="w-4 h-4 text-amber-700" />
                          <span>AI Auto-Reply: <strong className="text-amber-800 uppercase">OFF</strong></span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4 text-emerald-600" />
                          <span>AI Auto-Reply: <strong className="text-emerald-700 uppercase">ON</strong></span>
                        </>
                      )}
                    </div>

                    {/* Toggle Pill */}
                    <div
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                        isCurrentAiPaused ? 'bg-amber-200 justify-start' : 'bg-emerald-600 justify-end'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white shadow-md"></div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveThread(selectedUser)}
                    title="Delete entire chat thread from database permanently"
                    className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs py-1.5 px-3 rounded-xl border border-red-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Chat Bubbles Container */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/30">
                {/* Human Interference Alert Banner if AI is Paused */}
                {isCurrentAiPaused && (
                  <div className="bg-amber-50/95 border border-amber-200/90 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold">
                        <BotOff className="w-5 h-5 text-amber-700" />
                      </div>
                      <div>
                        <div className="font-extrabold text-amber-950 flex items-center gap-2">
                          <span>Human Interference Detected</span>
                          <span className="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md">
                            AI Responses Stopped
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          A human agent sent a manual message or paused AI for @{selectedUser}. AI will not auto-respond until re-enabled.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleAiForUser(selectedUser)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>Turn AI Back ON</span>
                    </button>
                  </div>
                )}

                {currentThread.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-medium">
                    No messages in this conversation.
                  </div>
                ) : (
                  currentThread.map((msg) => {
                    const isOut = msg.direction === 'out';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} space-y-1`}>
                        <div
                          className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                            isOut
                              ? 'bg-[#3B5BFF] text-white rounded-br-xs'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                          }`}
                        >
                          <p>{msg.message_text}</p>

                          {msg.is_automated ? (
                            <div className="mt-2 pt-2 border-t border-white/20 text-[10px] text-indigo-100 flex items-center gap-1 font-semibold">
                              <Bot className="w-3 h-3 text-amber-300" />
                              <span>Automated Reply</span>
                            </div>
                          ) : isOut ? (
                            <div className="mt-2 pt-2 border-t border-white/20 text-[10px] text-blue-100 flex items-center gap-1 font-semibold">
                              <UserCheck className="w-3 h-3 text-amber-200" />
                              <span>Manual Reply (AI Paused)</span>
                            </div>
                          ) : null}
                        </div>

                        <span className="text-[10px] text-slate-400 px-1 font-medium">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input Box */}
              <div className="p-4 border-t border-slate-200 bg-white space-y-2">
                <form onSubmit={handleSend} className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder={`Send a manual DM reply to @${selectedUser}...`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="bg-[#3B5BFF] hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send DM</span>
                  </button>
                </form>

                <div className="text-[10px] text-slate-400 flex items-center justify-between px-1 font-medium">
                  <span>💡 Sending a manual message automatically turns AI auto-reply OFF for this contact.</span>
                  {isCurrentAiPaused && (
                    <button
                      type="button"
                      onClick={() => toggleAiForUser(selectedUser)}
                      className="text-amber-600 hover:underline font-bold cursor-pointer"
                    >
                      Turn AI ON
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
