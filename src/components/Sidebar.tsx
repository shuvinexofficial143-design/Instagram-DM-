import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Instagram, LogOut, Settings, HelpCircle, ShieldCheck, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWorkspaceUsage } from '../hooks/useWorkspaceUsage';
import { usagePercent } from '../lib/planUsage';
import { UserAvatar } from './Common/UserAvatar';
import { workspaceNavigation } from './WorkspaceNavigation';

export const Sidebar = () => {
  const {activeTab,setActiveTab,user,firebaseUser,logout,instagramAccount,inboxMessages,setIsConnectModalOpen,isAdmin} = useApp();
  const usage = useWorkspaceUsage();
  const [collapsed,setCollapsed] = useState(()=>{try{return localStorage.getItem('sidebar_collapsed')==='true';}catch{return false;}});
  const toggle = () => setCollapsed(old=>{const next=!old;try{localStorage.setItem('sidebar_collapsed',String(next));}catch{}return next;});
  const unread = inboxMessages.filter(m=>m.direction==='in'&&!m.is_read).length;
  const name = firebaseUser?.displayName || user.name || 'Your account';
  const pct = usagePercent(usage.messageUsed,usage.messageLimit);
  return <aside className={'workspace-sidebar '+(collapsed?'is-collapsed':'')} aria-label="Workspace navigation">
    <div className="sidebar-brand"><Zap aria-hidden="true"/><span>Auto Replies</span></div>
    <button onClick={toggle} className="sidebar-collapse" aria-label={collapsed?'Expand navigation':'Collapse navigation'}>{collapsed?<ChevronRight/>:<ChevronLeft/>}</button>
    <button className={'sidebar-account '+(instagramAccount?'has-instagram':'')} onClick={()=>instagramAccount?setActiveTab('settings'):setIsConnectModalOpen(true)} aria-label={instagramAccount?'Manage Instagram account':'Connect Instagram'} title={instagramAccount?.username || 'Connect Instagram'}>
      {instagramAccount
        ? <span className="sidebar-instagram-avatar-ring"><UserAvatar src={instagramAccount.profile_pic_url} username={instagramAccount.username} size="sm"/></span>
        : <span className="sidebar-instagram-icon"><Instagram/></span>}
      <span className="sidebar-instagram-copy">
        <strong>{instagramAccount?'@'+instagramAccount.username:'Connect Instagram'}</strong>
        <small>{instagramAccount?.status==='connected'?<><i/>Connected Instagram</>:instagramAccount?'Needs attention':'Start here'}</small>
      </span>
    </button>
    <nav className="sidebar-menu">
      {workspaceNavigation.filter(item=>item.id!=='settings'&&item.id!=='help').map((item,index)=>{const Icon=item.icon;const active=(item.tabs as string[]).includes(activeTab);return <React.Fragment key={item.id}>
        {index===6&&<div className="sidebar-divider"/>}
        <button aria-label={item.label} title={collapsed?item.label:undefined} aria-current={active?'page':undefined} onClick={()=>setActiveTab(item.id)}><Icon aria-hidden="true"/><span>{item.label}</span>{item.id==='inbox'&&unread>0&&<b>{unread>99?'99+':unread}</b>}</button>
      </React.Fragment>;})}
      {isAdmin&&<button onClick={()=>setActiveTab('admin')} aria-label="Admin panel" aria-current={activeTab==='admin'?'page':undefined}><ShieldCheck/><span>Admin panel</span></button>}
    </nav>
    <div className="sidebar-footer">
      <div className="sidebar-account-links">
        {!collapsed&&<p className="sidebar-section-label">Account</p>}
        <button onClick={()=>setActiveTab('settings')} aria-label="Account settings" title={collapsed?'Account settings':undefined} aria-current={['settings','integrations','activity'].includes(activeTab)?'page':undefined}><Settings/><span>Settings</span></button>
        <button onClick={()=>setActiveTab('help')} aria-label="Contact and support" title={collapsed?'Contact & support':undefined} aria-current={['help','faq','billing-help','about','privacy','terms'].includes(activeTab)?'page':undefined}><HelpCircle/><span>Contact & support</span></button>
        <button aria-label="Sign out" title={collapsed?'Sign out':undefined} onClick={()=>{if(window.confirm('Sign out of Auto Replies?'))void logout();}}><LogOut/><span>Sign out</span></button>
      </div>
      {!collapsed&&<div className="sidebar-upgrade">
        <div className="sidebar-upgrade-title"><Zap/><strong>{usage.plan.name==='Free'?'Upgrade your workspace':usage.plan.name+' plan'}</strong></div>
        <p>{usage.messageUsed.toLocaleString()} / {usage.messageLimit.toLocaleString()} messages used</p>
        <div className="sidebar-usage-track" role="progressbar" aria-label="Message usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{width:pct+'%',background:pct>=90?'#b45309':undefined}}/></div>
        <button onClick={()=>setActiveTab('billing')}>View plans <ChevronRight/></button>
      </div>}
      {!collapsed&&<div className="sidebar-owner" title={name}><strong>{name}</strong><span>{user.email || 'Workspace owner'}</span></div>}
    </div>
  </aside>;
};
