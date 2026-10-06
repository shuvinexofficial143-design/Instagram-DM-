import React from 'react';
import { BarChart3, BookOpen, CreditCard, HelpCircle, Inbox, LayoutDashboard, Settings, Users, Zap, UserRound, Plug, History } from 'lucide-react';
import { ActiveTab, useApp } from '../context/AppContext';

export const workspaceNavigation = [
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard, tabs: ['home'] },
  { id: 'inbox', label: 'Inbox', icon: Inbox, tabs: ['inbox'] },
  { id: 'automations', label: 'Automations', icon: Zap, tabs: ['automations'] },
  { id: 'contacts', label: 'Leads', icon: Users, tabs: ['contacts', 'crm'] },
  { id: 'knowledge', label: 'Business setup', icon: BookOpen, tabs: ['knowledge', 'catalog', 'lead-forms'] },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, tabs: ['analytics'] },
  { id: 'settings', label: 'Settings', icon: Settings, tabs: ['settings', 'integrations', 'activity'] },
  { id: 'billing', label: 'Billing & usage', icon: CreditCard, tabs: ['billing'] },
  { id: 'help', label: 'Help', icon: HelpCircle, tabs: ['help', 'faq', 'billing-help', 'about', 'privacy', 'terms'] },
] satisfies Array<{id: ActiveTab; label: string; icon: typeof Inbox; tabs: ActiveTab[]}>;

const groups: Array<{title: string; items: Array<{id: ActiveTab; label: string}>}> = [
  { title: 'Leads', items: [{id:'contacts',label:'Contact list'},{id:'crm',label:'Sales pipeline'}] },
  { title: 'Business setup', items: [{id:'knowledge',label:'Business knowledge'},{id:'catalog',label:'Products & catalogs'},{id:'lead-forms',label:'Lead forms'}] },
  { title: 'Settings', items: [{id:'settings',label:'Account'},{id:'integrations',label:'Integrations'},{id:'activity',label:'Activity logs'}] },
  { title: 'Help', items: [{id:'help',label:'Help center'},{id:'faq',label:'FAQ'},{id:'billing-help',label:'Billing help'}] },
];
export const WorkspaceTabs = () => {
  const {activeTab,setActiveTab} = useApp();
  const group = groups.find(g=>g.items.some(item=>item.id===activeTab));
  if (!group) return null;
  return <nav aria-label={group.title+' sections'} className={`workspace-tabs ${group.title === 'Settings' ? 'workspace-settings-tabs' : ''}`}>
    {group.items.map(item=>{
      const Icon = item.id === 'settings' ? UserRound : item.id === 'integrations' ? Plug : History;
      return <button type="button" key={item.id} aria-current={item.id===activeTab?'page':undefined} onClick={()=>setActiveTab(item.id)}>{group.title === 'Settings' && <Icon aria-hidden="true" />}<span>{item.label}</span></button>;
    })}
  </nav>;
};
