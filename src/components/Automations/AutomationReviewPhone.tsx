import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Image, Info, Instagram, MoreHorizontal, Phone, Send, Video } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { matchesPreviewMessage } from '../../lib/automationPresentation';

type Props = { type: 'dm'|'comment'|'story_reply'; message: string; buttons: {label:string;url:string}[]; mode: string; keywords: string[]; media?: {id:string;thumbnail_url?:string;media_url?:string;media_type?:string;caption?:string} };
export const AutomationReviewPhone = ({type,message,buttons,mode,keywords,media}: Props) => {
  const { instagramAccount } = useApp();
  const [input,setInput] = useState('');
  const [conversation,setConversation] = useState<{text:string;matched:boolean}[]>([]);
  const chat = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify([type,message,buttons,mode,keywords,media?.id]);
  useEffect(() => { setConversation([]); setInput(''); }, [signature]);
  useEffect(() => { if(chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [conversation]);
  const username = (instagramAccount?.username || 'your_business').replace(/^@/,'');
  const avatar = instagramAccount?.profile_pic_url;
  const thumbnail = media?.thumbnail_url || (media?.media_type === 'VIDEO' ? '' : media?.media_url);
  const send = (event: React.FormEvent) => {
    event.preventDefault(); const text = input.trim(); if (!text) return;
    setConversation(old => [...old.slice(-19), {text,matched:matchesPreviewMessage(text,mode,keywords)}]); setInput('');
  };
  return <aside className="ai-phone-preview-section min-w-0" aria-label="Test automation">
    <div className="ai-phone-preview-heading"><div><h3>Test your automation</h3><p>Type a {type === 'comment' ? 'comment' : type === 'story_reply' ? 'story reply' : 'message'} to test your saved reply rules.</p></div><span className="ai-preview-label">Preview only</span></div>
    <div className="ai-phone-shell"><div className="ai-phone-bezel"><div className="ai-phone-screen">
      <div className="ai-phone-statusbar" aria-hidden="true"><span>9:41</span><span className="ai-phone-island"/><span className="ai-phone-status-icons">5G ▮▮▮ ●</span></div>
      <div className="ai-instagram-header"><ArrowLeft size={22} aria-hidden="true"/><div className="ai-instagram-profile"><span className="ai-instagram-avatar">{avatar ? <img src={avatar} alt=""/> : <span>{username.slice(0,2).toUpperCase()}</span>}</span><span className="ai-instagram-profile-copy"><strong>@{username}</strong><small>Instagram business</small></span></div><div className="ai-instagram-actions" aria-hidden="true"><Phone/><Video/><MoreHorizontal/></div></div>
      <div className="ai-instagram-chat" ref={chat} role="log" aria-label="Automation test conversation" aria-live="polite">
        {type !== 'dm' && <section aria-label="Selected Instagram content" className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{thumbnail ? <img src={thumbnail} alt={type === 'comment' ? 'Selected post or reel' : 'Selected story'} className="max-h-32 w-full object-cover"/> : <div className="flex h-24 items-center justify-center gap-2 text-xs text-slate-500"><Image size={20}/>{type === 'comment' ? 'Selected post or reel' : 'Selected story'}</div>}{media?.caption && <p className="break-words p-2 text-xs">{media.caption}</p>}</section>}
        {!conversation.length && <p className="my-8 px-3 text-center text-xs leading-5 text-slate-500">Start by typing below. {mode === 'keywords' ? 'A reply appears only when your message contains a configured keyword.' : 'Your automatic reply appears after you send a test message.'}</p>}
        {conversation.map((entry,index) => <React.Fragment key={index}>
          <div className="ai-ig-message-row ai-ig-message-row-user"><div className="ai-ig-bubble ai-ig-bubble-user">{entry.text}</div></div>
          {entry.matched ? <>{type === 'comment' && <p className="mb-3 text-center text-[10px] text-slate-500">Public reply: Sent you a DM 📩</p>}<div className="ai-ig-message-row ai-ig-message-row-business"><span className="ai-ig-mini-avatar">{avatar ? <img src={avatar} alt=""/> : <Instagram/>}</span><div className="ai-ig-bubble ai-ig-bubble-business">{message}{buttons.length > 0 && <div className="mt-3 space-y-2">{buttons.map((button,i) => <span key={i} className="block rounded-lg border border-slate-200 bg-white p-2 text-center font-semibold text-blue-600">{button.label || 'Button'}</span>)}</div>}</div></div></> : <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">No matching keyword. This automation would not reply.</p>}
        </React.Fragment>)}
      </div>
      <form onSubmit={send} className="ai-instagram-composer"><span className="ai-ig-camera-button" aria-hidden="true"><Camera size={18}/></span><input aria-label="Test customer message" placeholder={type === 'comment' ? 'Write a comment…' : 'Message…'} value={input} onChange={event=>setInput(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent px-1 text-xs outline-none"/><button type="submit" disabled={!input.trim()} aria-label="Send test message" className="flex h-9 w-9 items-center justify-center rounded-full text-blue-600 disabled:opacity-40"><Send size={18}/></button></form>
    </div></div></div>
    <button type="button" onClick={()=>{setConversation([]);setInput('');}} className="mt-2 text-xs font-semibold text-indigo-600">Reset test</button>
    <p className="ai-phone-preview-note"><Info size={15}/>Local test only. Nothing is sent to Instagram.</p>
  </aside>;
};
