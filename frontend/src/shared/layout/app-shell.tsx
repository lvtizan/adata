interface AppShellProps {
  topBar?: React.ReactNode;
  leftRail?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomBar?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ topBar, leftRail, rightPanel, bottomBar, children }: AppShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-[#f6f7fb]">
      <div className="flex h-full min-h-0">
        {leftRail}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {topBar}
          <div className="flex min-h-0 flex-1">
            <main className="flex-1 min-w-0 overflow-auto bg-white">
              {children}
            </main>
            {rightPanel}
          </div>
          {bottomBar}
        </div>
      </div>
    </div>
  );
}
