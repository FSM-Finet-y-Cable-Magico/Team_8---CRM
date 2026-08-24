import { Wifi, type LucideIcon } from 'lucide-react';

export type SidebarNavItem<TTab extends string = string> = {
  tab: TTab;
  label: string;
  visible: boolean;
  icon: LucideIcon;
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
