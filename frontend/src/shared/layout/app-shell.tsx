interface AppShellProps {
  topBar?: React.ReactNode;
  leftRail?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomBar?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ topBar, leftRail, rightPanel, bottomBar, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {topBar}
      <div className="flex flex-1 min-h-0">
        {leftRail}
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
        {rightPanel}
      </div>
      {bottomBar}
    </div>
  );
}
