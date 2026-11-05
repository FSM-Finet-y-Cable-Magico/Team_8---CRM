import { useEffect, useState } from 'react';
import { ChevronDown, Wifi, type LucideIcon } from 'lucide-react';

export type SidebarNavItem<TTab extends string = string> = {
  tab: TTab;
  label: string;
  visible: boolean;
  icon: LucideIcon;
  children?: Array<{ tab: TTab; label: string; visible: boolean }>;
};

export function Sidebar<TTab extends string>({
  activeTab,
  mainItems,
  secondaryItems,
  onNavigate,
}: {
  activeTab: TTab;
  mainItems: SidebarNavItem<TTab>[];
  secondaryItems: SidebarNavItem<TTab>[];
  onNavigate: (tab: TTab) => void;
}) {
  const visibleSecondaryItems = secondaryItems.filter((item) => item.visible);
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeGroup = mainItems.find(item => item.visible && item.children?.some(child => child.visible && child.tab === activeTab))?.tab;
  useEffect(() => { if (activeGroup) setExpanded(activeGroup); }, [activeTab, activeGroup]);

  return (
    <aside className="sidebar">
      <div className="brand" aria-label="smartCRM">
        <Wifi className="brand-icon" size={34} strokeWidth={2.35} aria-hidden="true" />
        <strong>
          <span>smart</span>CRM
        </strong>
      </div>

      <div className="sidebar-menu">
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {mainItems.filter((item) => item.visible).map((item) => {
            const Icon = item.icon;
            const children = item.children?.filter(child => child.visible) ?? [];
            const isActive = activeTab === item.tab || children.some(child => child.tab === activeTab);
            const isExpanded = expanded === item.tab;
            return (
              <div key={item.tab} className={children.length ? 'sidebar-group' : 'sidebar-link'}>
              <button
                type="button"
                className={isActive ? 'sidebar-item active' : 'sidebar-item'}
                onClick={() => {
                  if (children.length) {
                    setExpanded(isExpanded && isActive ? null : item.tab);
                    if (!isActive) onNavigate(item.tab);
                  } else onNavigate(item.tab);
                }}
                aria-current={!children.length && isActive ? 'page' : undefined}
                aria-expanded={children.length ? isExpanded : undefined}
                aria-controls={children.length ? `sidebar-${item.tab}-submenu` : undefined}
              >
                <Icon className="sidebar-item-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {children.length > 0 && <ChevronDown className={'sidebar-expand ' + (isExpanded ? 'expanded' : '')} size={15} aria-hidden="true"/>}
              </button>
              {children.length > 0 && isExpanded && <div id={`sidebar-${item.tab}-submenu`} className="sidebar-subnav" aria-label={`Secciones de ${item.label}`}>{children.map(child => <button key={child.tab} type="button" className={activeTab === child.tab ? 'sidebar-subitem active' : 'sidebar-subitem'} aria-current={activeTab === child.tab ? 'page' : undefined} onClick={() => onNavigate(child.tab)}>{child.label}</button>)}</div>}
              </div>
            );
          })}
        </nav>

        {visibleSecondaryItems.length > 0 && (
          <nav className="sidebar-nav secondary-nav" aria-label="Administración">
            {visibleSecondaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  className={activeTab === item.tab ? 'sidebar-item active' : 'sidebar-item'}
                  onClick={() => onNavigate(item.tab)}
                  aria-current={activeTab === item.tab ? 'page' : undefined}
                >
                  <Icon className="sidebar-item-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
}
