import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { workspaceNavigation } from './WorkspaceNavigation';

export const Header = () => {
  const {activeTab,setActiveTab} = useApp();
  const [open,setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = workspaceNavigation.find(item=>(item.tabs as string[]).includes(activeTab));
  useEffect(()=>{
    if(!open)return;
    closeRef.current?.focus();
    const old=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setOpen(false);
      if(event.key==='Tab'){
        const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('#mobile-workspace-menu button'));
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return ()=>{document.body.style.overflow=old;document.removeEventListener('keydown',onKey);toggleRef.current?.focus();};
  },[open]);
  return <>
    <header className="workspace-mobile-header"><button ref={toggleRef} onClick={()=>setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls="mobile-workspace-menu"><Menu/></button><span><Zap/>Auto Replies</span><small>{current?.label||'Workspace'}</small></header>
    {open&&<div className="mobile-menu-overlay" onClick={()=>setOpen(false)}><aside id="mobile-workspace-menu" role="dialog" aria-modal="true" aria-label="Navigation" onClick={e=>e.stopPropagation()}><div className="mobile-menu-title"><strong>Auto Replies</strong><button ref={closeRef} aria-label="Close navigation" onClick={()=>setOpen(false)}><X/></button></div><nav>{workspaceNavigation.map(item=>{const Icon=item.icon;return <button key={item.id} aria-current={(item.tabs as string[]).includes(activeTab)?'page':undefined} onClick={()=>{setActiveTab(item.id);setOpen(false);}}><Icon/>{item.label}</button>;})}</nav></aside></div>}
  </>;
};
